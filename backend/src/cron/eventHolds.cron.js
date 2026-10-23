import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { expireStaleHolds } from '../services/eventTicketIssue.service.js';

/**
 * Devuelve las entradas que quedaron reservadas y nadie pagó.
 * Corre cada minuto cuando el índice de clubes está configurado.
 */
export function startEventHoldCron() {
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.log('[cron-event-holds] Sin índice de clubes; las reservas vencen en la próxima visita al evento.');
        return;
    }
    if (process.env.ENABLE_EVENT_HOLD_CRON === 'false') {
        console.log('[cron-event-holds] Desactivado (ENABLE_EVENT_HOLD_CRON=false).');
        return;
    }

    const schedule = process.env.EVENT_HOLD_CRON_SCHEDULE || '* * * * *';

    const run = async () => {
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-event-holds] No se pudo obtener el índice de tenants:', e.response?.data || e.message);
            return;
        }

        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                await expireStaleHolds(models);
            } catch (e) {
                console.error(`[cron-event-holds] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
    };

    cron.schedule(schedule, run);
    console.log(`[cron-event-holds] Programado "${schedule}".`);
}
