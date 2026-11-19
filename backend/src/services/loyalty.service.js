import crypto from 'crypto';

const REDEEM_TTL_MS = 30 * 60 * 1000;

export async function getOrCreateLoyaltySettings(models) {
    const { LoyaltySettings } = models;
    let doc = await LoyaltySettings.findOne({ singletonKey: 'default' });
    if (!doc) {
        doc = await LoyaltySettings.create({ singletonKey: 'default', enabled: false });
    }
    return doc;
}

export async function requireLoyaltyEnabled(models) {
    const settings = await getOrCreateLoyaltySettings(models);
    if (!settings.enabled) {
        const err = new Error('Los créditos del club no están activados.');
        err.statusCode = 400;
        throw err;
    }
    return settings;
}

function roundPts(n) {
    return Math.max(0, Math.floor(Number(n) || 0));
}

/**
 * Credit points (idempotent when ref is set).
 */
export async function creditPoints(models, {
    userId,
    amount,
    reason,
    ref = '',
    createdBy = null,
    note = '',
    settings: settingsIn,
} = {}) {
    const pts = roundPts(amount);
    if (pts <= 0) return null;

    const settings = settingsIn || (await getOrCreateLoyaltySettings(models));
    if (!settings.enabled && reason !== 'ajuste_admin') return null;

    const { User, LoyaltyLedgerEntry } = models;
    const refKey = ref ? String(ref) : '';

    if (refKey) {
        const existing = await LoyaltyLedgerEntry.findOne({ reason, ref: refKey }).lean();
        if (existing) return existing;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Math.max(1, Number(settings.diasVigenciaPuntos) || 90));

    const user = await User.findById(userId).select('puntosLealtad');
    if (!user) {
        const err = new Error('Usuario no encontrado.');
        err.statusCode = 404;
        throw err;
    }

    const balanceAfter = roundPts((user.puntosLealtad || 0) + pts);
    user.puntosLealtad = balanceAfter;
    await user.save();

    try {
        const entry = await LoyaltyLedgerEntry.create({
            user: userId,
            delta: pts,
            balanceAfter,
            reason,
            ref: refKey,
            createdBy,
            note: note || '',
            remaining: pts,
            expiresAt,
        });
        return entry;
    } catch (e) {
        if (e?.code === 11000 && refKey) {
            return LoyaltyLedgerEntry.findOne({ reason, ref: refKey });
        }
        throw e;
    }
}

/**
 * Debit points FIFO from non-expired credit batches.
 */
export async function debitPoints(models, {
    userId,
    amount,
    reason,
    ref = '',
    createdBy = null,
    note = '',
} = {}) {
    const pts = roundPts(amount);
    if (pts <= 0) {
        const err = new Error('Monto inválido.');
        err.statusCode = 400;
        throw err;
    }

    const { User, LoyaltyLedgerEntry } = models;
    const user = await User.findById(userId).select('puntosLealtad');
    if (!user) {
        const err = new Error('Usuario no encontrado.');
        err.statusCode = 404;
        throw err;
    }

    const available = roundPts(user.puntosLealtad);
    if (available < pts) {
        const err = new Error('Créditos insuficientes.');
        err.statusCode = 400;
        throw err;
    }

    const now = new Date();
    const batches = await LoyaltyLedgerEntry.find({
        user: userId,
        delta: { $gt: 0 },
        remaining: { $gt: 0 },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ expiresAt: 1, createdAt: 1 });

    let need = pts;
    let covered = 0;
    for (const batch of batches) {
        if (need <= 0) break;
        const take = Math.min(batch.remaining, need);
        batch.remaining -= take;
        need -= take;
        covered += take;
        await batch.save();
    }

    if (covered < pts) {
        const err = new Error('Créditos insuficientes o vencidos.');
        err.statusCode = 400;
        throw err;
    }

    const balanceAfter = available - pts;
    user.puntosLealtad = balanceAfter;
    await user.save();

    const entry = await LoyaltyLedgerEntry.create({
        user: userId,
        delta: -pts,
        balanceAfter,
        reason,
        ref: ref ? String(ref) : '',
        createdBy,
        note: note || '',
        remaining: 0,
        expiresAt: null,
    });
    return entry;
}

/** Expire leftover credit batches and reduce balances. */
export async function expireLoyaltyPoints(models) {
    const settings = await getOrCreateLoyaltySettings(models);
    if (!settings.enabled) return { expiredUsers: 0, points: 0 };

    const { User, LoyaltyLedgerEntry } = models;
    const now = new Date();
    const batches = await LoyaltyLedgerEntry.find({
        remaining: { $gt: 0 },
        expiresAt: { $lte: now },
    });

    let points = 0;
    const byUser = new Map();
    for (const batch of batches) {
        const left = batch.remaining;
        if (left <= 0) continue;
        batch.remaining = 0;
        await batch.save();
        points += left;
        const uid = String(batch.user);
        byUser.set(uid, (byUser.get(uid) || 0) + left);
    }

    for (const [uid, amt] of byUser) {
        const user = await User.findById(uid).select('puntosLealtad');
        if (!user) continue;
        const next = Math.max(0, roundPts(user.puntosLealtad) - amt);
        user.puntosLealtad = next;
        await user.save();
        await LoyaltyLedgerEntry.create({
            user: uid,
            delta: -amt,
            balanceAfter: next,
            reason: 'expiracion',
            ref: `exp:${uid}:${now.toISOString().slice(0, 10)}`,
            note: 'Vencimiento automático',
            remaining: 0,
        }).catch(() => {});
    }

    return { expiredUsers: byUser.size, points };
}

