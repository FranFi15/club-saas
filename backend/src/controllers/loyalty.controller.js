import asyncHandler from 'express-async-handler';
import { normalizeUserRoles, userHasRole } from '../constants/userRoles.js';
import { expandSponsorRoles, resolveCanjeRoles } from '../models/sponsor.model.js';
import { createAppNotification } from '../services/appNotification.service.js';
import { normalizeTicketDni } from '../services/eventTicketIssue.service.js';
import {
    getOrCreateLoyaltySettings,
    requireLoyaltyEnabled,
    creditPoints,
    debitPoints,
    redeemReward,
    markRedemptionUsed,
    nextExpiryForUser,
    expireLoyaltyPoints,
    reservedPendingPoints,
} from '../services/loyalty.service.js';

function dniLookupClauses(dni) {
    const spaced = dni.split('').join('\\D*');
    const clauses = [
        { dni },
        { dni: new RegExp(`^\\D*${spaced}\\D*$`) },
    ];
    if (dni.length === 7 || dni.length === 8) {
        const core = dni.padStart(8, '0').split('').join('\\D*');
        clauses.push({ dni: new RegExp(`^\\D*\\d{2}\\D*${core}\\D*\\d\\D*$`) });
    }
    return clauses;
}

async function findMemberByDni(User, rawDni) {
    const dni = normalizeTicketDni(rawDni);
    if (dni.length < 6 || dni.length > 10) return null;
    return User.findOne({ $or: dniLookupClauses(dni) })
        .select('_id nombre apellido dni email estado rol roles puntosLealtad')
        .lean();
}

function serializePartnerMember(user) {
    if (!user) return null;
    return {
        _id: user._id,
        nombre: user.nombre || '',
        apellido: user.apellido || '',
        dni: user.dni || '',
        estado: user.estado || '',
        puntosLealtad: Number(user.puntosLealtad) || 0,
    };
}

const LEDGER_REASON_LABEL = {
    cuota_al_dia: 'Cuota al día',
    ajuste_admin: 'Ajuste del club',
    venta_partner: 'Compra en comercio',
    canje: 'Canje validado',
    reversa: 'Reversa',
    expiracion: 'Vencimiento',
};

function serializeLedgerEntry(e) {
    const delta = Number(e.delta) || 0;
    return {
        _id: e._id,
        delta,
        balanceAfter: e.balanceAfter,
        reason: e.reason,
        reasonLabel: LEDGER_REASON_LABEL[e.reason] || e.reason || 'Movimiento',
        note: e.note || '',
        createdAt: e.createdAt,
    };
}

async function notifyCanjeUsed(models, redemption) {
    try {
        const pts = Math.max(0, Math.floor(Number(redemption.puntosGastados) || 0));
        const beneficio = redemption.snapshotTitulo || 'beneficio';
        await createAppNotification(models, {
            usuario: redemption.user,
            tipo: 'creditos_canje',
            titulo: 'Canje validado',
            mensaje: pts
                ? `Se usó tu canje “${beneficio}” (−${pts} créditos).`
                : `Se validó tu canje “${beneficio}”.`,
            referencia: redemption._id,
        });
    } catch (e) {
        console.warn('[loyalty] notify canje:', e.message);
    }
}

async function notifyCreditsEarned(models, { userId, puntos, saleId, sponsorNombre }) {
    try {
        const pts = Math.max(0, Math.floor(Number(puntos) || 0));
        if (!pts) return;
        const where = sponsorNombre ? ` en ${sponsorNombre}` : '';
        await createAppNotification(models, {
            usuario: userId,
            tipo: 'creditos_ganados',
            titulo: 'Créditos ganados',
            mensaje: `Sumaste ${pts} créditos por tu compra${where}.`,
            referencia: saleId,
        });
    } catch (e) {
        console.warn('[loyalty] notify credits:', e.message);
    }
}

