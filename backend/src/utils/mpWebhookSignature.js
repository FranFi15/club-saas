import crypto from 'crypto';

/**
 * Valida x-signature de notificaciones Webhooks de Mercado Pago.
 * Manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
 * @see https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(req, secret) {
    if (!secret) return { ok: false, reason: 'missing_secret' };

    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (!xSignature || typeof xSignature !== 'string') {
        return { ok: false, reason: 'missing_signature' };
    }

    const parts = {};
    for (const segment of xSignature.split(',')) {
        const [k, ...rest] = segment.trim().split('=');
        if (k && rest.length) parts[k.trim()] = rest.join('=').trim();
    }
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return { ok: false, reason: 'malformed_signature' };

    const dataIdRaw =
        req.query?.['data.id'] ??
        req.query?.id ??
        (req.body?.data?.id != null ? String(req.body.data.id) : undefined);
    const dataId = dataIdRaw != null ? String(dataIdRaw).toLowerCase() : '';

    let manifest = '';
    if (dataId) manifest += `id:${dataId};`;
    if (xRequestId) manifest += `request-id:${xRequestId};`;
    manifest += `ts:${ts};`;

    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    try {
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(String(v1), 'utf8');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return { ok: false, reason: 'mismatch' };
        }
    } catch {
        return { ok: false, reason: 'compare_failed' };
    }

    return { ok: true };
}

export function getMercadoPagoWebhookSecret() {
    return (
        process.env.MP_WEBHOOK_SECRET?.trim() ||
        process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() ||
        ''
    );
}

/** Compara montos con tolerancia de centavos (ARS). */
export function amountsMatch(expected, paid, tolerance = 1) {
    const e = Number(expected);
    const p = Number(paid);
    if (!Number.isFinite(e) || !Number.isFinite(p)) return false;
    return Math.abs(e - p) <= tolerance;
}
