import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { maintainSessionBufferForTenant } from '../services/sessionFromSchedule.service.js';
import { parseLocalHourEnv, shouldRunClubCron } from '../utils/clubCronTime.js';
import { DEFAULT_CLUB_TIMEZONE, normalizeClubTimezone } from '../utils/timeHelper.js';

/**
 * Cron horario: por cada club, si es la hora local configurada,
 * mantiene el buffer de sesiones futuras.
 * Activar con ENABLE_SESSION_CRON=true.
 * Default local hour 3 (= ~00:00 ART when server is UTC).
 */
export function startSessionGenerationCron() {
    if (process.env.ENABLE_SESSION_CRON !== 'true') {
        console.log('[cron-sessions] Desactivado. Usá ENABLE_SESSION_CRON=true para generar sesiones por cron.');
        return;
    }
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.warn('[cron-sessions] Faltan SUPER_ADMIN_URL o INTERNAL_ADMIN_API_KEY; no se programa el job.');
        return;
    }

    const schedule = process.env.SESSION_CRON_SCHEDULE || '0 * * * *';
    const localHour = parseLocalHourEnv('SESSION_CRON_LOCAL_HOUR', 3);

    const run = async () => {
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-sessions] No se pudo obtener el índice de tenants:', e.response?.data || e.message);
            return;
        }

        let totalNuevas = 0;
        let ran = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            const timezone = normalizeClubTimezone(t.timezone || DEFAULT_CLUB_TIMEZONE);
            if (!shouldRunClubCron(timezone, { hour: localHour })) continue;

            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const result = await maintainSessionBufferForTenant(models);
                totalNuevas += result.creadasCount || 0;
                ran += 1;
                if (result.omitido && result.motivo) {
                    console.log(`[cron-sessions] ${t.urlIdentifier}: omitido — ${result.motivo}`);
                } else if (result.creadasCount > 0) {
                    console.log(`[cron-sessions] ${t.urlIdentifier}: +${result.creadasCount} sesión(es)`);
                }
            } catch (e) {
                console.error(`[cron-sessions] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        if (ran > 0) {
            console.log(
                `[cron-sessions] Fin de corrida local hour=${localHour}. Sesiones nuevas: ${totalNuevas} (${ran}/${tenants.length} club(es)).`,
            );
        }
    };

    cron.schedule(schedule, run);
    console.log(
        `[cron-sessions] Programado "${schedule}" — corre por club a la hora local ${localHour} (SESSION_CRON_LOCAL_HOUR).`,
    );

    if (process.env.SESSION_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-sessions] Run on start:', e));
    }
}