function serializeSettings(s, { includeAdminRates = false } = {}) {
    if (!s) return null;
    const base = {
        enabled: !!s.enabled,
        nombrePuntos: s.nombrePuntos || 'Créditos',
        diasVigenciaPuntos: Number(s.diasVigenciaPuntos) || 90,
        puntosPorCuotaAlDia: Number(s.puntosPorCuotaAlDia) || 0,
    };
    if (!includeAdminRates) return base;
    return {
        ...base,
        puntosPorPesoVentaPartner: Number(s.puntosPorPesoVentaPartner) || 0,
    };
}

const FOTO_ASPECTS = ['16:9', '4:3', '1:1', '3:4'];

function normalizeFotoAspect(value) {
    const v = String(value || '').trim();
    return FOTO_ASPECTS.includes(v) ? v : '16:9';
}

function serializeReward(r, extras = {}) {
    const costo = Number(r.costoPuntos) || 0;
    const maxUsos =
        r.maxUsosPorUsuario == null || r.maxUsosPorUsuario === ''
            ? null
            : Math.max(1, Math.floor(Number(r.maxUsosPorUsuario) || 0)) || null;
    return {
        _id: r._id,
        sponsor: r.sponsor,
        titulo: r.titulo,
        descripcion: r.descripcion || '',
        fotoUrl: r.fotoUrl || '',
        fotoAspect: normalizeFotoAspect(r.fotoAspect),
        costoPuntos: costo,
        rolesCanje: expandSponsorRoles(Array.isArray(r.rolesCanje) ? r.rolesCanje : []),
        tipo: r.tipo,
        valor: r.valor,
        activo: r.activo,
        stock: r.stock == null ? null : Number(r.stock),
        vigenciaHasta: r.vigenciaHasta || null,
        maxUsosPorUsuario: maxUsos,
        ...extras,
    };
}

function parseOptionalLimit(raw) {
    if (raw == null || raw === '') return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
}

function parseOptionalStock(raw) {
    if (raw == null || raw === '') return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

function parseVigenciaHasta(raw) {
    if (raw == null || raw === '') return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    // Inclusive end-of-day in UTC calendar date if YYYY-MM-DD
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return new Date(`${s}T23:59:59.999Z`);
    }
    return d;
}

const getSettings = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    res.json({ settings: serializeSettings(settings, { includeAdminRates: true }) });
});

const updateSettings = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    const b = req.body || {};
    if (b.enabled !== undefined) settings.enabled = Boolean(b.enabled);
    if (b.nombrePuntos != null) settings.nombrePuntos = String(b.nombrePuntos).trim() || 'Créditos';
    if (b.diasVigenciaPuntos != null) {
        settings.diasVigenciaPuntos = Math.min(3650, Math.max(1, Number(b.diasVigenciaPuntos) || 90));
    }
    if (b.puntosPorCuotaAlDia != null) {
        settings.puntosPorCuotaAlDia = Math.max(0, Math.floor(Number(b.puntosPorCuotaAlDia) || 0));
    }
    if (b.puntosPorPesoVentaPartner != null) {
        settings.puntosPorPesoVentaPartner = Math.max(0, Number(b.puntosPorPesoVentaPartner) || 0);
    }
    await settings.save();
    res.json({
        settings: serializeSettings(settings, { includeAdminRates: true }),
        message: 'Configuración actualizada.',
    });
});