export async function nextExpiryForUser(models, userId) {
    const now = new Date();
    const batch = await models.LoyaltyLedgerEntry.findOne({
        user: userId,
        remaining: { $gt: 0 },
        expiresAt: { $gt: now },
    })
        .sort({ expiresAt: 1 })
        .select('expiresAt remaining')
        .lean();
    return batch || null;
}

function shortCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function nonce() {
    return crypto.randomBytes(16).toString('hex');
}

function userRolesList(user) {
    return [
        user?.rol,
        ...(Array.isArray(user?.roles) ? user.roles : []),
    ].filter(Boolean);
}

function userCanRedeemReward(user, reward, sponsor) {
    const fromReward = Array.isArray(reward?.rolesCanje) ? reward.rolesCanje : [];
    const fromSponsor = Array.isArray(sponsor?.rolesCanjeCreditos) ? sponsor.rolesCanjeCreditos : [];
    const allowed = fromReward.length ? fromReward : fromSponsor;
    if (!allowed.length) return false;
    return userRolesList(user).some((r) => allowed.includes(r));
}

export async function redeemReward(models, { userId, rewardId }) {
    const settings = await requireLoyaltyEnabled(models);
    const { User, LoyaltyReward, LoyaltyRedemption, Sponsor } = models;

    const user = await User.findById(userId).select('puedeCanjearPuntos puntosLealtad estado rol roles');
    if (!user) {
        const err = new Error('Usuario no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (user.estado === 'inactivo') {
        const err = new Error('Usuario inactivo.');
        err.statusCode = 403;
        throw err;
    }

    const reward = await LoyaltyReward.findById(rewardId);
    if (!reward || !reward.activo) {
        const err = new Error('Beneficio no disponible.');
        err.statusCode = 404;
        throw err;
    }

    const sponsor = await Sponsor.findById(reward.sponsor).select('rolesCanjeCreditos nombre activo');
    if (!sponsor || sponsor.activo === false) {
        const err = new Error('Sponsor no disponible.');
        err.statusCode = 400;
        throw err;
    }
    if (!userCanRedeemReward(user, reward, sponsor)) {
        const err = new Error('Tu rol no puede canjear este beneficio.');
        err.statusCode = 403;
        throw err;
    }
    if (reward.vigenciaHasta && reward.vigenciaHasta < new Date()) {
        const err = new Error('Este beneficio ya no está vigente.');
        err.statusCode = 400;
        throw err;
    }
    if (reward.stock != null && reward.stock <= 0) {
        const err = new Error('Sin stock de este beneficio.');
        err.statusCode = 400;
        throw err;
    }

    const cost = roundPts(reward.costoPuntos);
    await debitPoints(models, {
        userId,
        amount: cost,
        reason: 'canje',
        ref: `redeem-pending:${userId}:${rewardId}:${Date.now()}`,
        note: reward.titulo,
    });

    if (reward.stock != null) {
        reward.stock = Math.max(0, reward.stock - 1);
        await reward.save();
    }

    const codigo = shortCode();
    const tokenNonce = nonce();
    const expiresAt = new Date(Date.now() + REDEEM_TTL_MS);

    const redemption = await LoyaltyRedemption.create({
        user: userId,
        reward: reward._id,
        sponsor: reward.sponsor,
        puntosGastados: cost,
        codigo,
        tokenNonce,
        estado: 'pendiente',
        expiresAt,
        snapshotTitulo: reward.titulo,
        snapshotTipo: reward.tipo,
        snapshotValor: reward.valor,
    });

    return {
        redemption,
        settings,
        qrValue: `gpsports:reward:${tokenNonce}`,
        equivalentePesos: cost * (Number(settings.valorPuntoPesos) || 0),
    };
}

export async function markRedemptionUsed(models, {
    redemption,
    validatorId,
}) {
    if (redemption.estado === 'usado') {
        return { already: true, redemption };
    }
    if (redemption.estado !== 'pendiente') {
        const err = new Error('Este canje ya no es válido.');
        err.statusCode = 400;
        throw err;
    }
    if (redemption.expiresAt && redemption.expiresAt < new Date()) {
        redemption.estado = 'expirado';
        await redemption.save();
        const err = new Error('El código expiró.');
        err.statusCode = 400;
        throw err;
    }

    redemption.estado = 'usado';
    redemption.usadoEn = new Date();
    redemption.validadoPor = validatorId;
    await redemption.save();
    return { already: false, redemption };
}

/**
 * Credit on-time cuota payment if loyalty enabled and prev estado was not vencido.
 */
export async function maybeCreditOnTimeCuota(models, payment, { prevEstado, createdBy = null } = {}) {
    try {
        const settings = await getOrCreateLoyaltySettings(models);
        if (!settings.enabled) return null;
        if (prevEstado === 'vencido') return null;
        const pts = roundPts(settings.puntosPorCuotaAlDia);
        if (pts <= 0) return null;
        const userId = payment.atleta || payment.user;
        if (!userId) return null;
        return creditPoints(models, {
            userId,
            amount: pts,
            reason: 'cuota_al_dia',
            ref: `cuota:${payment._id}`,
            createdBy,
            note: 'Pago al día',
            settings,
        });
    } catch (e) {
        console.warn('[loyalty] cuota credit:', e.message);
        return null;
    }
}

export { REDEEM_TTL_MS };
