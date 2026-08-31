import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { generateMonthlyPaymentsForTenant } from '../services/generateMonthlyPayments.service.js';
import {
    generateSocialFeesForTenant,
    sanitizeSocialFeeRoles,
} from '../services/generateSocialFees.service.js';
import { getOrCreateSocialFee } from '../models/socialFee.model.js';
import { markOverduePayments, clampRecargoPct } from '../services/overduePayments.service.js';
import {
    applyDiscountToFamilyEnrollments,
    getGlobalFamilyDiscountPct,
    setGlobalFamilyDiscountPct,
} from '../services/familyDiscount.service.js';
import { compareUserByName, sortPaymentsByPriority, sortUsersByName, userNameCollation, userNameMongoSort } from '../utils/listSort.js';
import { createAppNotification } from '../services/appNotification.service.js';
import { isClubMercadoPagoLinked } from '../services/mercadoPagoClub.service.js';
import { getTransferBankData, setTransferBankData } from '../services/transferBank.service.js';
import { parsePageLimit, paginationMeta, buildAthleteSearchFilter, buildUserSearchFilter } from '../utils/pagination.js';
import { sendCuotaReminders } from '../services/cuotaReminders.service.js';
import { ensurePaymentReceipt, queuePaymentReceipt, buildPaymentReceiptPdf } from '../services/paymentReceipt.service.js';