const getMyLoyalty = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    if (!settings.enabled) {
        return res.json({ enabled: false, settings: serializeSettings(settings), balance: 0 });
    }
    const user = await req.models.User.findById(req.user._id)
        .select('puntosLealtad puedeCanjearPuntos rol roles')
        .lean();
    const next = await nextExpiryForUser(req.models, req.user._id);
    const [ledgerRaw, pendingRaw] = await Promise.all([
        req.models.LoyaltyLedgerEntry.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        req.models.LoyaltyRedemption.find({
            user: req.user._id,
            estado: 'pendiente',
            expiresAt: { $gt: new Date() },
        })
            .select('codigo snapshotTitulo puntosGastados expiresAt createdAt chargeOnConfirm')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
    ]);

    const userRoles = normalizeUserRoles(user);
    // Expand legacy staff/todos tokens in JS — Mongo $in cannot match those aliases.
    const [sponsors, rewardDocs] = await Promise.all([
        req.models.Sponsor.find({ activo: true }).select('rolesCanjeCreditos').lean(),
        req.models.LoyaltyReward.find({ activo: true, costoPuntos: { $gte: 1 } })
            .populate('sponsor', 'rolesCanjeCreditos activo')
            .select('rolesCanje sponsor')
            .lean(),
    ]);
    const sponsorOk = sponsors.some((s) => {
        const allowed = expandSponsorRoles(s.rolesCanjeCreditos);
        return userRoles.some((role) => allowed.includes(role));
    });
    const rewardOk = rewardDocs.some((r) => {
        if (!r.sponsor || r.sponsor.activo === false) return false;
        const allowed = resolveCanjeRoles(r, r.sponsor);
        return userRoles.some((role) => allowed.includes(role));
    });
    const puedeCanjearPuntos = sponsorOk || rewardOk;
    const balance = Number(user?.puntosLealtad) || 0;
    const reserved = await reservedPendingPoints(req.models, req.user._id);

    res.json({
        enabled: true,
        settings: serializeSettings(settings),
        balance,
        reservedPendiente: reserved,
        disponible: Math.max(0, balance - reserved),
        puedeCanjearPuntos,
        nextExpiry: next
            ? { expiresAt: next.expiresAt, remaining: next.remaining }
            : null,
        ledger: ledgerRaw.map(serializeLedgerEntry),
        pendingCanjes: pendingRaw.map((p) => ({
            _id: p._id,
            codigo: p.codigo,
            titulo: p.snapshotTitulo || 'Canje',
            puntos: p.puntosGastados,
            expiresAt: p.expiresAt,
            createdAt: p.createdAt,
            reservado: p.chargeOnConfirm === true,
        })),
    });
});

const listRewards = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    if (!settings.enabled) return res.json({ enabled: false, rewards: [] });

    // Incluye canjes con créditos y beneficios libres (costo 0).
    const filter = { activo: true };
    if (req.query.sponsor) filter.sponsor = req.query.sponsor;

    const rewards = await req.models.LoyaltyReward.find(filter)
        .populate('sponsor', 'nombre fotoUrl rolesCanjeCreditos rolesAplicables activo')
        .sort({ createdAt: -1 })
        .lean();

    const userRoles = normalizeUserRoles(req.user);

    const now = new Date();
    const visible = rewards.filter((r) => {
        if (!r.sponsor || r.sponsor.activo === false) return false;
        if (r.vigenciaHasta && new Date(r.vigenciaHasta) < now) return false;
        if (r.stock != null && Number(r.stock) <= 0) return false;
        const allowed = resolveCanjeRoles(r, r.sponsor);
        if (allowed.length) return userRoles.some((role) => allowed.includes(role));
        // Beneficio libre sin roles de canje: visible si matchea rolesAplicables del sponsor (o todos).
        const cost = Number(r.costoPuntos) || 0;
        if (cost > 0) return false;
        const audience = expandSponsorRoles(r.sponsor.rolesAplicables || []);
        if (!audience.length) return true;
        return userRoles.some((role) => audience.includes(role));
    });

    const rewardIds = visible.map((r) => r._id);
    const usageByReward = {};
    if (rewardIds.length && req.user?._id) {
        const rows = await req.models.LoyaltyRedemption.aggregate([
            {
                $match: {
                    user: req.user._id,
                    reward: { $in: rewardIds },
                    $or: [
                        { estado: 'usado' },
                        { estado: 'pendiente', expiresAt: { $gte: now } },
                    ],
                },
            },
            { $group: { _id: '$reward', n: { $sum: 1 } } },
        ]);
        for (const row of rows) {
            usageByReward[String(row._id)] = row.n;
        }
    }

    res.json({
        enabled: true,
        settings: serializeSettings(settings),
        rewards: visible.map((r) => {
            const usosUsuario = usageByReward[String(r._id)] || 0;
            const maxUsos =
                r.maxUsosPorUsuario == null ? null : Math.max(1, Math.floor(Number(r.maxUsosPorUsuario) || 0));
            return serializeReward(r, {
                usosUsuario,
                usosRestantesUsuario:
                    maxUsos == null ? null : Math.max(0, maxUsos - usosUsuario),
            });
        }),
    });
});

