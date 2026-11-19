import asyncHandler from 'express-async-handler';
import { normalizeUserRoles, userHasRole } from '../constants/userRoles.js';
import {
    getOrCreateLoyaltySettings,
    requireLoyaltyEnabled,
    creditPoints,
    debitPoints,
    redeemReward,
    markRedemptionUsed,
    nextExpiryForUser,
    expireLoyaltyPoints,
} from '../services/loyalty.service.js';

function serializeSettings(s) {
    if (!s) return null;
    return {
        enabled: !!s.enabled,
        nombrePuntos: s.nombrePuntos || 'Créditos',
        valorPuntoPesos: Number(s.valorPuntoPesos) || 0,
        diasVigenciaPuntos: Number(s.diasVigenciaPuntos) || 90,
        puntosPorCuotaAlDia: Number(s.puntosPorCuotaAlDia) || 0,
        puntosPorPesoVentaPartner: Number(s.puntosPorPesoVentaPartner) || 0,
    };
}

function serializeReward(r, settings) {
    const costo = Number(r.costoPuntos) || 0;
    const valorPunto = Number(settings?.valorPuntoPesos) || 0;
    return {
        _id: r._id,
        sponsor: r.sponsor,
        titulo: r.titulo,
        descripcion: r.descripcion || '',
        costoPuntos: costo,
        equivalentePesos: costo * valorPunto,
        tipo: r.tipo,
        valor: r.valor,
        activo: r.activo,
        stock: r.stock,
        vigenciaHasta: r.vigenciaHasta,
    };
}

const getSettings = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    res.json({ settings: serializeSettings(settings) });
});

const updateSettings = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    const b = req.body || {};
    if (b.enabled !== undefined) settings.enabled = Boolean(b.enabled);
    if (b.nombrePuntos != null) settings.nombrePuntos = String(b.nombrePuntos).trim() || 'Créditos';
    if (b.valorPuntoPesos != null) settings.valorPuntoPesos = Math.max(0, Number(b.valorPuntoPesos) || 0);
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
    res.json({ settings: serializeSettings(settings), message: 'Configuración actualizada.' });
});

const getMyLoyalty = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    if (!settings.enabled) {
        return res.json({ enabled: false, settings: serializeSettings(settings), balance: 0 });
    }
    const user = await req.models.User.findById(req.user._id)
        .select('puntosLealtad puedeCanjearPuntos')
        .lean();
    const next = await nextExpiryForUser(req.models, req.user._id);
    const ledger = await req.models.LoyaltyLedgerEntry.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();
    res.json({
        enabled: true,
        settings: serializeSettings(settings),
        balance: user?.puntosLealtad || 0,
        puedeCanjearPuntos: !!user?.puedeCanjearPuntos,
        nextExpiry: next
            ? { expiresAt: next.expiresAt, remaining: next.remaining }
            : null,
        ledger,
    });
});

const listRewards = asyncHandler(async (req, res) => {
    const settings = await getOrCreateLoyaltySettings(req.models);
    if (!settings.enabled) return res.json({ enabled: false, rewards: [] });

    const filter = { activo: true };
    if (req.query.sponsor) filter.sponsor = req.query.sponsor;

    const rewards = await req.models.LoyaltyReward.find(filter)
        .populate('sponsor', 'nombre fotoUrl')
        .sort({ createdAt: -1 })
        .lean();

    res.json({
        enabled: true,
        settings: serializeSettings(settings),
        rewards: rewards.map((r) => serializeReward(r, settings)),
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
        rewards: rewards.map((r) => serializeReward(r, settings)),
    });
});

const createReward = asyncHandler(async (req, res) => {
    await requireLoyaltyEnabled(req.models);
    const { sponsor, titulo, descripcion, costoPuntos, tipo, valor, stock, vigenciaHasta } = req.body || {};
    if (!sponsor || !titulo || !costoPuntos) {
        res.status(400);
        throw new Error('Sponsor, título y costo en créditos son obligatorios.');
    }
    const exists = await req.models.Sponsor.findById(sponsor).select('_id');
    if (!exists) {
        res.status(404);
        throw new Error('Sponsor no encontrado.');
    }
    const doc = await req.models.LoyaltyReward.create({
        sponsor,
        titulo: String(titulo).trim(),
        descripcion: String(descripcion || '').trim(),
        costoPuntos: Math.max(1, Math.floor(Number(costoPuntos) || 1)),
        tipo: tipo || 'porcentaje',
        valor: Number(valor) || 0,
        stock: stock == null || stock === '' ? null : Math.max(0, Math.floor(Number(stock))),
        vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null,
        activo: true,
    });
    const settings = await getOrCreateLoyaltySettings(req.models);
    res.status(201).json({ reward: serializeReward(doc, settings), message: 'Beneficio creado.' });
});

const updateReward = asyncHandler(async (req, res) => {
    await requireLoyaltyEnabled(req.models);
    const doc = await req.models.LoyaltyReward.findById(req.params.id);
    if (!doc) {
        res.status(404);
        throw new Error('Beneficio no encontrado.');
    }
    const b = req.body || {};
    if (b.titulo != null) doc.titulo = String(b.titulo).trim();
    if (b.descripcion != null) doc.descripcion = String(b.descripcion).trim();
    if (b.costoPuntos != null) doc.costoPuntos = Math.max(1, Math.floor(Number(b.costoPuntos) || 1));
    if (b.tipo != null) doc.tipo = b.tipo;
    if (b.valor != null) doc.valor = Number(b.valor) || 0;
    if (b.activo != null) doc.activo = Boolean(b.activo);
    if (b.stock !== undefined) {
        doc.stock = b.stock == null || b.stock === '' ? null : Math.max(0, Math.floor(Number(b.stock)));
    }
    if (b.vigenciaHasta !== undefined) {
        doc.vigenciaHasta = b.vigenciaHasta ? new Date(b.vigenciaHasta) : null;
    }
    await doc.save();
    const settings = await getOrCreateLoyaltySettings(req.models);
    res.json({ reward: serializeReward(doc, settings), message: 'Beneficio actualizado.' });
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
        equivalentePesos: result.equivalentePesos,
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
    res.json({
        already: result.already,
        redemption: result.redemption,
        message: result.already ? 'Ya estaba usado.' : 'Canje validado.',
    });
});

const partnerReportSale = asyncHandler(async (req, res) => {
    const settings = await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const { userId, monto, note } = req.body || {};
    const amount = Number(monto);
    if (!userId || !Number.isFinite(amount) || amount < 0) {
        res.status(400);
        throw new Error('Indicá usuario y monto válido.');
    }
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
    }
    res.status(201).json({ sale, entry, message: puntos ? `Se otorgaron ${puntos} créditos.` : 'Venta registrada (0 créditos).' });
});

const partnerListRewards = asyncHandler(async (req, res) => {
    const settings = await requireLoyaltyEnabled(req.models);
    const sponsorId = await partnerSponsorId(req);
    const rewards = await req.models.LoyaltyReward.find({ sponsor: sponsorId, activo: true })
        .sort({ createdAt: -1 })
        .lean();
    res.json({
        settings: serializeSettings(settings),
        rewards: rewards.map((r) => serializeReward(r, settings)),
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
    partnerReportSale,
    partnerListRewards,
    runExpire,
    listRedemptions,
};
