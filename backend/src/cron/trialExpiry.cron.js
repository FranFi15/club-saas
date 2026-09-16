import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { processExpiredTrialsForTenant } from '../services/trialAthlete.service.js';
import { parseLocalHourEnv, shouldRunClubCron } from '../utils/clubCronTime.js';
import { DEFAULT_CLUB_TIMEZONE, normalizeClubTimezone } from '../utils/timeHelper.js';

/**
 * Avisa vencimientos de atleta de prueba a la hora local del club.
 * Activar con ENABLE_TRIAL_EXPIRY_CRON=true (por defecto activo si no se setea false).
 * Default local hour 9.
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

    const schedule = process.env.TRIAL_EXPIRY_CRON_SCHEDULE || '0 * * * *';
    const localHour = parseLocalHourEnv('TRIAL_EXPIRY_CRON_LOCAL_HOUR', 9);

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
        let ran = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            const timezone = normalizeClubTimezone(t.timezone || DEFAULT_CLUB_TIMEZONE);
            if (!shouldRunClubCron(timezone, { hour: localHour })) continue;

            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const { notified } = await processExpiredTrialsForTenant(models);
                totalNotified += notified;
                ran += 1;
                if (notified > 0) {
                    console.log(`[cron-trial] ${t.urlIdentifier}: ${notified} aviso(s).`);
                }
            } catch (e) {
                console.error(`[cron-trial] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        if (ran > 0) {
            console.log(
                `[cron-trial] Fin de corrida local hour=${localHour}. Avisos: ${totalNotified} (${ran}/${tenants.length} club(es)).`,
            );
        }
    };

    cron.schedule(schedule, run);
    console.log(
        `[cron-trial] Programado "${schedule}" → hora local ${localHour} (TRIAL_EXPIRY_CRON_LOCAL_HOUR).`,
    );

    if (process.env.TRIAL_EXPIRY_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-trial] Run on start:', e));
    }
}