const adminListRewards = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    const filter = {};
    if (req.query.sponsor) filter.sponsor = req.query.sponsor;
    if (req.query.includeInactive !== '1') filter.activo = true;
    const rewards = await req.models.LoyaltyReward.find(filter)
        .populate('sponsor', 'nombre fotoUrl')
        .sort({ createdAt: -1 })
        .lean();
    res.json({
        settings: serializeSettings(settings),
        rewards: rewards.map((r) => serializeReward(r)),
    });
});

const createReward = asyncHandler(async (req, res) => {
    const { sponsor, titulo, descripcion, costoPuntos, tipo, valor, stock, vigenciaHasta, maxUsosPorUsuario } =
        req.body || {};
    const cost = Math.max(0, Math.floor(Number(costoPuntos) || 0));
    if (!sponsor || !titulo) {
        res.status(400);
        throw new Error('Sponsor y título son obligatorios.');
    }
    if (cost > 0) {
        await requireLoyaltyEnabled(req.models);
    }
    const exists = await req.models.Sponsor.findById(sponsor).select('_id');
    if (!exists) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    const rolesCanje = expandSponsorRoles(req.body?.rolesCanje);
    if (!rolesCanje.length) {
        res.status(400);
        throw new Error('Seleccioná al menos un tipo de usuario para el descuento.');
    }
    const doc = await req.models.LoyaltyReward.create({
        sponsor,
        titulo: String(titulo).trim(),
        descripcion: String(descripcion || '').trim(),
        fotoUrl: String(req.body?.fotoUrl || '').trim(),
        fotoAspect: normalizeFotoAspect(req.body?.fotoAspect),
        rolesCanje,
        costoPuntos: cost,
        tipo: tipo || 'porcentaje',
        valor: Number(valor) || 0,
        stock: parseOptionalStock(stock),
        vigenciaHasta: parseVigenciaHasta(vigenciaHasta),
        maxUsosPorUsuario: parseOptionalLimit(maxUsosPorUsuario),
        activo: true,
    });
    res.status(201).json({ reward: serializeReward(doc), message: 'Beneficio creado.' });
});

const updateReward = asyncHandler(async (req, res) => {
    const doc = await req.models.LoyaltyReward.findById(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Beneficio no encontrado.');
    }
    const b = req.body || {};
    const nextCost =
        b.costoPuntos != null ? Math.max(0, Math.floor(Number(b.costoPuntos) || 0)) : doc.costoPuntos;
    if (nextCost > 0) {
        await requireLoyaltyEnabled(req.models);
    }
    if (b.titulo != null) doc.titulo = String(b.titulo).trim();
    if (b.descripcion != null) doc.descripcion = String(b.descripcion).trim();
    if (b.fotoUrl != null) doc.fotoUrl = String(b.fotoUrl || '').trim();
    if (b.fotoAspect != null) doc.fotoAspect = normalizeFotoAspect(b.fotoAspect);
    if (b.rolesCanje != null) {
        doc.rolesCanje = expandSponsorRoles(b.rolesCanje);
    }
    if (b.costoPuntos != null) doc.costoPuntos = nextCost;
    if (b.tipo != null) doc.tipo = b.tipo;
    if (b.valor != null) doc.valor = Number(b.valor) || 0;
    if (b.activo != null) doc.activo = Boolean(b.activo);
    if (b.stock !== undefined) {
        doc.stock = parseOptionalStock(b.stock);
    }
    if (b.vigenciaHasta !== undefined) {
        doc.vigenciaHasta = parseVigenciaHasta(b.vigenciaHasta);
    }
    if (b.maxUsosPorUsuario !== undefined) {
        doc.maxUsosPorUsuario = parseOptionalLimit(b.maxUsosPorUsuario);
    }
    await doc.save();
    res.json({ reward: serializeReward(doc), message: 'Beneficio actualizado.' });
});

