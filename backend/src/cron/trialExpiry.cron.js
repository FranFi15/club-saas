import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { processExpiredTrialsForTenant } from '../services/trialAthlete.service.js';

/**
 * Avisa a tutores y admins cuando vence un atleta de prueba.
 * Activar con ENABLE_TRIAL_EXPIRY_CRON=true (por defecto activo si no se setea false).
 * Schedule default: todos los días a las 09:00.
 */
export function startTrialExpiryCron() {
    if (process.env.ENABLE_TRIAL_EXPIRY_CRON === 'false') {
        console.log('[cron-trial] Desactivado (ENABLE_TRIAL_EXPIRY_CRON=false).');
        return;
    }
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.warn('[cron-trial] Faltan SUPER_ADMIN_URL o INTERNAL_ADMIN_API_KEY; no se programa el job.');
        return;
    }

    const schedule = process.env.TRIAL_EXPIRY_CRON_SCHEDULE || '0 9 * * *';

    const run = async () => {
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-trial] No se pudo obtener el índice de tenants:', e.response?.data || e.message);
            return;
        }

        let totalNotified = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const { notified } = await processExpiredTrialsForTenant(models);
                totalNotified += notified;
                if (notified > 0) {
                    console.log(`[cron-trial] ${t.urlIdentifier}: ${notified} aviso(s).`);
                }
            } catch (e) {
                console.error(`[cron-trial] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        console.log(
            `[cron-trial] Fin de corrida. Avisos: ${totalNotified} (${tenants.length} club(es)).`,
        );
    };

    cron.schedule(schedule, run);
    console.log(`[cron-trial] Programado "${schedule}" → vencimientos de atleta de prueba.`);

    if (process.env.TRIAL_EXPIRY_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-trial] Run on start:', e));
    }
}