/** Aggregation $match does not cast string ids to ObjectId. */
function toObjectIds(ids) {
    return [...ids]
        .map((id) => {
            try {
                return new mongoose.Types.ObjectId(String(id));
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

// @desc    Crear un nuevo Plan/Cuota
// @route   POST /api/financial/plans
const createPlan = asyncHandler(async (req, res) => {
    const { nombre, monto, descripcion, diaVencimiento, porcentajeRecargo } = req.body;
    const { Plan } = req.models;

    const plan = await Plan.create({
        nombre,
        monto,
        descripcion,
        diaVencimiento: diaVencimiento || 10,
        porcentajeRecargo: clampRecargoPct(porcentajeRecargo),
    });
    res.status(201).json(plan);
});

// @desc    Obtener todos los planes
// @route   GET /api/financial/plans
const getPlans = asyncHandler(async (req, res) => {
    const { Plan } = req.models;
    const plans = await Plan.find({}).sort({ createdAt: -1 });
    res.json(plans);
});

// @desc    Generar masivamente las cuotas del mes para inscripciones activas
// @route   POST /api/financial/payments/generate
const generarCuotasMes = asyncHandler(async (req, res) => {
    const { mes, anio } = req.body;
    const estadisticas = await generateMonthlyPaymentsForTenant(req.models, mes, anio);
    const cuotaSocial = await generateSocialFeesForTenant(req.models, mes, anio);
    res.status(201).json({
        message: 'Proceso de facturación completado.',
        estadisticas,
        cuotaSocial,
    });
});

// @desc    Configuración de la cuota social del club
// @route   GET /api/financial/social-fee
const getSocialFee = asyncHandler(async (req, res) => {
    const { SocialFee } = req.models;
    const config = await getOrCreateSocialFee(SocialFee);
    res.json(config);
});

// @desc    Actualizar la cuota social del club
// @route   PATCH /api/financial/social-fee
const updateSocialFee = asyncHandler(async (req, res) => {
    const { SocialFee } = req.models;
    const config = await getOrCreateSocialFee(SocialFee);
    const { nombre, descripcion, monto, diaVencimiento, porcentajeRecargo, activo, rolesAplicables } =
        req.body || {};

    if (nombre !== undefined) config.nombre = String(nombre).trim() || 'Cuota social';
    if (descripcion !== undefined) config.descripcion = String(descripcion).trim();

    if (monto !== undefined) {
        const n = Number(monto);
        if (Number.isNaN(n) || n < 0) {
            res.status(400);
            throw new Error('El monto de la cuota social debe ser un número mayor o igual a 0.');
        }
        config.monto = n;
    }

    if (diaVencimiento !== undefined) {
        const d = parseInt(diaVencimiento, 10);
        if (Number.isNaN(d) || d < 1 || d > 28) {
            res.status(400);
            throw new Error('El día de vencimiento debe estar entre 1 y 28.');
        }
        config.diaVencimiento = d;
    }

    if (porcentajeRecargo !== undefined) {
        config.porcentajeRecargo = clampRecargoPct(porcentajeRecargo);
    }
    if (rolesAplicables !== undefined) {
        config.rolesAplicables = sanitizeSocialFeeRoles(rolesAplicables);
    }

    if (activo !== undefined) {
        const on = Boolean(activo);
        if (on && !(Number(config.monto) > 0)) {
            res.status(400);
            throw new Error('Definí un monto mayor a 0 antes de activar la cuota social.');
        }
        config.activo = on;
    }

    await config.save();
    res.json(config);
});

// @desc    Generar la cuota social de un período (sin tocar las de entrenamiento)
// @route   POST /api/financial/social-fee/generate
const generarCuotaSocialMes = asyncHandler(async (req, res) => {
    const now = new Date();
    const mes = Number(req.body?.mes) || now.getMonth() + 1;
    const anio = Number(req.body?.anio) || now.getFullYear();

    if (mes < 1 || mes > 12 || anio < 2000) {
        res.status(400);
        throw new Error('Período inválido.');
    }

    const estadisticas = await generateSocialFeesForTenant(req.models, mes, anio);
    res.status(201).json({
        message: estadisticas.omitido
            ? estadisticas.motivo
            : 'Cuotas sociales generadas.',
        estadisticas,
    });
});

// @desc    Obtener pagos agrupados por atleta (paginado por atleta)
// @route   GET /api/financial/payments?mes=5&anio=2026&estado=pendiente&page=1&limit=50
const getAllPayments = asyncHandler(async (req, res) => {
    const { Payment, Category, User } = req.models;
    const { mes, anio, estado, categoria, disciplina, search } = req.query;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 50, maxLimit: 100 });

    const isAllVencidos = estado === 'vencido';

    const filter = {};
    if (!isAllVencidos) {
        if (mes) filter.mes = parseInt(mes, 10);
        if (anio) filter.anio = parseInt(anio, 10);
    }
    if (estado && estado !== 'todos') filter.estado = estado;

    let categoryFilter = {};
    if (categoria) {
        categoryFilter = { categoria };
    } else if (disciplina) {
        const cats = await Category.find({ disciplina }).select('_id').lean();
        categoryFilter = { categoria: { $in: cats.map((c) => c._id) } };
    }
    Object.assign(filter, categoryFilter);

    if (search && String(search).trim()) {
        const athleteFilter = buildAthleteSearchFilter(search);
        const matchingUsers = await User.find(athleteFilter).select('_id').lean();
        const ids = matchingUsers.map((u) => u._id);
        filter.atleta = { $in: ids.length ? ids : [null] };
    }

    const athletePagePipeline = [
        { $match: filter },
        {
            $lookup: {
                from: 'users',
                localField: 'atleta',
                foreignField: '_id',
                as: 'atletaUser',
            },
        },
        { $unwind: '$atletaUser' },
        {
            $group: {
                _id: '$atleta',
                nombre: { $first: '$atletaUser.nombre' },
                apellido: { $first: '$atletaUser.apellido' },
            },
        },
        { $sort: { nombre: 1, apellido: 1, _id: 1 } },
    ];

    const collation = { locale: 'es', strength: 1 };
    const [countAgg, pageAgg] = await Promise.all([
        Payment.aggregate([...athletePagePipeline, { $count: 'total' }]).collation(collation),
        Payment.aggregate([...athletePagePipeline, { $skip: skip }, { $limit: limit }]).collation(collation),
    ]);

    const totalAthletes = countAgg[0]?.total ?? 0;

    if (!pageAgg.length) {
        return res.json({
            athletes: [],
            ...paginationMeta(page, limit, totalAthletes),
        });
    }

    const athleteIds = pageAgg.map((row) => row._id);

    const payments = await Payment.find({ ...filter, atleta: { $in: athleteIds } })
        .sort(isAllVencidos ? { anio: -1, mes: -1, createdAt: -1 } : { estado: 1, createdAt: -1 })
        .populate('atleta', 'nombre apellido email tutorPrincipal rol')
        .populate('plan', 'nombre monto diaVencimiento porcentajeRecargo')
        .populate('cuotaSocial', 'nombre monto diaVencimiento porcentajeRecargo')
        .populate({ path: 'categoria', select: 'nombre disciplina', populate: { path: 'disciplina', select: 'nombre' } })
        .lean();

    const byAtleta = new Map();
    for (const p of payments) {
        const key = String(p.atleta?._id || p.atleta);
        if (!byAtleta.has(key)) byAtleta.set(key, []);
        byAtleta.get(key).push(p);
    }

    const athletes = athleteIds.map((aid) => {
        const sorted = sortPaymentsByPriority(byAtleta.get(String(aid)) || []);
        const primary = sorted[0] || null;
        const payTarget =
            sorted.find((x) => x.estado === 'pendiente' || x.estado === 'vencido') || primary;
        return {
            atleta: primary?.atleta || null,
            payments: sorted,
            primary,
            payTarget,
        };
    });

    res.json({
        athletes,
        ...paginationMeta(page, limit, totalAthletes),
    });
});

// @desc    Estadísticas de cobranza del mes (agregación MongoDB)
// @route   GET /api/financial/payments/stats?mes=5&anio=2026
// @route   GET /api/financial/payments/stats?scope=vencidos
const getPaymentStats = asyncHandler(async (req, res) => {
    const { Payment, Category } = req.models;
    const { mes, anio, categoria, disciplina, scope } = req.query;

    let categoryFilter = {};
    if (categoria) {
        categoryFilter = { categoria };
    } else if (disciplina) {
        const cats = await Category.find({ disciplina }).select('_id').lean();
        categoryFilter = { categoria: { $in: cats.map((c) => c._id) } };
    }

    if (scope === 'vencidos') {
        const rows = await Payment.aggregate([
            { $match: { estado: 'vencido', ...categoryFilter } },
            { $group: { _id: null, count: { $sum: 1 }, monto: { $sum: '$montoFinal' } } },
        ]);
        const vencidos = rows[0]?.count || 0;
        const totalVencido = rows[0]?.monto || 0;
        return res.json({
            totalFacturado: totalVencido,
            totalCobrado: 0,
            pendientes: 0,
            pagados: 0,
            vencidos,
            total: vencidos,
            porcentajeCobranza: 0,
            porcentajePrev: 0,
            totalCobradoPrev: 0,
        });
    }

    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);
    const match = { ...categoryFilter };
    if (mes) match.mes = mesNum;
    if (anio) match.anio = anioNum;

    const [rows, total] = await Promise.all([
        Payment.aggregate([
            { $match: match },
            { $group: { _id: '$estado', count: { $sum: 1 }, monto: { $sum: '$montoFinal' } } },
        ]),
        Payment.countDocuments(match),
    ]);

    const byEstado = {};
    let totalFacturado = 0;
    let totalCobrado = 0;
    for (const row of rows) {
        byEstado[row._id] = row.count;
        totalFacturado += row.monto || 0;
        if (row._id === 'pagado') totalCobrado += row.monto || 0;
    }

    let porcentajePrev = 0;
    let totalCobradoPrev = 0;
    if (Number.isFinite(mesNum) && Number.isFinite(anioNum)) {
        let mesAnt = mesNum - 1;
        let anioAnt = anioNum;
        if (mesAnt < 1) {
            mesAnt = 12;
            anioAnt -= 1;
        }
        const prevRows = await Payment.aggregate([
            { $match: { mes: mesAnt, anio: anioAnt, ...categoryFilter } },
            {
                $group: {
                    _id: null,
                    totalFacturado: { $sum: '$montoFinal' },
                    totalCobrado: {
                        $sum: { $cond: [{ $eq: ['$estado', 'pagado'] }, '$montoFinal', 0] },
                    },
                },
            },
        ]);
        const prev = prevRows[0];
        totalCobradoPrev = prev?.totalCobrado || 0;
        const totalFacturadoPrev = prev?.totalFacturado || 0;
        porcentajePrev =
            totalFacturadoPrev > 0 ? Math.round((totalCobradoPrev / totalFacturadoPrev) * 100) : 0;
    }

    res.json({
        totalFacturado,
        totalCobrado,
        pendientes: byEstado.pendiente || 0,
        pagados: byEstado.pagado || 0,
        vencidos: byEstado.vencido || 0,
        enRevision: byEstado.en_revision || 0,
        total,
        porcentajeCobranza: totalFacturado > 0 ? Math.round((totalCobrado / totalFacturado) * 100) : 0,
        porcentajePrev,
        totalCobradoPrev,
    });
});

// @desc    Marcar cuotas vencidas manualmente (el cron diario hace esto automáticamente)
// @route   POST /api/financial/payments/check-overdue
const checkOverdue = asyncHandler(async (req, res) => {
    const modified = await markOverduePayments(req.models);

    res.json({
        message: `Se marcaron ${modified} cuota(s) como vencidas.`,
        vencidas: modified,
    });
});

// @desc    Ajustar monto de una cuota individual
// @route   PATCH /api/financial/payments/:id/adjust
const adjustPayment = asyncHandler(async (req, res) => {
    const { montoFinal, notasAdmin } = req.body;
    const { Payment } = req.models;

    const payment = await Payment.findById(req.params.id);
    if (!payment) { res.status(404); throw new Error('Cuota no encontrada'); }
    if (payment.estado === 'pagado') { res.status(400); throw new Error('No se puede ajustar una cuota ya pagada'); }

    if (montoFinal !== undefined) {
        payment.descuentoAplicado = payment.montoOriginal - montoFinal;
        payment.montoFinal = montoFinal;
    }
    if (notasAdmin !== undefined) payment.notasAdmin = notasAdmin;

    const updated = await payment.save();
    await updated.populate('plan', 'nombre monto');
    await updated.populate('atleta', 'nombre apellido');

    res.json(updated);
});

// @desc    Obtener grupos de hermanos (mismo tutorPrincipal), paginado por familia
// @route   GET /api/financial/siblings?mes=&anio=&page=1&limit=30&search=
const getSiblings = asyncHandler(async (req, res) => {
    const { User, Enrollment, Payment } = req.models;
    const mesQ = req.query.mes ? parseInt(req.query.mes, 10) : null;
    const anioQ = req.query.anio ? parseInt(req.query.anio, 10) : null;
    const search = String(req.query.search || '').trim();
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });

    const globalPct = await getGlobalFamilyDiscountPct(req.models);

    const athleteMatch = { rol: 'atleta', tutorPrincipal: { $ne: null } };

    if (search) {
        const tutorIds = new Set();
        const athleteFilter = buildAthleteSearchFilter(search);
        if (athleteFilter) {
            const matchingAthletes = await User.find(athleteFilter).select('tutorPrincipal').lean();
            matchingAthletes.forEach((a) => {
                if (a.tutorPrincipal) tutorIds.add(String(a.tutorPrincipal));
            });
        }
        const tutorFilter = buildUserSearchFilter(search, { rol: 'tutor' });
        if (tutorFilter) {
            const matchingTutors = await User.find(tutorFilter).select('_id').lean();
            matchingTutors.forEach((t) => tutorIds.add(String(t._id)));
        }
        const adminFilter = buildUserSearchFilter(search, { rol: 'admin_club' });
        if (adminFilter) {
            const matchingAdmins = await User.find(adminFilter).select('_id').lean();
            matchingAdmins.forEach((t) => tutorIds.add(String(t._id)));
        }
        if (!tutorIds.size) {
            return res.json({
                globalDescuento: globalPct,
                familias: [],
                ...paginationMeta(page, limit, 0),
            });
        }
        // Aggregation $match does not cast string ids — must use ObjectId.
        athleteMatch.tutorPrincipal = { $in: toObjectIds(tutorIds) };
    }

    const tutorPagePipeline = [
        { $match: athleteMatch },
        {
            $lookup: {
                from: 'users',
                localField: 'tutorPrincipal',
                foreignField: '_id',
                as: 'tutorUser',
            },
        },
        { $unwind: '$tutorUser' },
        {
            $group: {
                _id: '$tutorPrincipal',
                nombre: { $first: '$tutorUser.nombre' },
                apellido: { $first: '$tutorUser.apellido' },
            },
        },
        { $sort: { nombre: 1, apellido: 1, _id: 1 } },
    ];

    const collation = { locale: 'es', strength: 1 };
    const [countAgg, pageAgg] = await Promise.all([
        User.aggregate([...tutorPagePipeline, { $count: 'total' }]).collation(collation),
        User.aggregate([...tutorPagePipeline, { $skip: skip }, { $limit: limit }]).collation(collation),
    ]);

    const totalFamilias = countAgg[0]?.total ?? 0;
    const pageTutorIds = pageAgg.map((row) => row._id);

    if (!pageTutorIds.length) {
        return res.json({
            globalDescuento: globalPct,
            familias: [],
            ...paginationMeta(page, limit, totalFamilias),
        });
    }

    const tutorDocs = await User.find({ _id: { $in: pageTutorIds } })
        .select('nombre apellido descuentoFamiliar')
        .lean();
    const tutorById = new Map(tutorDocs.map((t) => [String(t._id), t]));

    const atletasConTutor = await User.find({
        rol: 'atleta',
        tutorPrincipal: { $in: pageTutorIds },
    })
        .select('nombre apellido tutorPrincipal')
        .lean();

    const atletaIds = atletasConTutor.map((a) => a._id);

    const impagas = await Payment.find({
        atleta: { $in: atletaIds },
        estado: { $in: ['pendiente', 'vencido'] },
    })
        .populate('plan', 'nombre monto')
        .populate('categoria', 'nombre')
        .lean();

    let cuotasMes = [];
    if (mesQ && anioQ) {
        cuotasMes = await Payment.find({ atleta: { $in: atletaIds }, mes: mesQ, anio: anioQ })
            .populate('plan', 'nombre monto')
            .populate('categoria', 'nombre')
            .lean();
    }

    const impagasByAtleta = {};
    const mesByAtleta = {};
    for (const p of impagas) {
        const aid = String(p.atleta);
        if (!impagasByAtleta[aid]) impagasByAtleta[aid] = [];
        impagasByAtleta[aid].push(p);
    }
    for (const p of cuotasMes) {
        mesByAtleta[String(p.atleta)] = p;
    }

    const activeEnrollments = await Enrollment.find({
        atleta: { $in: atletaIds },
        estado: 'activo',
    })
        .select('atleta descuentoPorcentaje motivoDescuento')
        .lean();
    const enrollmentByAtleta = {};
    for (const e of activeEnrollments) {
        enrollmentByAtleta[String(e.atleta)] = e;
    }

    const grupos = {};
    for (const a of atletasConTutor) {
        const tid = String(a.tutorPrincipal);
        if (!grupos[tid]) {
            grupos[tid] = { tutor: tutorById.get(tid) || null, hijos: [] };
        }
        const insc = enrollmentByAtleta[String(a._id)];
        const aid = String(a._id);
        grupos[tid].hijos.push({
            _id: a._id,
            nombre: a.nombre,
            apellido: a.apellido,
            descuentoPorcentaje: insc?.descuentoPorcentaje || 0,
            motivoDescuento: insc?.motivoDescuento || '',
            cuotaMes: mesByAtleta[aid] || null,
            cuotasImpagas: impagasByAtleta[aid] || [],
        });
    }

    const familias = pageTutorIds
        .map((tid) => {
            const g = grupos[String(tid)];
            if (!g?.tutor || !g.hijos.length) return null;
            g.hijos = sortUsersByName(g.hijos);
            const tutorPct = g.tutor.descuentoFamiliar;
            const fromEnrollments = Math.max(0, ...g.hijos.map((h) => h.descuentoPorcentaje || 0));
            const tieneOverride = tutorPct != null && !Number.isNaN(Number(tutorPct));
            const descuentoFamiliar = tieneOverride
                ? Math.min(100, Math.max(0, Number(tutorPct)))
                : fromEnrollments > 0
                  ? fromEnrollments
                  : globalPct;
            const cuotasImpagas = g.hijos.flatMap((h) => h.cuotasImpagas || []);
            const totalImpago = cuotasImpagas.reduce((s, p) => s + (p.montoFinal || 0), 0);
            return {
                ...g,
                descuentoFamiliar,
                descuentoEsPersonalizado: tieneOverride,
                cuotasImpagas,
                totalImpago,
                cantidadImpagas: cuotasImpagas.length,
            };
        })
        .filter(Boolean);

    res.json({
        globalDescuento: globalPct,
        familias,
        ...paginationMeta(page, limit, totalFamilias),
    });
});

