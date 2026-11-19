import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { SPONSOR_MEMBER_ROLES } from '../models/sponsor.model.js';
import { SPONSOR_PAYMENT_METODOS } from '../models/sponsorPayment.model.js';
import { markOverduePayments } from '../services/overduePayments.service.js';

function parseMoney(value, label = 'Monto mensual') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        const err = new Error(`${label} inválido.`);
        err.statusCode = 400;
        throw err;
    }
    return Math.round(n * 100) / 100;
}

function parsePeriod(mes, anio) {
    const m = Number(mes);
    const a = Number(anio);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
        const err = new Error('Mes inválido (1-12).');
        err.statusCode = 400;
        throw err;
    }
    if (!Number.isInteger(a) || a < 2000 || a > 2100) {
        const err = new Error('Año inválido.');
        err.statusCode = 400;
        throw err;
    }
    return { mes: m, anio: a };
}

function sanitizeRoles(rolesIn) {
    if (!Array.isArray(rolesIn)) return [];
    return [...new Set(rolesIn.map(String).filter((r) => SPONSOR_MEMBER_ROLES.includes(r)))];
}

function sanitizeFeeIds(idsIn) {
    if (!Array.isArray(idsIn)) return [];
    return [
        ...new Set(
            idsIn
                .map((id) => String(id || '').trim())
                .filter((id) => mongoose.Types.ObjectId.isValid(id)),
        ),
    ];
}

function applySponsorBody(doc, body) {
    if (body.nombre !== undefined) {
        const nombre = String(body.nombre || '').trim();
        if (!nombre) {
            const err = new Error('El nombre del sponsor es obligatorio.');
            err.statusCode = 400;
            throw err;
        }
        doc.nombre = nombre;
    }
    if (body.registro !== undefined) doc.registro = String(body.registro || '').trim();
    if (body.fotoUrl !== undefined) doc.fotoUrl = String(body.fotoUrl || '').trim();
    if (body.montoMensual !== undefined) doc.montoMensual = parseMoney(body.montoMensual);
    if (body.beneficios !== undefined) doc.beneficios = String(body.beneficios || '').trim();
    if (body.rolesAplicables !== undefined) doc.rolesAplicables = sanitizeRoles(body.rolesAplicables);
    if (body.rolesCanjeCreditos !== undefined) doc.rolesCanjeCreditos = sanitizeRoles(body.rolesCanjeCreditos);
    if (body.cuotasSociales !== undefined) doc.cuotasSociales = sanitizeFeeIds(body.cuotasSociales);
    if (body.usuariosPartner !== undefined) doc.usuariosPartner = sanitizeFeeIds(body.usuariosPartner);
    if (body.activo !== undefined) {
        doc.activo = body.activo === true || body.activo === 'true';
    }
}

/** Keep User.partnerSponsor in sync with Sponsor.usuariosPartner. */
async function syncPartnerUsers(models, sponsor) {
    const { User } = models;
    const ids = (sponsor.usuariosPartner || []).map((id) => String(id));
    await User.updateMany(
        { partnerSponsor: sponsor._id, _id: { $nin: ids } },
        { $set: { partnerSponsor: null } },
    );
    if (ids.length) {
        await User.updateMany(
            { _id: { $in: ids } },
            { $set: { partnerSponsor: sponsor._id } },
        );
    }
}

function sponsorMatchesMember(sponsor, user) {
    const roles = Array.isArray(sponsor.rolesAplicables) ? sponsor.rolesAplicables : [];
    const fees = Array.isArray(sponsor.cuotasSociales) ? sponsor.cuotasSociales : [];
    // Empty roles + empty fees → visible to everyone (all-staff benefits).
    if (!roles.length && !fees.length) return true;

    const userRoles = [
        user.rol,
        ...(Array.isArray(user.roles) ? user.roles : []),
    ].filter(Boolean);
    if (roles.some((r) => userRoles.includes(r))) return true;

    const assigned = user.cuotaSocialAsignada ? String(user.cuotaSocialAsignada) : '';
    if (assigned && fees.some((id) => String(id) === assigned)) return true;

    return false;
}

