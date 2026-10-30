import asyncHandler from 'express-async-handler';
import { hijosVinculadosFilter } from '../utils/userQuery.js';
import { buildClubEntryToken, parseClubEntryToken } from '../services/clubEntryToken.service.js';
import { markOverduePayments } from '../services/overduePayments.service.js';
import { calendarMonthYearInTz, DEFAULT_CLUB_TIMEZONE } from '../utils/timeHelper.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CLIENT_BILLING_ROLES = ['atleta', 'tutor', 'socio'];

function formatCuotaPeriodo(p) {
    const mes = MESES[(Number(p.mes) || 1) - 1] || p.mes;
    return `${mes} ${p.anio}`;
}

function formatMoney(n) {
    return Number(n || 0).toLocaleString('es-AR');
}

/**
 * Snapshot de planes / cuota social / mora para el escáner de ingreso.
 */
async function buildMemberBillingSnapshot(models, member, timezone = DEFAULT_CLUB_TIMEZONE) {
    const { Enrollment, Payment, SocialFee } = models;
    const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
    const userId = member._id;

    const isMorosoFlag = member.estado === 'moroso';
    const exentoSocial = member.exentoCuotaSocial === true;

    let planes = [];
    if (member.rol === 'atleta') {
        const enrollments = await Enrollment.find({
            atleta: userId,
            estado: 'activo',
            esFacturacion: true,
            plan: { $ne: null },
        })
            .populate('plan', 'nombre monto')
            .populate('categoria', 'nombre')
            .lean();
        planes = enrollments
            .filter((e) => e.plan)
            .map((e) => ({
                planNombre: e.plan.nombre,
                planMonto: Number(e.plan.monto) || 0,
                categoriaNombre: e.categoria?.nombre || '',
                label: e.categoria?.nombre
                    ? `${e.plan.nombre} · ${e.categoria.nombre}`
                    : e.plan.nombre,
            }));
    }

    let cuotaSocial = null;
    if (CLIENT_BILLING_ROLES.includes(member.rol)) {
        if (exentoSocial) {
            cuotaSocial = { exento: true, nombre: null, monto: null };
        } else if (member.cuotaSocialAsignada) {
            const fee =
                typeof member.cuotaSocialAsignada === 'object' && member.cuotaSocialAsignada?.nombre
                    ? member.cuotaSocialAsignada
                    : await SocialFee.findById(member.cuotaSocialAsignada)
                          .select('nombre monto activo')
                          .lean();
            if (fee) {
                cuotaSocial = {
                    exento: false,
                    nombre: fee.nombre,
                    monto: Number(fee.monto) || 0,
                    activo: fee.activo !== false,
                };
            }
        } else {
            cuotaSocial = { exento: false, nombre: null, monto: null, sinAsignar: true };
        }
    }

    const monthPayments = await Payment.find({ atleta: userId, mes, anio })
        .populate('plan', 'nombre')
        .populate('cuotaSocial', 'nombre')
        .select('tipo estado montoFinal plan cuotaSocial')
        .lean();

    const mesActual = monthPayments.map((p) => ({
        tipo: p.tipo || 'entrenamiento',
        estado: p.estado,
        montoFinal: Number(p.montoFinal) || 0,
        nombre:
            p.tipo === 'social'
                ? p.cuotaSocial?.nombre || 'Cuota social'
                : p.plan?.nombre || 'Cuota entrenamiento',
    }));

    const vencidas = await Payment.find({ atleta: userId, estado: 'vencido' })
        .select('mes anio tipo')
        .sort({ anio: -1, mes: -1 })
        .limit(4)
        .lean();
    const cuotasVencidasCount = await Payment.countDocuments({ atleta: userId, estado: 'vencido' });

    const hasVencidas = cuotasVencidasCount > 0;
    const isMoroso = isMorosoFlag || hasVencidas;
    const alDia = !isMoroso;

    let resumenEstado = 'al_dia';
    if (isMorosoFlag) resumenEstado = 'moroso';
    else if (hasVencidas) resumenEstado = 'vencidas';
    else if (
        CLIENT_BILLING_ROLES.includes(member.rol) &&
        !exentoSocial &&
        !planes.length &&
        (!cuotaSocial || cuotaSocial.sinAsignar)
    ) {
        resumenEstado = 'sin_cuota';
    }

    return {
        alDia,
        isMoroso,
        resumenEstado,
        estadoUsuario: member.estado,
        planes,
        cuotaSocial,
        mesActual,
        mes,
        anio,
        cuotasVencidasCount,
        periodosVencidos: vencidas.map(formatCuotaPeriodo),
        planLabels: planes.map((p) => p.label),
        planSummary:
            planes.length === 0
                ? member.rol === 'atleta'
                    ? 'Sin plan de entrenamiento'
                    : null
                : planes.map((p) => `${p.label} ($${formatMoney(p.planMonto)})`).join(' · '),
        socialSummary: !CLIENT_BILLING_ROLES.includes(member.rol)
            ? null
            : exentoSocial
              ? 'Exento de cuota social'
              : cuotaSocial?.nombre
                ? `${cuotaSocial.nombre} ($${formatMoney(cuotaSocial.monto)})`
                : 'Sin cuota social asignada',
    };
}