// @desc    Aplicar descuento por hermanos a todas las inscripciones de los hijos de un tutor
// @route   PATCH /api/financial/siblings/discount
const applySiblingDiscount = asyncHandler(async (req, res) => {
    const { tutorId, porcentaje } = req.body;
    const { User } = req.models;

    const hijos = await User.find({ rol: 'atleta', tutorPrincipal: tutorId });
    if (!hijos.length) {
        res.status(400);
        throw new Error('No hay atletas vinculados a esta familia.');
    }
    if (hijos.length < 2) {
        res.status(400);
        throw new Error('El descuento familiar solo aplica a familias con 2 o más atletas.');
    }

    const pct = parseInt(porcentaje, 10);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        res.status(400);
        throw new Error('Porcentaje inválido (0-100).');
    }

    const { actualizados } = await applyDiscountToFamilyEnrollments(req.models, tutorId, pct, {
        updateTutor: true,
    });

    res.json({
        message: `Descuento del ${pct}% aplicado a las inscripciones activas de la familia (${hijos.length} atleta(s)).`,
        actualizados,
    });
});

// @desc    Obtener / actualizar descuento familiar global del club
// @route   GET|PATCH /api/financial/family-discount/global
const getGlobalFamilyDiscount = asyncHandler(async (req, res) => {
    const pct = await getGlobalFamilyDiscountPct(req.models);
    res.json({ descuentoFamiliarGlobal: pct });
});