async function memberIsMoroso(models, user) {
    if (user.estado === 'moroso') return true;
    try {
        await markOverduePayments(models);
    } catch {
        /* best-effort */
    }
    const count = await models.Payment.countDocuments({
        atleta: user._id,
        estado: 'vencido',
    });
    return count > 0;
}

function publicSponsor(s) {
    return {
        _id: s._id,
        nombre: s.nombre,
        registro: s.registro || '',
        fotoUrl: s.fotoUrl || '',
        beneficios: s.beneficios || '',
    };
}

function serializePago(p) {
    if (!p) return null;
    return {
        _id: p._id,
        mes: p.mes,
        anio: p.anio,
        monto: p.monto,
        estado: p.estado,
        comprobanteUrl: p.comprobanteUrl || '',
        fechaPago: p.fechaPago || null,
        metodoPago: p.metodoPago || null,
        notas: p.notas || '',
    };
}

function periodKey(mes, anio) {
    return Number(anio) * 12 + Number(mes);
}

/** Primer mes vigente del sponsor (desdeMes/Anio o createdAt). */
function sponsorStartPeriod(sponsor) {
    if (sponsor.desdeMes && sponsor.desdeAnio) {
        return { mes: Number(sponsor.desdeMes), anio: Number(sponsor.desdeAnio) };
    }
    if (sponsor.createdAt) {
        const d = new Date(sponsor.createdAt);
        return { mes: d.getMonth() + 1, anio: d.getFullYear() };
    }
    return null;
}

function sponsorActiveInPeriod(sponsor, mes, anio) {
    const start = sponsorStartPeriod(sponsor);
    if (!start) return true;
    return periodKey(mes, anio) >= periodKey(start.mes, start.anio);
}

/** Crea filas pendientes del mes solo para sponsors vigentes desde ese mes. */
async function ensureSponsorPaymentsForMonth(models, mes, anio) {
    const { Sponsor, SponsorPayment } = models;
    const sponsors = await Sponsor.find({ activo: true })
        .select('_id montoMensual desdeMes desdeAnio createdAt')
        .lean();
    if (!sponsors.length) return;

    const eligible = sponsors.filter((s) => sponsorActiveInPeriod(s, mes, anio));
    if (!eligible.length) return;

    const existing = await SponsorPayment.find({ mes, anio }).select('sponsor').lean();
    const have = new Set(existing.map((e) => String(e.sponsor)));

    const toInsert = eligible
        .filter((s) => !have.has(String(s._id)))
        .map((s) => ({
            sponsor: s._id,
            mes,
            anio,
            monto: Number(s.montoMensual) || 0,
            estado: 'pendiente',
        }));

    if (toInsert.length) {
        try {
            await SponsorPayment.insertMany(toInsert, { ordered: false });
        } catch (e) {
            if (e?.code !== 11000 && !String(e?.message || '').includes('duplicate')) {
                throw e;
            }
        }
    }
}

// @desc    Listar sponsors (admin) — con pago del mes si mes/anio
// @route   GET /api/financial/sponsors?mes=&anio=&includeInactive=
const listSponsors = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
    const filter = includeInactive ? {} : { activo: true };

    let period = null;
    if (req.query.mes != null && req.query.anio != null) {
        period = parsePeriod(req.query.mes, req.query.anio);
        await ensureSponsorPaymentsForMonth(req.models, period.mes, period.anio);
    }

    const sponsors = await Sponsor.find(filter)
        .populate('cuotasSociales', 'nombre monto activo')
        .sort({ nombre: 1 })
        .lean();

    let pagoBySponsor = new Map();
    if (period) {
        const pagos = await SponsorPayment.find({ mes: period.mes, anio: period.anio }).lean();
        pagoBySponsor = new Map(pagos.map((p) => [String(p.sponsor), p]));
    }

    const visible = period
        ? sponsors.filter((s) => sponsorActiveInPeriod(s, period.mes, period.anio))
        : sponsors;

    res.json({
        mes: period?.mes ?? null,
        anio: period?.anio ?? null,
        sponsors: visible.map((s) => ({
            ...s,
            pagoMes: period ? serializePago(pagoBySponsor.get(String(s._id))) : null,
        })),
    });
});