const deleteReward = asyncHandler(async (req, res) => {
    const doc = await req.models.LoyaltyReward.findById(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Beneficio no encontrado.');
    }
    doc.activo = false;
    await doc.save();
    res.json({ message: 'Beneficio desactivado.' });
});

const adjustPoints = asyncHandler(async (req, res) => {
    const settings = await requireLoyaltyEnabled(req.models);
    const { userId, delta, note } = req.body || {};
    if (!userId || delta == null || Number(delta) === 0) {
        res.status(400);
        throw new Error('Indicá usuario y un delta distinto de cero.');
    }
    const amount = Math.floor(Number(delta));
    let entry;
    if (amount > 0) {
        entry = await creditPoints(req.models, {
            userId,
            amount,
            reason: 'ajuste_admin',
            ref: `adj:${userId}:${Date.now()}`,
            createdBy: req.user._id,
            note: note || 'Ajuste admin',
            settings,
        });
    } else {
        entry = await debitPoints(req.models, {
            userId,
            amount: Math.abs(amount),
            reason: 'ajuste_admin',
            ref: `adj:${userId}:${Date.now()}`,
            createdBy: req.user._id,
            note: note || 'Ajuste admin',
        });
    }
    try {
        const abs = Math.abs(amount);
        await createAppNotification(req.models, {
            usuario: userId,
            tipo: 'creditos_ajuste',
            titulo: amount > 0 ? 'Créditos sumados' : 'Créditos descontados',
            mensaje:
                amount > 0
                    ? `El club te sumó ${abs} crédito${abs === 1 ? '' : 's'}.`
                    : `El club descontó ${abs} crédito${abs === 1 ? '' : 's'}.`,
            referencia: entry?._id || null,
        });
    } catch (e) {
        console.warn('[loyalty] notify adjust:', e.message);
    }
    const user = await req.models.User.findById(userId).select('puntosLealtad puedeCanjearPuntos nombre apellido');
    res.json({
        entry,
        user: {
            _id: user._id,
            puntosLealtad: user.puntosLealtad,
            puedeCanjearPuntos: user.puedeCanjearPuntos,
            nombre: user.nombre,
            apellido: user.apellido,
        },
        message: 'Créditos actualizados.',
    });
});

const setCanRedeem = asyncHandler(async (req, res) => {
    const { userId, puedeCanjearPuntos } = req.body || {};
    if (!userId) {
        res.status(400);
        throw new Error('Indicá el usuario.');
    }
    const user = await req.models.User.findById(userId).select('puedeCanjearPuntos nombre apellido puntosLealtad');
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }
    user.puedeCanjearPuntos = Boolean(puedeCanjearPuntos);
    await user.save();
    res.json({
        user: {
            _id: user._id,
            puedeCanjearPuntos: user.puedeCanjearPuntos,
            puntosLealtad: user.puntosLealtad,
            nombre: user.nombre,
            apellido: user.apellido,
        },
        message: 'Permiso de canje actualizado.',
    });
});

const redeem = asyncHandler(async (req, res) => {
    const result = await redeemReward(req.models, {
        userId: req.user._id,
        rewardId: req.params.id,
    });
    res.status(201).json({
        redemption: result.redemption,
        qrValue: result.qrValue,
        codigo: result.redemption.codigo,
        expiresAt: result.redemption.expiresAt,
        settings: serializeSettings(result.settings),
    });
});