const updateGlobalFamilyDiscount = asyncHandler(async (req, res) => {
    const { porcentaje } = req.body;
    const pct = await setGlobalFamilyDiscountPct(req.models, porcentaje);
    res.json({
        message: `Descuento global familiar actualizado al ${pct}%. Las familias nuevas lo recibirán automáticamente.`,
        descuentoFamiliarGlobal: pct,
    });
});

// @desc    Datos bancarios del club para transferencias
// @route   GET|PATCH /api/financial/transfer-bank
const getTransferBankSettings = asyncHandler(async (req, res) => {
    const datosTransferencia = await getTransferBankData(req.models);
    res.json({ datosTransferencia });
});

const updateTransferBankSettings = asyncHandler(async (req, res) => {
    const datosTransferencia = await setTransferBankData(req.models, req.body);
    res.json({
        message: 'Datos bancarios actualizados.',
        datosTransferencia,
    });
});

// @desc    Reactivar un plan archivado
// @route   PATCH /api/financial/plans/:id/reactivate
const reactivatePlan = asyncHandler(async (req, res) => {
    const { Plan } = req.models;
    const plan = await Plan.findByIdAndUpdate(req.params.id, { activo: true }, { returnDocument: 'after' });
    if (!plan) {
        res.status(404);
        throw new Error('Plan no encontrado');
    }
    res.json({ message: 'Plan reactivado.', plan });
});

async function mercadoPagoReady(models) {
    return isClubMercadoPagoLinked(models);
}

function paymentEstadoTrasRechazo(payment) {
    if (payment.fechaVencimiento && new Date(payment.fechaVencimiento) < new Date()) {
        return 'vencido';
    }
    return 'pendiente';
}

async function assertMemberCanPayPayments(req, payments) {
    const { User } = req.models;
    const list = Array.isArray(payments) ? payments : [payments];

    for (const payment of list) {
        const atletaId = String(payment.atleta?._id || payment.atleta);

        if (req.user.rol === 'tutor') {
            // El tutor también es titular de su propia cuota social.
            if (atletaId !== String(req.user._id)) {
                const hijo = await User.findById(atletaId).select('tutorPrincipal rol').lean();
                if (!hijo || hijo.rol !== 'atleta' || String(hijo.tutorPrincipal) !== String(req.user._id)) {
                    res.status(403);
                    throw new Error('No podés pagar cuotas de este atleta.');
                }
            }
        } else if (req.user.rol === 'socio') {
            if (atletaId !== String(req.user._id)) {
                res.status(403);
                throw new Error('Solo podés pagar tus cuotas.');
            }
        } else if (req.user.rol === 'atleta') {
            if (atletaId !== String(req.user._id)) {
                res.status(403);
                throw new Error('Solo podés pagar tus cuotas.');
            }
            const me = await User.findById(req.user._id).select('cuotasEnApp').lean();
            if (me?.cuotasEnApp === false) {
                res.status(403);
                throw new Error('Las cuotas en la app no están habilitadas para tu cuenta.');
            }
        } else {
            res.status(403);
            throw new Error('No autorizado.');
        }

        if (!['pendiente', 'vencido'].includes(payment.estado)) {
            res.status(400);
            throw new Error('Esta cuota no puede pagarse en su estado actual.');
        }
    }
}

function newTransferGrupoId() {
    return crypto.randomUUID();
}

function transferGrupoKey(payment) {
    if (payment.transferGrupoId) return String(payment.transferGrupoId);
    const ts = payment.fechaEnvioComprobante
        ? new Date(payment.fechaEnvioComprobante).getTime()
        : 0;
    const enviado = payment.enviadoPor?._id || payment.enviadoPor || '';
    return `legacy:${payment.comprobante || ''}|${enviado}|${ts}`;
}