function parseRewardsPayload(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            const titulo = String(r?.titulo || '').trim();
            const costoPuntos = Math.max(1, Math.floor(Number(r?.costoPuntos) || 0));
            const rolesCanje = Array.isArray(r?.rolesCanje)
                ? [...new Set(r.rolesCanje.map(String).filter((x) => SPONSOR_MEMBER_ROLES.includes(x)))]
                : [];
            if (!titulo || !costoPuntos) return null;
            return {
                titulo,
                descripcion: String(r?.descripcion || '').trim(),
                fotoUrl: String(r?.fotoUrl || '').trim(),
                costoPuntos,
                rolesCanje,
                tipo: ['porcentaje', 'monto_fijo', 'texto'].includes(r?.tipo) ? r.tipo : 'texto',
                valor: Number(r?.valor) || 0,
            };
        })
        .filter(Boolean);
}

async function createPartnerForSponsor(models, sponsor, { email, password, nombre }) {
    const { User } = models;
    const emailNorm = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    if (!emailNorm) {
        const err = new Error('El email del partner es obligatorio.');
        err.statusCode = 400;
        throw err;
    }
    if (pass.length < 6) {
        const err = new Error('La contraseña del partner debe tener al menos 6 caracteres.');
        err.statusCode = 400;
        throw err;
    }
    const exists = await User.findOne({ email: emailNorm }).select('_id').lean();
    if (exists) {
        const err = new Error('Ya existe un usuario con ese email en el club.');
        err.statusCode = 400;
        throw err;
    }
    const parts = String(nombre || sponsor.nombre || 'Partner').trim().split(/\s+/);
    const partner = await User.create({
        nombre: parts[0] || 'Partner',
        apellido: parts.slice(1).join(' ') || 'Sponsor',
        email: emailNorm,
        password: pass,
        rol: 'partner',
        roles: ['partner'],
        partnerSponsor: sponsor._id,
        estado: 'activo',
    });
    return partner;
}

