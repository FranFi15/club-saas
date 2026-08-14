import axios from 'axios';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import {
    resolveMercadoPagoSellerId,
    syncMercadoPagoUserMapping,
} from '../utils/mpSellerMapping.js';

const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

async function tryRefreshAccessToken(ClubSettings, doc) {
    const refresh = doc?.mercadopagoRefreshToken?.trim();
    if (
        !refresh ||
        !process.env.MERCADOPAGO_CLIENT_ID?.trim() ||
        !process.env.MERCADOPAGO_CLIENT_SECRET?.trim()
    ) {
        return doc?.mercadopagoAccessToken?.trim() || null;
    }

    try {
        const { data } = await axios.post(
            MP_TOKEN_URL,
            {
                client_id: process.env.MERCADOPAGO_CLIENT_ID.trim(),
                client_secret: process.env.MERCADOPAGO_CLIENT_SECRET.trim(),
                grant_type: 'refresh_token',
                refresh_token: refresh,
            },
            { headers: { 'Content-Type': 'application/json' } },
        );
        const newAccess = String(data.access_token || '').trim();
        if (!newAccess) return doc?.mercadopagoAccessToken?.trim() || null;

        const expiresMs = (Number(data.expires_in) || 15552000) * 1000;
        const newRefresh =
            (typeof data.refresh_token === 'string' && data.refresh_token.trim()) || refresh;

        await ClubSettings.findOneAndUpdate(
            {},
            {
                $set: {
                    mercadopagoAccessToken: newAccess,
                    mercadopagoRefreshToken: newRefresh,
                    mercadopagoAccessTokenExpiresAt: new Date(Date.now() + expiresMs),
                },
            },
            { upsert: true },
        );
        return newAccess;
    } catch (e) {
        console.warn(
            '[mp-seller-backfill] refresh falló:',
            e.response?.data?.message || e.message,
        );
        return doc?.mercadopagoAccessToken?.trim() || null;
    }
}

/**
 * Resuelve seller id del token del club y lo registra en Super.
 * @returns {{ ok: boolean, reason: string, sellerId?: string }}
 */
export async function backfillClubMpSellerMapping({ models, clubIdentifier, accessToken } = {}) {
    if (!clubIdentifier) return { ok: false, reason: 'no_club' };

    let token = typeof accessToken === 'string' ? accessToken.trim() : '';
    if (!token && models?.ClubSettings) {
        const doc = await models.ClubSettings.findOne();
        token = doc?.mercadopagoAccessToken?.trim() || '';
        if (!token && doc?.mercadopagoRefreshToken?.trim()) {
            token = (await tryRefreshAccessToken(models.ClubSettings, doc)) || '';
        }
    }

    if (!token) return { ok: false, reason: 'no_token' };

    const sellerId = await resolveMercadoPagoSellerId(null, token);
    if (!sellerId) return { ok: false, reason: 'users_me_failed' };

    const synced = await syncMercadoPagoUserMapping(clubIdentifier, sellerId);
    if (!synced) return { ok: false, reason: 'super_sync_failed', sellerId };

    return { ok: true, reason: 'ok', sellerId };
}

/** Recorre todos los tenants activos y registra seller ids faltantes. */
export async function backfillAllClubsMpSellers() {
    const superUrl = process.env.SUPER_ADMIN_URL?.replace(/\/$/, '');
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        return { skipped: true, reason: 'missing_super_env', results: [] };
    }

    let tenants = [];
    try {
        const { data } = await axios.get(`${superUrl}/api/clubs/internal/cron-tenants`, {
            headers: { 'x-internal-api-key': internalKey },
            timeout: 60000,
        });
        tenants = data.tenants || [];
    } catch (e) {
        console.error(
            '[mp-seller-backfill] No se pudo obtener tenants:',
            e.response?.data?.message || e.message,
        );
        return { skipped: true, reason: 'cron_tenants_failed', results: [] };
    }

    const results = [];
    for (const t of tenants) {
        if (!t.urlIdentifier || !t.connectionStringDB) continue;
        try {
            const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
            const tenantDB = await getTenantDB(t.urlIdentifier, cs);
            const models = getTenantModels(tenantDB);
            const outcome = await backfillClubMpSellerMapping({
                models,
                clubIdentifier: t.urlIdentifier,
            });
            results.push({ club: t.urlIdentifier, ...outcome });
            if (outcome.ok) {
                console.log(`[mp-seller-backfill] ${t.urlIdentifier}: seller ${outcome.sellerId}`);
            } else if (outcome.reason !== 'no_token') {
                console.warn(`[mp-seller-backfill] ${t.urlIdentifier}: ${outcome.reason}`);
            }
        } catch (e) {
            console.error(`[mp-seller-backfill] ${t.urlIdentifier}:`, e.message);
            results.push({ club: t.urlIdentifier, ok: false, reason: e.message });
        }
    }

    const mapped = results.filter((r) => r.ok).length;
    console.log(
        `[mp-seller-backfill] Listo: ${mapped}/${results.length} club(es) con seller mapeado (${tenants.length} tenant(s))`,
    );
    return { skipped: false, mapped, total: results.length, results };
}

/** Una corrida al arrancar el backend (desactivar con MP_SELLER_BACKFILL_ON_START=false). */
export function runMpSellerBackfillOnStart() {
    if (process.env.MP_SELLER_BACKFILL_ON_START === 'false') {
        console.log('[mp-seller-backfill] Desactivado (MP_SELLER_BACKFILL_ON_START=false).');
        return;
    }
    setTimeout(() => {
        backfillAllClubsMpSellers().catch((e) =>
            console.error('[mp-seller-backfill] on start:', e.message),
        );
    }, 2500);
}