const getRedemption = asyncHandler(async (req, res) => {
    const doc = await req.models.LoyaltyRedemption.findById(req.params.id)
        .populate('sponsor', 'nombre fotoUrl')
        .lean();
    if (!doc) {
        res.status(404);
        throw new Error('Canje no encontrado.');
    }
    const isOwner = String(doc.user) === String(req.user._id);
    const isPartner = userHasRole(req.user, 'partner');
    const isAdmin = ['admin_club', 'administrativo', 'dirigente'].includes(req.user.rol);
    if (!isOwner && !isPartner && !isAdmin) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    res.json({
        redemption: doc,
        qrValue: doc.estado === 'pendiente' ? `gpsports:reward:${doc.tokenNonce}` : null,
    });
});

async function partnerSponsorId(req) {
    const roles = normalizeUserRoles(req.user);
    if (!roles.includes('partner')) {
        const err = new Error('Solo partners pueden validar canjes.');
        err.statusCode = 403;
        throw err;
    }
    let sponsorId = req.user.partnerSponsor;
    if (!sponsorId) {
        const fresh = await req.models.User.findById(req.user._id).select('partnerSponsor').lean();
        sponsorId = fresh?.partnerSponsor;
    }
    if (!sponsorId) {
        const err = new Error('Tu usuario partner no está vinculado a un sponsor.');
        err.statusCode = 400;
        throw err;
    }
    return String(sponsorId);
}

const partnerScan = asyncHandler(async (req, res) => {
    await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const raw = String(req.body?.qrValue || req.body?.token || '').trim();
    const token = raw.startsWith('gpsports:reward:')
        ? raw.slice('gpsports:reward:'.length)
        : raw;
    if (!token) {
        res.status(400);
        throw new Error('QR inválido.');
    }
    const redemption = await req.models.LoyaltyRedemption.findOne({ tokenNonce: token })
        .populate('user', 'nombre apellido dni')
        .populate('reward', 'titulo tipo valor costoPuntos')
        .populate('sponsor', 'nombre');
    if (!redemption) {
        res.status(404);
        throw new Error('Canje no encontrado.');
    }
    if (String(redemption.sponsor._id || redemption.sponsor) !== sponsorId) {
        res.status(403);
        throw new Error('Este canje es de otro sponsor.');
    }
    res.json({
        redemption,
        preview: {
            usuario: redemption.user,
            beneficio: redemption.snapshotTitulo || redemption.reward?.titulo,
            tipo: redemption.snapshotTipo,
            valor: redemption.snapshotValor,
            estado: redemption.estado,
            expiresAt: redemption.expiresAt,
        },
    });
});

const partnerScanConfirm = asyncHandler(async (req, res) => {
    await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const redemption = await req.models.LoyaltyRedemption.findById(req.body?.redemptionId);
    if (!redemption) {
        res.status(404);
        throw new Error('Canje no encontrado.');
    }
    if (String(redemption.sponsor) !== sponsorId) {
        res.status(403);
        throw new Error('Este canje es de otro sponsor.');
    }
    const result = await markRedemptionUsed(req.models, {
        redemption,
        validatorId: req.user._id,
    });
    if (!result.already) {
        await notifyCanjeUsed(req.models, result.redemption);
    }
    res.json({
        already: result.already,
        redemption: result.redemption,
        message: result.already ? 'Ya estaba usado.' : 'Canje validado.',
    });
});

const partnerRedeemByCode = asyncHandler(async (req, res) => {
    await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();
    if (!codigo) {
        res.status(400);
        throw new Error('Indicá el código.');
    }
    const redemption = await req.models.LoyaltyRedemption.findOne({ codigo });
    if (!redemption) {
        res.status(404);
        throw new Error('Código no encontrado.');
    }
    if (String(redemption.sponsor) !== sponsorId) {
        res.status(403);
        throw new Error('Este canje es de otro sponsor.');
    }
    const result = await markRedemptionUsed(req.models, {
        redemption,
        validatorId: req.user._id,
    });
    if (!result.already) {
        await notifyCanjeUsed(req.models, result.redemption);
    }
    res.json({
        already: result.already,
        redemption: result.redemption,
        message: result.already ? 'Ya estaba usado.' : 'Canje validado.',
    });
});