const MEMBER_QR_ROLES = [
    'atleta',
    'tutor',
    'socio',
    'colaborador',
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
    'admin_club',
    'dirigente',
    'administrativo',
];
const SCANNER_ROLES = ['admin_club', 'administrativo', 'control_ingreso'];
function entryUserPayload(user) {
    return {
        _id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: user.rol,
        fotoPerfil: user.fotoPerfil || '',
        dni: user.dni || '',
        estado: user.estado,
    };
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/** @param {string | undefined} raw YYYY-MM-DD */
function parseHistoryDate(raw) {
    if (!raw) return null;
    const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
        return null;
    }
    return startOfDay(d);
}

function mapClubEntryRow(e) {
    const entryType = e.entryType || (e.user ? 'member' : 'visitor');
    return {
        _id: e._id,
        entryType,
        scannedAt: e.scannedAt,
        duplicate: !!e.duplicate,
        decision: e.decision === 'no_entro' ? 'no_entro' : 'entro',
        member:
            entryType === 'member' && e.user
                ? {
                      _id: e.user._id,
                      nombre: e.user.nombre,
                      apellido: e.user.apellido,
                      rol: e.user.rol,
                      fotoPerfil: e.user.fotoPerfil || '',
                      dni: e.user.dni || '',
                      estado: e.user.estado,
                  }
                : null,
        visitor: entryType === 'visitor' ? visitorPayload(e) : null,
        scannedBy: e.scannedBy ? { nombre: e.scannedBy.nombre, apellido: e.scannedBy.apellido } : null,
    };
}

// @route GET /api/club-entry/my-qr?forUserId=
const getMyClubEntryQr = asyncHandler(async (req, res) => {
    const { User } = req.models;
    let targetUser = req.user;

    if (req.query.forUserId) {
        if (req.user.rol !== 'tutor') {
            res.status(403);
            throw new Error('Solo un tutor puede mostrar el QR de un atleta vinculado.');
        }
        const hijo = await User.findOne({
            _id: req.query.forUserId,
            ...hijosVinculadosFilter(req.user._id),
            rol: 'atleta',
        }).select('-password');
        if (!hijo) {
            res.status(404);
            throw new Error('Atleta no encontrado en tu familia.');
        }
        targetUser = hijo;
    } else if (!MEMBER_QR_ROLES.includes(req.user.rol)) {
        res.status(403);
        throw new Error('Tu rol no puede generar un QR de ingreso.');
    }

    const { token, expiresAt } = buildClubEntryToken(req.clubIdentifier, targetUser._id);

    res.json({
        qrValue: `gpsports:entry:${token}`,
        token,
        expiresAt,
        member: entryUserPayload(targetUser),
    });
});

async function findEnteredToday(ClubEntry, userId) {
    const dayStart = startOfToday();
    return ClubEntry.findOne({
        user: userId,
        scannedAt: { $gte: dayStart, $lte: endOfDay(dayStart) },
        decision: { $ne: 'no_entro' },
        duplicate: { $ne: true },
    })
        .sort({ scannedAt: -1 })
        .lean();
}