function groupPendingTransfers(payments) {
    const map = new Map();
    for (const p of payments) {
        const key = transferGrupoKey(p);
        if (!map.has(key)) {
            map.set(key, {
                id: key,
                comprobante: p.comprobante,
                fechaEnvioComprobante: p.fechaEnvioComprobante,
                enviadoPor: p.enviadoPor,
                payments: [],
                totalMonto: 0,
            });
        }
        const group = map.get(key);
        group.payments.push(p);
        group.totalMonto += p.montoFinal || 0;
    }
    return [...map.values()].sort(
        (a, b) => new Date(b.fechaEnvioComprobante || 0) - new Date(a.fechaEnvioComprobante || 0),
    );
}

async function notifyPaymentRegistered(req, payment) {
    const { User } = req.models;
    try {
        const atleta = await User.findById(payment.atleta);
        // Los menores cobran a través del tutor; socios y tutores son sus propios titulares.
        const destinatario =
            atleta?.rol === 'atleta' && atleta?.tutorPrincipal ? atleta.tutorPrincipal : payment.atleta;
        const concepto =
            payment.tipo === 'social'
                ? payment.cuotaSocial?.nombre || 'cuota social'
                : payment.plan?.nombre || 'cuota';
        await createAppNotification(req.models, {
            usuario: destinatario,
            tipo: 'pago_registrado',
            titulo: 'Pago registrado',
            mensaje: `Se registró el pago de ${concepto} por $${payment.montoFinal}.`,
            referencia: payment._id,
        });
    } catch (e) {
        console.log('Error creando notificación de pago:', e.message);
    }
}

// @desc    Enviar comprobante de transferencia (una cuota)
// @route   POST /api/financial/payments/:id/submit-transfer
const submitTransferProof = asyncHandler(async (req, res) => {
    const { comprobante } = req.body;
    const url = typeof comprobante === 'string' ? comprobante.trim() : '';
    if (!url) {
        res.status(400);
        throw new Error('Subí una foto del comprobante de transferencia.');
    }

    const { Payment } = req.models;
    const payment = await Payment.findById(req.params.id).populate('plan', 'nombre');
    if (!payment) {
        res.status(404);
        throw new Error('La cuota no existe.');
    }

    await assertMemberCanPayPayments(req, payment);

    const grupoId = newTransferGrupoId();
    payment.estado = 'en_revision';
    payment.metodoPago = 'transferencia';
    payment.comprobante = url;
    payment.fechaEnvioComprobante = new Date();
    payment.enviadoPor = req.user._id;
    payment.motivoRechazo = '';
    payment.transferGrupoId = grupoId;

    const updated = await payment.save();
    await updated.populate('plan', 'nombre');
    res.json(updated);
});

// @desc    Enviar comprobante de transferencia (varias cuotas, un comprobante)
// @route   POST /api/financial/payments/submit-transfer-bulk
const submitBulkTransferProof = asyncHandler(async (req, res) => {
    const { paymentIds, comprobante } = req.body;
    const url = typeof comprobante === 'string' ? comprobante.trim() : '';
    if (!url) {
        res.status(400);
        throw new Error('Subí una foto del comprobante de transferencia.');
    }
    if (!Array.isArray(paymentIds) || !paymentIds.length) {
        res.status(400);
        throw new Error('Indicá al menos una cuota.');
    }

    const { Payment } = req.models;
    const ids = [...new Set(paymentIds.map((id) => String(id)))];
    const payments = await Payment.find({ _id: { $in: ids } }).populate('plan', 'nombre');

    if (payments.length !== ids.length) {
        res.status(400);
        throw new Error('Hay cuotas inválidas en la solicitud.');
    }

    await assertMemberCanPayPayments(req, payments);

    const now = new Date();
    const grupoId = newTransferGrupoId();
    const updated = [];
    for (const payment of payments) {
        payment.estado = 'en_revision';
        payment.metodoPago = 'transferencia';
        payment.comprobante = url;
        payment.fechaEnvioComprobante = now;
        payment.enviadoPor = req.user._id;
        payment.motivoRechazo = '';
        payment.transferGrupoId = grupoId;
        await payment.save();
        updated.push(payment);
    }

    res.json({ count: updated.length, transferGrupoId: grupoId, payments: updated });
});

// @desc    Listar transferencias pendientes de revisión (admin)
// @route   GET /api/financial/payments/pending-review
const getPendingTransferReviews = asyncHandler(async (req, res) => {
    const { Payment } = req.models;
    const payments = await Payment.find({ estado: 'en_revision' })
        .sort({ fechaEnvioComprobante: -1, updatedAt: -1 })
        .populate('plan', 'nombre monto')
        .populate('categoria', 'nombre')
        .populate('atleta', 'nombre apellido')
        .populate('enviadoPor', 'nombre apellido rol')
        .lean();

    const groups = groupPendingTransfers(payments);
    res.json({ groups, total: groups.length });
});

// @desc    Aprobar un comprobante (una o varias cuotas del mismo envío)
// @route   PATCH /api/financial/payments/transfer-review/approve
const approveTransferReviewBatch = asyncHandler(async (req, res) => {
    const { paymentIds } = req.body;
    if (!Array.isArray(paymentIds) || !paymentIds.length) {
        res.status(400);
        throw new Error('Indicá al menos una cuota.');
    }

    const { Payment } = req.models;
    const ids = [...new Set(paymentIds.map((id) => String(id)))];
    const payments = await Payment.find({ _id: { $in: ids } }).populate('plan', 'nombre');

    if (payments.length !== ids.length) {
        res.status(400);
        throw new Error('Hay cuotas inválidas en la solicitud.');
    }

    for (const payment of payments) {
        if (payment.estado !== 'en_revision') {
            res.status(400);
            throw new Error('Una o más cuotas ya no están en revisión.');
        }
    }

    const now = new Date();
    const updated = [];
    for (const payment of payments) {
        payment.estado = 'pagado';
        payment.metodoPago = 'transferencia';
        payment.fechaPago = now;
        payment.motivoRechazo = '';
        await payment.save();
        await notifyPaymentRegistered(req, payment);
        queuePaymentReceipt(req.models, payment._id, req.clubIdentifier);
        updated.push(payment);
    }

    res.json({ count: updated.length, payments: updated });
});