const partnerLookupMember = asyncHandler(async (req, res) => {
    await requireLoyaltyEnabled(req.models);
    await partnerSponsorId(req);
    const dni = String(req.query.dni || req.body?.dni || '').trim();
    if (!dni) {
        res.status(400);
        throw new Error('Ingresá un DNI.');
    }
    const user = await findMemberByDni(req.models.User, dni);
    if (!user) {
        res.status(404);
        throw new Error('No se encontró un socio con ese DNI.');
    }
    if (userHasRole(user, 'partner')) {
        res.status(400);
        throw new Error('Ese DNI pertenece a una cuenta partner.');
    }
    res.json({ user: serializePartnerMember(user) });
});

const partnerReportSale = asyncHandler(async (req, res) => {
    const settings = await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const { dni, monto, note } = req.body || {};
    const amount = Number(monto);
    if (!Number.isFinite(amount) || amount < 0) {
        res.status(400);
        throw new Error('Indicá un monto válido.');
    }
    const dniRaw = String(dni || '').trim();
    if (!dniRaw) {
        res.status(400);
        throw new Error('Indicá el DNI del socio.');
    }
    const member = await findMemberByDni(req.models.User, dniRaw);
    if (!member) {
        res.status(404);
        throw new Error('No se encontró un socio con ese DNI.');
    }
    if (userHasRole(member, 'partner')) {
        res.status(400);
        throw new Error('Ese DNI pertenece a una cuenta partner.');
    }
    const userId = member._id;
    const rate = Number(settings.puntosPorPesoVentaPartner) || 0;
    const puntos = Math.floor(amount * rate);
    const sale = await req.models.LoyaltyPartnerSale.create({
        sponsor: sponsorId,
        user: userId,
        monto: amount,
        puntosOtorgados: puntos,
        createdBy: req.user._id,
        note: note || '',
    });
    let entry = null;
    if (puntos > 0) {
        entry = await creditPoints(req.models, {
            userId,
            amount: puntos,
            reason: 'venta_partner',
            ref: `sale:${sale._id}`,
            createdBy: req.user._id,
            note: note || 'Venta partner',
            settings,
        });
        const sponsor = await req.models.Sponsor.findById(sponsorId).select('nombre').lean();
        await notifyCreditsEarned(req.models, {
            userId,
            puntos,
            saleId: sale._id,
            sponsorNombre: sponsor?.nombre || '',
        });
    }
    res.status(201).json({
        sale,
        entry,
        user: serializePartnerMember(member),
        message: puntos ? `Se otorgaron ${puntos} créditos.` : 'Venta registrada (0 créditos).',
    });
});

const partnerListRewards = asyncHandler(async (req, res) => {
    const settings = await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const rewards = await req.models.LoyaltyReward.find({ sponsor: sponsorId, activo: true })
        .sort({ createdAt: -1 })
        .lean();
    res.json({
        settings: serializeSettings(settings),
        rewards: rewards.map((r) => serializeReward(r)),
    });
});

const runExpire = asyncHandler(async (req, res) => {
    const result = await expireLoyaltyPoints(req.models);
    res.json({ ...result, message: 'Expiración ejecutada.' });
});

const listRedemptions = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.sponsor) filter.sponsor = req.query.sponsor;
    if (req.query.estado) filter.estado = req.query.estado;
    const items = await req.models.LoyaltyRedemption.find(filter)
        .populate('user', 'nombre apellido')
        .populate('sponsor', 'nombre')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    res.json({ redemptions: items });
});

export {
    getSettings,
    updateSettings,
    getMyLoyalty,
    listRewards,
    adminListRewards,
    createReward,
    updateReward,
    deleteReward,
    adjustPoints,
    setCanRedeem,
    redeem,
    getRedemption,
    partnerScan,
    partnerScanConfirm,
    partnerRedeemByCode,
    partnerLookupMember,
    partnerReportSale,
    partnerListRewards,
    runExpire,
    listRedemptions,
};
