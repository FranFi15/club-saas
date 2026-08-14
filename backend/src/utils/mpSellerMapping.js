import axios from 'axios';

const MP_USERS_ME = 'https://api.mercadopago.com/users/me';

/** Seller id desde la respuesta OAuth o GET /users/me. */
export async function resolveMercadoPagoSellerId(tokenData, accessToken) {
    if (tokenData?.user_id != null && String(tokenData.user_id).trim()) {
        return String(tokenData.user_id).trim();
    }
    const token = String(accessToken || tokenData?.access_token || '').trim();
    if (!token) return null;
    try {
        const { data } = await axios.get(MP_USERS_ME, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (data?.id != null) return String(data.id).trim();
    } catch (e) {
        console.warn('[mp-seller] users/me falló:', e.response?.data || e.message);
    }
    return null;
}

/** Registra o limpia el mapping en Super (webhooks sin ?club=). @returns {Promise<boolean>} */
export async function syncMercadoPagoUserMapping(clubIdentifier, mercadopagoUserId) {
    const base = process.env.SUPER_ADMIN_URL?.replace(/\/$/, '');
    const key = process.env.INTERNAL_ADMIN_API_KEY;
    if (!base || !key || !clubIdentifier) return false;

    const value =
        mercadopagoUserId === null || mercadopagoUserId === undefined
            ? ''
            : String(mercadopagoUserId).trim();

    try {
        await axios.put(
            `${base}/api/clubs/internal/${encodeURIComponent(clubIdentifier)}/mp-user`,
            { mercadopagoUserId: value },
            { headers: { 'x-internal-api-key': key } },
        );
        return true;
    } catch (e) {
        console.warn(
            '[mp-seller] no se pudo sincronizar mapping con Super:',
            e.response?.data?.message || e.message,
        );
        return false;
    }
}

/** Resuelve urlIdentifier del club desde el seller id de MP. */
export async function lookupClubIdentifierByMpUser(mpUserId) {
    const base = process.env.SUPER_ADMIN_URL?.replace(/\/$/, '');
    const key = process.env.INTERNAL_ADMIN_API_KEY;
    const id = String(mpUserId || '').trim();
    if (!base || !key || !id) return null;

    try {
        const { data } = await axios.get(
            `${base}/api/clubs/internal/by-mp-user/${encodeURIComponent(id)}`,
            { headers: { 'x-internal-api-key': key } },
        );
        return data?.urlIdentifier ? String(data.urlIdentifier) : null;
    } catch (e) {
        if (e.response?.status === 404) return null;
        console.warn(
            '[mp-seller] lookup by-mp-user falló:',
            e.response?.data?.message || e.message,
        );
        return null;
    }
}

export function extractMpWebhookUserId(req) {
    const fromBody = req.body?.user_id;
    if (fromBody != null && String(fromBody).trim()) return String(fromBody).trim();
    const fromQuery = req.query?.user_id;
    if (fromQuery != null && String(fromQuery).trim()) return String(fromQuery).trim();
    return null;
}

export function isMercadoPagoWebhookRequest(req) {
    if (req.method !== 'POST') return false;
    const url = String(req.originalUrl || req.url || '');
    return url.includes('/mercadopago/webhook');
}