// @desc    Rechazar un comprobante (una o varias cuotas del mismo envío)
// @route   PATCH /api/financial/payments/transfer-review/reject
const rejectTransferReviewBatch = asyncHandler(async (req, res) => {
    const { paymentIds, motivoRechazo } = req.body;
    const motivo = typeof motivoRechazo === 'string' ? motivoRechazo.trim() : '';
    if (!motivo) {
        res.status(400);
        throw new Error('Indicá el motivo del rechazo.');
    }
    if (!Array.isArray(paymentIds) || !paymentIds.length) {
        res.status(400);
        throw new Error('Indicá al menos una cuota.');
    }

    const { Payment, User } = req.models;
    const ids = [...new Set(paymentIds.map((id) => String(id)))];
    const payments = await Payment.find({ _id: { $in: ids } }).populate('plan', 'nombre');

    if (payments.length !== ids.length) {
        res.status(400);
        throw new Error('Hay cuotas inválidas en la solicitud.');
    }

    for (const payment of payments) {
        if (payment.estado !== 'en_revision') {
            res.status(400);
            throw new Error('Una o más cuotas ya no están en revisión.');
        }
    }

    const updated = [];
    const notifyByDest = new Map();

    for (const payment of payments) {
        payment.estado = paymentEstadoTrasRechazo(payment);
        payment.motivoRechazo = motivo;
        payment.comprobante = '';
        payment.fechaEnvioComprobante = null;
        payment.enviadoPor = null;
        payment.transferGrupoId = null;
        await payment.save();
        updated.push(payment);

        const atleta = await User.findById(payment.atleta);
        const destinatario = String(atleta?.tutorPrincipal || payment.atleta);
        if (!notifyByDest.has(destinatario)) notifyByDest.set(destinatario, []);
        notifyByDest.get(destinatario).push(payment);
    }

    for (const [destinatario, plist] of notifyByDest) {
        try {
            const cuotasTxt = plist.map((p) => p.plan?.nombre || 'cuota').join(', ');
            await createAppNotification(req.models, {
                usuario: destinatario,
                tipo: 'general',
                titulo: 'Comprobante rechazado',
                mensaje: `El comprobante de ${cuotasTxt} fue rechazado: ${motivo}`,
                referencia: plist[0]._id,
            });
        } catch (e) {
            console.log('Error notificación rechazo transferencia:', e.message);
        }
    }

    res.json({ count: updated.length, payments: updated });
});

async function paymentIdsInTransferGroup(req, anchorId) {
    const { Payment } = req.models;
    const payment = await Payment.findById(anchorId).lean();
    if (!payment) {
        res.status(404);
        throw new Error('La cuota no existe.');
    }

    if (payment.transferGrupoId) {
        const siblings = await Payment.find({
            transferGrupoId: payment.transferGrupoId,
            estado: 'en_revision',
        })
            .select('_id')
            .lean();
        return siblings.map((p) => p._id);
    }

    if (payment.comprobante && payment.fechaEnvioComprobante && payment.enviadoPor) {
        const siblings = await Payment.find({
            estado: 'en_revision',
            comprobante: payment.comprobante,
            enviadoPor: payment.enviadoPor,
            fechaEnvioComprobante: payment.fechaEnvioComprobante,
        })
            .select('_id')
            .lean();
        if (siblings.length > 1) return siblings.map((p) => p._id);
    }

    return [payment._id];
}

// @desc    Aprobar transferencia enviada por tutor/atleta (incluye el grupo si aplica)
// @route   PATCH /api/financial/payments/:id/approve-transfer
const approveTransferPayment = asyncHandler(async (req, res) => {
    const paymentIds = await paymentIdsInTransferGroup(req, req.params.id);
    req.body = { ...(req.body || {}), paymentIds };
    return approveTransferReviewBatch(req, res);
});

// @desc    Rechazar transferencia enviada por tutor/atleta (incluye el grupo si aplica)
// @route   PATCH /api/financial/payments/:id/reject-transfer
const rejectTransferPayment = asyncHandler(async (req, res) => {
    const paymentIds = await paymentIdsInTransferGroup(req, req.params.id);
    req.body = { ...(req.body || {}), paymentIds };
    return rejectTransferReviewBatch(req, res);
});

// @desc    Registrar un pago MANUAL (Efectivo/Transferencia)
// @route   PATCH /api/financial/payments/:id/pay
const registerManualPayment = asyncHandler(async (req, res) => {
    const { metodoPago, comprobante, notasAdmin } = req.body;
    const { Payment, Notification, User } = req.models;

    const payment = await Payment.findById(req.params.id).populate('plan', 'nombre');

    if (!payment) {
        res.status(404);
        throw new Error('El recibo no existe');
    }

    if (payment.estado === 'pagado') {
        res.status(400);
        throw new Error('Esta cuota ya se encuentra pagada');
    }

    payment.estado = 'pagado';
    payment.metodoPago = metodoPago || 'efectivo';
    payment.fechaPago = Date.now();
    payment.motivoRechazo = '';
    if (comprobante) payment.comprobante = comprobante;
    if (notasAdmin) payment.notasAdmin = notasAdmin;

    const updatedPayment = await payment.save();
    
    await updatedPayment.populate('plan', 'nombre');

    await notifyPaymentRegistered(req, updatedPayment);
    queuePaymentReceipt(req.models, updatedPayment._id, req.clubIdentifier);

    res.json(updatedPayment);
});

// @desc    Registrar varios pagos manuales (familia / lote)
// @route   PATCH /api/financial/payments/pay-bulk
const registerBulkManualPayment = asyncHandler(async (req, res) => {
    const { paymentIds, metodoPago, notasAdmin } = req.body;
    const { Payment, Notification, User } = req.models;

    if (!Array.isArray(paymentIds) || !paymentIds.length) {
        res.status(400);
        throw new Error('Indicá al menos una cuota a pagar.');
    }

    const ids = [...new Set(paymentIds.map((id) => String(id)))];
    const payments = await Payment.find({ _id: { $in: ids } }).populate('plan', 'nombre');

    if (payments.length !== ids.length) {
        res.status(400);
        throw new Error('Hay cuotas inválidas en la solicitud.');
    }

    const yaPagadas = payments.filter((p) => p.estado === 'pagado');
    if (yaPagadas.length) {
        res.status(400);
        throw new Error('Una o más cuotas ya están pagadas.');
    }

    const now = Date.now();
    const metodo = metodoPago || 'efectivo';
    let total = 0;

    for (const payment of payments) {
        payment.estado = 'pagado';
        payment.metodoPago = metodo;
        payment.fechaPago = now;
        if (notasAdmin) payment.notasAdmin = notasAdmin;
        await payment.save();
        total += payment.montoFinal || 0;
        queuePaymentReceipt(req.models, payment._id, req.clubIdentifier);

        try {
            const atleta = await User.findById(payment.atleta);
            const destinatario = atleta?.tutorPrincipal || payment.atleta;
            await createAppNotification(req.models, {
                usuario: destinatario,
                tipo: 'pago_registrado',
                titulo: 'Pago Registrado',
                mensaje: `Se registró el pago de ${payment.plan?.nombre || 'cuota'} por $${payment.montoFinal}.`,
                referencia: payment._id,
            });
        } catch (e) {
            console.log('Error notificación pago bulk:', e.message);
        }
    }

    res.json({
        message: `Se registraron ${payments.length} pago(s) por $${total}.`,
        pagados: payments.length,
        total,
    });
});

