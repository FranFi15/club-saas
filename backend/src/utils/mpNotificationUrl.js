/**
 * Mercado Pago rejects notification_url that is not a public HTTPS URL
 * (localhost / private LAN IPs → "notification_url attribute must be a valid url").
 */
export function isPublicHttpsWebhookBase(base) {
    const raw = String(base || '').trim().replace(/\/$/, '');
    if (!raw) return false;
    let u;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (/^10\.\d+\.\d+\.\d+$/.test(host)) return false;
    if (/^192\.168\.\d+\.\d+$/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return false;
    return true;
}

/**
 * @returns {string|undefined} Full webhook URL or undefined to omit from preference body.
 */
export function buildMpWebhookNotificationUrl(clubIdentifier) {
    const base =
        String(process.env.PUBLIC_API_URL || process.env.BACKEND_URL || '')
            .trim()
            .replace(/\/$/, '') || '';
    if (!clubIdentifier || !isPublicHttpsWebhookBase(base)) return undefined;
    return `${base}/api/mercadopago/webhook?club=${encodeURIComponent(clubIdentifier)}`;
}