// @desc    Crear sponsor
// @route   POST /api/financial/sponsors
const createSponsor = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment, LoyaltyReward } = req.models;
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
        res.status(400);
        throw new Error('El nombre del sponsor es obligatorio.');
    }

    const rewardsIn = parseRewardsPayload(req.body?.rewards);
    const partnerEmail = req.body?.partnerEmail;
    const partnerPassword = req.body?.partnerPassword;
    const wantsPartner = Boolean(String(partnerEmail || '').trim() || String(partnerPassword || '').trim());

    const doc = new Sponsor({
        nombre,
        registro: '',
        fotoUrl: '',
        montoMensual: 0,
        beneficios: '',
        rolesAplicables: [],
        cuotasSociales: [],
        rolesCanjeCreditos: [],
        activo: true,
    });
    applySponsorBody(doc, req.body);

    // Union of discount roles → audience for static benefits + sponsor-level canje fallback.
    if (rewardsIn.length) {
        const unionRoles = [...new Set(rewardsIn.flatMap((r) => r.rolesCanje))];
        if (unionRoles.length) {
            if (!doc.rolesAplicables.length) doc.rolesAplicables = unionRoles;
            if (!doc.rolesCanjeCreditos.length) doc.rolesCanjeCreditos = unionRoles;
        }
    }

    if (!doc.rolesAplicables.length && !doc.cuotasSociales.length) {
        res.status(400);
        throw new Error('Seleccioná al menos un tipo de usuario, una cuota social o roles en un descuento.');
    }

    if (wantsPartner && (!String(partnerEmail || '').trim() || !String(partnerPassword || '').trim())) {
        res.status(400);
        throw new Error('Completá email y contraseña del partner.');
    }

    await doc.save();

    let partner = null;
    if (wantsPartner) {
        partner = await createPartnerForSponsor(req.models, doc, {
            email: partnerEmail,
            password: partnerPassword,
            nombre,
        });
        doc.usuariosPartner = [partner._id];
        await doc.save();
    } else {
        await syncPartnerUsers(req.models, doc);
    }

    const createdRewards = [];
    if (rewardsIn.length && LoyaltyReward) {
        for (const r of rewardsIn) {
            const reward = await LoyaltyReward.create({
                sponsor: doc._id,
                titulo: r.titulo,
                descripcion: r.descripcion,
                fotoUrl: r.fotoUrl,
                costoPuntos: r.costoPuntos,
                rolesCanje: r.rolesCanje,
                tipo: r.tipo,
                valor: r.valor,
                activo: true,
            });
            createdRewards.push(reward);
        }
    }

    // Aportes solo desde el mes de alta (el que se está viendo al crear, o el actual).
    const now = new Date();
    let mes = now.getMonth() + 1;
    let anio = now.getFullYear();
    if (req.body?.mes != null && req.body?.anio != null) {
        ({ mes, anio } = parsePeriod(req.body.mes, req.body.anio));
    }
    doc.desdeMes = mes;
    doc.desdeAnio = anio;
    await doc.save();

    let pagoMes = null;
    try {
        pagoMes = await SponsorPayment.create({
            sponsor: doc._id,
            mes,
            anio,
            monto: doc.montoMensual || 0,
            estado: 'pendiente',
        });
    } catch {
        pagoMes = await SponsorPayment.findOne({ sponsor: doc._id, mes, anio });
    }

    await doc.populate('cuotasSociales', 'nombre monto activo');
    res.status(201).json({
        sponsor: { ...doc.toObject(), pagoMes: serializePago(pagoMes) },
        partner: partner
            ? { _id: partner._id, email: partner.email, rol: partner.rol, nombre: partner.nombre }
            : null,
        rewards: createdRewards,
        message: partner
            ? `Sponsor creado con partner ${partner.email}.`
            : 'Sponsor creado.',
    });
});

// @desc    Actualizar sponsor
// @route   PATCH /api/financial/sponsors/:id
const updateSponsor = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const doc = await Sponsor.findById(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    const prevMonto = doc.montoMensual;
    applySponsorBody(doc, req.body);
    if (!doc.rolesAplicables.length && !doc.cuotasSociales.length) {
        res.status(400);
        throw new Error('Seleccioná al menos un tipo de usuario o una cuota social.');
    }
    await doc.save();
    await syncPartnerUsers(req.models, doc);

    // Si cambió el monto, actualizá pagos pendientes del mes en curso.
    if (doc.montoMensual !== prevMonto) {
        const now = new Date();
        await SponsorPayment.updateMany(
            {
                sponsor: doc._id,
                estado: 'pendiente',
                mes: now.getMonth() + 1,
                anio: now.getFullYear(),
            },
            { $set: { monto: doc.montoMensual } },
        );
    }

    await doc.populate('cuotasSociales', 'nombre monto activo');
    res.json({ sponsor: doc, message: 'Sponsor actualizado.' });
});

// @desc    Eliminar sponsor
// @route   DELETE /api/financial/sponsors/:id
const deleteSponsor = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const doc = await Sponsor.findByIdAndDelete(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    await SponsorPayment.deleteMany({ sponsor: doc._id });
    res.json({ message: 'Sponsor eliminado.' });
});