// @desc    Cuotas de todos los hijos del tutor autenticado
// @route   GET /api/financial/payments/tutor-family
const getTutorFamilyPayments = asyncHandler(async (req, res) => {
    const { User, Payment } = req.models;

    if (req.user.rol !== 'tutor') {
        res.status(403);
        throw new Error('Solo disponible para tutores.');
    }

    const hijos = await User.find({ rol: 'atleta', tutorPrincipal: req.user._id })
        .select('nombre apellido fechaNacimiento')
        .collation(userNameCollation)
        .sort(userNameMongoSort)
        .lean();

    const mpReady = await mercadoPagoReady(req.models);
    const datosTransferencia = await getTransferBankData(req.models);

    // El tutor es titular de su propia cuota social además de las cuotas de sus hijos.
    const ids = [req.user._id, ...hijos.map((h) => h._id)];

    const payments = await Payment.find({ atleta: { $in: ids } })
        .sort({ anio: -1, mes: -1 })
        .populate('plan', 'nombre monto')
        .populate('cuotaSocial', 'nombre monto')
        .populate('categoria', 'nombre')
        .lean();

    if (!payments.length) {
        return res.json({
            hijos,
            payments: [],
            impagas: [],
            stats: { totalPagado: 0, totalPendiente: 0, cuotasVencidas: 0, total: 0 },
            mercadoPagoReady: mpReady,
            datosTransferencia,
        });
    }

    const impagas = payments.filter((p) => ['pendiente', 'vencido'].includes(p.estado));
    const totalPagado = payments.filter((p) => p.estado === 'pagado').reduce((s, p) => s + p.montoFinal, 0);
    const totalPendiente = payments
        .filter((p) => ['pendiente', 'vencido', 'en_revision'].includes(p.estado))
        .reduce((s, p) => s + p.montoFinal, 0);

    res.json({
        hijos,
        payments,
        impagas,
        stats: {
            totalPagado,
            totalPendiente,
            cuotasVencidas: impagas.filter((p) => p.estado === 'vencido').length,
            total: payments.length,
        },
        mercadoPagoReady: mpReady,
        datosTransferencia,
    });
});

async function assertMemberCanViewAtletaPayments(req, atletaId) {
    const { User } = req.models;
    const target = String(atletaId);
    const rol = req.user.rol;
    const deny = (code, msg) => {
        const err = new Error(msg);
        err.statusCode = code;
        throw err;
    };

    if (rol === 'atleta') {
        if (target !== String(req.user._id)) {
            deny(403, 'Solo podés ver tus propios pagos.');
        }
        const me = await User.findById(req.user._id).select('cuotasEnApp rol').lean();
        if (me && me.cuotasEnApp === false) {
            deny(403, 'Las cuotas en la app no están habilitadas para tu cuenta. Consultá en administración.');
        }
        return;
    }
    if (rol === 'socio') {
        if (target !== String(req.user._id)) {
            deny(403, 'Solo podés ver tus propios pagos.');
        }
        return;
    }
    if (rol === 'tutor') {
        // El tutor también es titular de su propia cuota social.
        if (target === String(req.user._id)) return;
        const hijo = await User.findById(target).select('tutorPrincipal rol').lean();
        if (!hijo || hijo.rol !== 'atleta') {
            deny(400, 'Atleta no válido.');
        }
        if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            deny(403, 'No tenés permiso para ver los pagos de este atleta.');
        }
        return;
    }
    if (['admin_club', 'administrativo'].includes(rol)) {
        return;
    }
    deny(403, 'No autorizado.');
}

// @desc    Obtener estado de cuenta de un Atleta (Historial de pagos)
// @route   GET /api/financial/payments/atleta/:atletaId
const getAtletaPayments = asyncHandler(async (req, res) => {
    const { Payment } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });

    await assertMemberCanViewAtletaPayments(req, req.params.atletaId);

    const filter = { atleta: req.params.atletaId };
    const total = await Payment.countDocuments(filter);

    const history = await Payment.find(filter)
        .sort({ anio: -1, mes: -1 })
        .skip(skip)
        .limit(limit)
        .populate('plan', 'nombre monto')
        .populate('cuotaSocial', 'nombre monto')
        .populate({ path: 'categoria', select: 'nombre disciplina', populate: { path: 'disciplina', select: 'nombre' } });

    const allForStats = await Payment.find({ atleta: req.params.atletaId }).select('estado montoFinal').lean();
    const totalPagado = allForStats.filter((p) => p.estado === 'pagado').reduce((s, p) => s + p.montoFinal, 0);
    const totalPendiente = allForStats
        .filter((p) => ['pendiente', 'vencido', 'en_revision'].includes(p.estado))
        .reduce((s, p) => s + p.montoFinal, 0);
    const cuotasVencidas = allForStats.filter((p) => p.estado === 'vencido').length;
    const mpReady = await mercadoPagoReady(req.models);
    const datosTransferencia = await getTransferBankData(req.models);

    res.json({
        payments: history,
        stats: { totalPagado, totalPendiente, cuotasVencidas, total: allForStats.length },
        mercadoPagoReady: mpReady,
        datosTransferencia,
        ...paginationMeta(page, limit, total),
    });
});