async function loadMemberScan(req) {
    const { token } = req.body || {};
    const { User, ClubEntry } = req.models;
    const parsed = parseClubEntryToken(token, req.clubIdentifier);
    const member = await User.findById(parsed.userId)
        .select('-password')
        .populate('cuotaSocialAsignada', 'nombre monto activo');
    if (!member) {
        const err = new Error('Socio no encontrado en este club.');
        err.statusCode = 404;
        throw err;
    }
    if (member.estado === 'inactivo') {
        const err = new Error('El usuario está inactivo y no puede ingresar.');
        err.statusCode = 403;
        throw err;
    }

    const warnings = [];
    if (member.estado === 'moroso') {
        warnings.push('El usuario figura como moroso. Decidí si puede ingresar.');
    }

    let billing = null;
    try {
        await markOverduePayments(req.models, { atleta: member._id });
        billing = await buildMemberBillingSnapshot(req.models, member, req.clubTimezone);
    } catch (e) {
        console.warn('[club-entry] billing snapshot:', e.message);
    }

    const cuotasVencidasCount = billing?.cuotasVencidasCount || 0;
    if (cuotasVencidasCount > 0) {
        let periodos = (billing.periodosVencidos || []).join(', ');
        if (cuotasVencidasCount > (billing.periodosVencidos || []).length) {
            periodos += '…';
        }
        warnings.push(
            cuotasVencidasCount === 1
                ? `Tiene 1 cuota vencida (${periodos}). Decidí si puede ingresar.`
                : `Tiene ${cuotasVencidasCount} cuotas vencidas (${periodos}). Decidí si puede ingresar.`,
        );
    }

    const already = await findEnteredToday(ClubEntry, member._id);
    return { token, parsed, member, warnings, billing, cuotasVencidasCount, already, ClubEntry };
}

function memberScanBody(member, extras) {
    return {
        ok: true,
        entryType: 'member',
        warnings: extras.warnings || [],
        hasCuotasVencidas: (extras.cuotasVencidasCount || 0) > 0,
        cuotasVencidasCount: extras.cuotasVencidasCount || 0,
        billing: extras.billing || null,
        member: entryUserPayload(member),
        visitor: null,
        ...extras.rest,
    };
}

// @route POST /api/club-entry/scan
// Valida el QR y deja la decisión (entró / no entró) para /scan/confirm.
const scanClubEntryQr = asyncHandler(async (req, res) => {
    let loaded;
    try {
        loaded = await loadMemberScan(req);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw new Error(e.message || 'No se pudo leer el QR.');
    }
    const { parsed, member, warnings, billing, cuotasVencidasCount, already, ClubEntry } = loaded;

    if (already) {
        return res.json(memberScanBody(member, {
            warnings,
            billing,
            cuotasVencidasCount,
            rest: {
                needsDecision: false,
                alreadyEntered: true,
                message: 'Ya entró',
                decision: 'entro',
                scannedAt: already.scannedAt,
            },
        }));
    }

    const nonceUsed = await ClubEntry.findOne({ tokenNonce: parsed.nonce }).select('_id decision').lean();
    if (nonceUsed && nonceUsed.decision !== 'no_entro') {
        res.status(409);
        throw new Error('Este QR ya fue utilizado. Pedile al socio que actualice su pantalla.');
    }

    res.json(memberScanBody(member, {
        warnings,
        billing,
        cuotasVencidasCount,
        rest: {
            needsDecision: true,
            alreadyEntered: false,
            message: null,
            decision: null,
            scannedAt: null,
        },
    }));
});

