import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { expireLoyaltyPoints } from '../services/loyalty.service.js';

/** Daily expiry of loyalty credit batches. ENABLE_LOYALTY_EXPIRY_CRON=true */
export function startLoyaltyExpiryCron() {
    if (process.env.ENABLE_LOYALTY_EXPIRY_CRON !== 'true') {
        console.log('[cron-loyalty] Desactivado. Usá ENABLE_LOYALTY_EXPIRY_CRON=true.');
        return;
    }
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.warn('[cron-loyalty] Faltan SUPER_ADMIN_URL o INTERNAL_ADMIN_API_KEY.');
        return;
    }

    const schedule = process.env.LOYALTY_EXPIRY_CRON_SCHEDULE || '15 5 * * *';

    const run = async () => {
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-loyalty] Índice tenants:', e.response?.data || e.message);
            return;
        }

        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const result = await expireLoyaltyPoints(models);
                if (result.points > 0) {
                    console.log(
                        `[cron-loyalty] ${t.urlIdentifier}: ${result.points} pts en ${result.expiredUsers} usuario(s).`,
                    );
                }
            } catch (e) {
                console.error(`[cron-loyalty] ${t.urlIdentifier}:`, e.message);
            }
        }
    };

    cron.schedule(schedule, run);
    console.log(`[cron-loyalty] Programado "${schedule}".`);
}