// @desc    Dashboard de morosidad
// @route   GET /api/financial/stats/morosidad?mes=5&anio=2026
const getMorosidad = asyncHandler(async (req, res) => {
    const { Payment, User } = req.models;
    const { mes, anio } = req.query;

    const m = parseInt(mes);
    const a = parseInt(anio);

    // Stats del mes actual
    const cuotasMes = await Payment.find({ mes: m, anio: a });
    const totalFacturado = cuotasMes.reduce((s, p) => s + p.montoFinal, 0);
    const totalCobrado = cuotasMes.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.montoFinal, 0);
    const porcentajeCobranza = totalFacturado > 0 ? Math.round((totalCobrado / totalFacturado) * 100) : 0;

    // Mes anterior
    let mesAnt = m - 1, anioAnt = a;
    if (mesAnt < 1) { mesAnt = 12; anioAnt--; }
    const cuotasPrev = await Payment.find({ mes: mesAnt, anio: anioAnt });
    const totalCobradoPrev = cuotasPrev.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.montoFinal, 0);
    const totalFacturadoPrev = cuotasPrev.reduce((s, p) => s + p.montoFinal, 0);
    const porcentajePrev = totalFacturadoPrev > 0 ? Math.round((totalCobradoPrev / totalFacturadoPrev) * 100) : 0;

    // Ranking de deudores: atletas con más cuotas pendientes/vencidas (global, no solo del mes)
    const deudas = await Payment.find({ estado: { $in: ['pendiente', 'vencido'] } })
        .populate('atleta', 'nombre apellido email');

    const deudorMap = {};
    for (const d of deudas) {
        if (!d.atleta) continue;
        const id = d.atleta._id.toString();
        if (!deudorMap[id]) {
            deudorMap[id] = {
                atleta: { _id: d.atleta._id, nombre: d.atleta.nombre, apellido: d.atleta.apellido, email: d.atleta.email },
                cuotasPendientes: 0,
                montoTotal: 0
            };
        }
        deudorMap[id].cuotasPendientes++;
        deudorMap[id].montoTotal += d.montoFinal;
    }

    const ranking = Object.values(deudorMap)
        .sort((a, b) => b.montoTotal - a.montoTotal)
        .slice(0, 20); // Top 20

    // Evolución últimos 6 meses
    const evolucion = [];
    let mEv = m, aEv = a;
    for (let i = 0; i < 6; i++) {
        const cuotas = await Payment.find({ mes: mEv, anio: aEv });
        const facturado = cuotas.reduce((s, p) => s + p.montoFinal, 0);
        const cobrado = cuotas.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.montoFinal, 0);
        evolucion.unshift({ mes: mEv, anio: aEv, facturado, cobrado, porcentaje: facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0 });
        mEv--;
        if (mEv < 1) { mEv = 12; aEv--; }
    }

    res.json({
        mesActual: { totalFacturado, totalCobrado, porcentajeCobranza, pendientes: cuotasMes.filter(p => p.estado === 'pendiente').length, vencidos: cuotasMes.filter(p => p.estado === 'vencido').length },
        mesAnterior: { totalFacturado: totalFacturadoPrev, totalCobrado: totalCobradoPrev, porcentaje: porcentajePrev },
        ranking,
        evolucion
    });
});

// @desc    Enviar recordatorios / avisar morosos
// @route   POST /api/financial/notifications/send-reminders
const sendReminders = asyncHandler(async (req, res) => {
    const force = Boolean(req.body?.force);
    const onlyVencidas = Boolean(req.body?.onlyVencidas ?? req.body?.morosos);
    const mes = req.body?.mes != null ? Number(req.body.mes) : undefined;
    const anio = req.body?.anio != null ? Number(req.body.anio) : undefined;

    const { enviados, daysBefore } = await sendCuotaReminders(req.models, {
        force,
        onlyVencidas,
        mes,
        anio,
    });

    const label = onlyVencidas ? 'aviso(s) a morosos' : 'recordatorio(s)';
    res.json({
        message: enviados
            ? `Se enviaron ${enviados} ${label}.`
            : onlyVencidas
              ? 'No hay cuotas vencidas para avisar (o ya estaban avisadas).'
              : 'No hay recordatorios nuevos para enviar.',
        enviados,
        daysBefore,
        force,
        onlyVencidas,
    });
});

// @desc    Descargar PDF de comprobante (base64 autenticado; no depende de Cloudinary público)
// @route   GET /api/financial/payments/:id/recibo
const getPaymentReceipt = asyncHandler(async (req, res) => {
    const { Payment } = req.models;
    const payment = await Payment.findById(req.params.id).select('atleta estado reciboUrl').lean();
    if (!payment) {
        res.status(404);
        throw new Error('Cuota no encontrada.');
    }
    await assertMemberCanViewAtletaPayments(req, payment.atleta);

    const { base64, filename, mimeType } = await buildPaymentReceiptPdf(req.models, req.params.id, {
        clubIdentifier: req.clubIdentifier,
        clubNombre: req.clubIdentifier || 'Club',
    });

    queuePaymentReceipt(req.models, req.params.id, req.clubIdentifier);

    res.json({
        filename,
        mimeType,
        base64,
    });
});

// @desc    Editar un plan (Ideal para actualizar precios)
// @route   PUT /api/financial/plans/:id
const updatePlan = asyncHandler(async (req, res) => {
    const { Plan } = req.models;
    const body = { ...req.body };
    if (body.porcentajeRecargo !== undefined) {
        body.porcentajeRecargo = clampRecargoPct(body.porcentajeRecargo);
    }
    const plan = await Plan.findByIdAndUpdate(req.params.id, body, { returnDocument: 'after' });
    if (!plan) { res.status(404); throw new Error('Plan no encontrado'); }
    res.json(plan);
});

// @desc    Desactivar un plan (Soft Delete)
// @route   DELETE /api/financial/plans/:id
const deletePlan = asyncHandler(async (req, res) => {
    const { Plan } = req.models;
    const plan = await Plan.findByIdAndUpdate(req.params.id, { activo: false }, { returnDocument: 'after' });
    if (!plan) { res.status(404); throw new Error('Plan no encontrado'); }
    res.json({ message: 'Plan archivado (ya no se podrá asignar, pero mantiene el historial)' });
});

export {
    createPlan,
    getPlans,
    generarCuotasMes,
    getSocialFee,
    updateSocialFee,
    generarCuotaSocialMes,
    getAllPayments,
    getPaymentStats,
    registerManualPayment,
    registerBulkManualPayment,
    submitTransferProof,
    submitBulkTransferProof,
    getPendingTransferReviews,
    approveTransferPayment,
    rejectTransferPayment,
    approveTransferReviewBatch,
    rejectTransferReviewBatch,
    getTutorFamilyPayments,
    getAtletaPayments,
    getPaymentReceipt,
    updatePlan,
    deletePlan,
    reactivatePlan,
    getSiblings,
    applySiblingDiscount,
    getGlobalFamilyDiscount,
    updateGlobalFamilyDiscount,
    getTransferBankSettings,
    updateTransferBankSettings,
    checkOverdue,
    adjustPayment,
    getMorosidad,
    sendReminders,
};