// @desc    Confirmar pago del mes (con comprobante opcional)
// @route   PATCH /api/financial/sponsors/:id/pay-month
const paySponsorMonth = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }

    const { mes, anio } = parsePeriod(req.body?.mes, req.body?.anio);
    if (!sponsorActiveInPeriod(sponsor, mes, anio)) {
        res.status(400);
        throw new Error('Este sponsor todavía no estaba activo en ese mes.');
    }
    await ensureSponsorPaymentsForMonth(req.models, mes, anio);

    let pago = await SponsorPayment.findOne({ sponsor: sponsor._id, mes, anio });
    if (!pago) {
        pago = await SponsorPayment.create({
            sponsor: sponsor._id,
            mes,
            anio,
            monto: sponsor.montoMensual || 0,
            estado: 'pendiente',
        });
    }

    if (req.body?.monto != null && req.body.monto !== '') {
        pago.monto = parseMoney(req.body.monto, 'Monto');
    }

    const metodo = String(req.body?.metodoPago || 'transferencia');
    if (!SPONSOR_PAYMENT_METODOS.includes(metodo)) {
        res.status(400);
        throw new Error('Método de pago inválido.');
    }

    pago.estado = 'pagado';
    pago.metodoPago = metodo;
    pago.fechaPago = req.body?.fechaPago ? new Date(req.body.fechaPago) : new Date();
    if (Number.isNaN(pago.fechaPago.getTime())) {
        res.status(400);
        throw new Error('Fecha de pago inválida.');
    }
    if (req.body?.comprobanteUrl !== undefined) {
        pago.comprobanteUrl = String(req.body.comprobanteUrl || '').trim();
    }
    if (req.body?.notas !== undefined) {
        pago.notas = String(req.body.notas || '').trim();
    }
    pago.registradoPor = req.user._id;
    await pago.save();

    res.json({
        message: 'Pago del sponsor confirmado.',
        pago: serializePago(pago),
    });
});

// @desc    Marcar aporte del mes como pendiente (revertir)
// @route   PATCH /api/financial/sponsors/:id/unpay-month
const unpaySponsorMonth = asyncHandler(async (req, res) => {
    const { Sponsor, SponsorPayment } = req.models;
    const sponsor = await Sponsor.findById(req.params.id).select('_id');
    if (!sponsor) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    const { mes, anio } = parsePeriod(req.body?.mes, req.body?.anio);
    const pago = await SponsorPayment.findOne({ sponsor: sponsor._id, mes, anio });
    if (!pago) {
        res.status(404);
        throw new Error('No hay registro de pago para ese mes.');
    }
    pago.estado = 'pendiente';
    pago.fechaPago = undefined;
    pago.metodoPago = undefined;
    if (req.body?.clearComprobante) pago.comprobanteUrl = '';
    await pago.save();
    res.json({ message: 'Pago revertido a pendiente.', pago: serializePago(pago) });
});

// @desc    Beneficios visibles para el miembro (si no es moroso)
// @route   GET /api/financial/sponsors/my-benefits
const getMySponsorBenefits = asyncHandler(async (req, res) => {
    const { Sponsor } = req.models;
    const user = req.user;

    // Beneficios visibles para cualquier usuario activo (staff incluido).
    if (user.estado === 'inactivo') {
        res.status(403);
        throw new Error('Usuario inactivo.');
    }

    const moroso = await memberIsMoroso(req.models, user);
    if (moroso) {
        return res.json({
            eligible: false,
            moroso: true,
            message: 'Los beneficios de sponsors están disponibles cuando estás al día con tus cuotas.',
            sponsors: [],
        });
    }

    const all = await Sponsor.find({ activo: true })
        .select('nombre registro fotoUrl beneficios rolesAplicables cuotasSociales')
        .lean();

    const matched = all.filter((s) => sponsorMatchesMember(s, user)).map(publicSponsor);

    res.json({
        eligible: true,
        moroso: false,
        sponsors: matched,
    });
});

export {
    listSponsors,
    createSponsor,
    updateSponsor,
    deleteSponsor,
    paySponsorMonth,
    unpaySponsorMonth,
    getMySponsorBenefits,
};