// @route POST /api/club-entry/scan/confirm
const confirmClubEntryScan = asyncHandler(async (req, res) => {
    const decision = req.body?.decision === 'no_entro' ? 'no_entro' : req.body?.decision === 'entro' ? 'entro' : '';
    if (!decision) {
        res.status(400);
        throw new Error('Elegí si entró o no entró.');
    }

    let loaded;
    try {
        loaded = await loadMemberScan(req);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw new Error(e.message || 'No se pudo leer el QR.');
    }
    const { parsed, member, warnings, billing, cuotasVencidasCount, already, ClubEntry } = loaded;

    if (already) {
        return res.json(memberScanBody(member, {
            warnings,
            billing,
            cuotasVencidasCount,
            rest: {
                needsDecision: false,
                alreadyEntered: true,
                message: 'Ya entró',
                decision: 'entro',
                scannedAt: already.scannedAt,
            },
        }));
    }

    const tokenNonce = decision === 'entro'
        ? parsed.nonce
        : `declined:${parsed.nonce}:${Date.now()}`;

    let entry;
    try {
        entry = await ClubEntry.create({
            entryType: 'member',
            user: member._id,
            scannedBy: req.user._id,
            tokenNonce,
            duplicate: false,
            decision,
        });
    } catch (e) {
        if (e?.code === 11000) {
            return res.json(memberScanBody(member, {
                warnings,
                billing,
                cuotasVencidasCount,
                rest: {
                    needsDecision: false,
                    alreadyEntered: true,
                    message: 'Ya entró',
                    decision: 'entro',
                    scannedAt: new Date(),
                },
            }));
        }
        throw e;
    }

    res.json(memberScanBody(member, {
        warnings,
        billing,
        cuotasVencidasCount,
        rest: {
            needsDecision: false,
            alreadyEntered: false,
            message: decision === 'entro' ? 'Entró' : 'No entró',
            decision,
            scannedAt: entry.scannedAt,
            scannedBy: {
                _id: req.user._id,
                nombre: req.user.nombre,
                apellido: req.user.apellido,
            },
        },
    }));
});

function visitorPayload(entry) {
    return {
        nombre: entry.visitorNombre || '',
        apellido: entry.visitorApellido || '',
        dni: entry.visitorDni || '',
        foto: entry.visitorFoto || '',
        nota: entry.visitorNota || '',
    };
}

// @route POST /api/club-entry/visitor
const registerVisitorEntry = asyncHandler(async (req, res) => {
    const { ClubEntry } = req.models;
    const nombre = String(req.body?.nombre || '').trim();
    const apellido = String(req.body?.apellido || '').trim();
    const dni = String(req.body?.dni || '').trim();
    const nota = String(req.body?.nota || '').trim();
    const foto = String(req.body?.foto || req.body?.fotoUrl || '').trim();

    if (!nombre || !apellido || !dni) {
        res.status(400);
        throw new Error('Nombre, apellido y DNI son obligatorios.');
    }

    const entry = await ClubEntry.create({
        entryType: 'visitor',
        scannedBy: req.user._id,
        visitorNombre: nombre,
        visitorApellido: apellido,
        visitorDni: dni,
        visitorNota: nota,
        visitorFoto: foto,
        duplicate: false,
        // Unique even with legacy unique indexes on tokenNonce (empty string collided / failed).
        tokenNonce: `visitor:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    });

    res.status(201).json({
        ok: true,
        entryType: 'visitor',
        duplicate: false,
        warnings: [],
        scannedAt: entry.scannedAt,
        member: null,
        visitor: visitorPayload(entry),
        scannedBy: {
            _id: req.user._id,
            nombre: req.user.nombre,
            apellido: req.user.apellido,
        },
    });
});

// @route GET /api/club-entry/today?date=YYYY-MM-DD
const getTodayClubEntries = asyncHandler(async (req, res) => {
    const { ClubEntry } = req.models;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);

    let dayStart = startOfToday();
    if (req.query.date) {
        const parsed = parseHistoryDate(req.query.date);
        if (!parsed) {
            res.status(400);
            throw new Error('Fecha inválida. Usá el formato YYYY-MM-DD.');
        }
        dayStart = parsed;
    }
    const dayEnd = endOfDay(dayStart);

    const entries = await ClubEntry.find({
        scannedAt: { $gte: dayStart, $lte: dayEnd },
    })
        .sort({ scannedAt: -1 })
        .limit(limit)
        .populate('user', 'nombre apellido rol fotoPerfil dni estado')
        .populate('scannedBy', 'nombre apellido')
        .lean();

    res.json(entries.map(mapClubEntryRow));
});

export {
    getMyClubEntryQr,
    scanClubEntryQr,
    confirmClubEntryScan,
    registerVisitorEntry,
    getTodayClubEntries,
    MEMBER_QR_ROLES,
    SCANNER_ROLES,
};
