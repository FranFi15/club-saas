import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { maintainSessionBufferForTenant } from '../services/sessionFromSchedule.service.js';

/**
 * Cron diario: por cada club, si hay menos de N sesiones programadas futuras,
 * crea las que falten hasta la fecha límite configurada por el admin.
 * Activar con ENABLE_SESSION_CRON=true.
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

    const schedule = process.env.SESSION_CRON_SCHEDULE || '0 3 * * *';

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
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const result = await maintainSessionBufferForTenant(models);
                totalNuevas += result.creadasCount || 0;
                if (result.omitido && result.motivo) {
                    console.log(`[cron-sessions] ${t.urlIdentifier}: omitido — ${result.motivo}`);
                } else if (result.creadasCount > 0) {
                    console.log(
                        `[cron-sessions] ${t.urlIdentifier}: +${result.creadasCount} sesión(es) (${result.futurasAntes} → ${result.futurasDespues} futuras)`,
                    );
                }
                if (result.errores?.length) {
                    console.warn(`[cron-sessions] ${t.urlIdentifier}: ${result.errores.length} error(es)`);
                }
            } catch (e) {
                console.error(`[cron-sessions] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        console.log(`[cron-sessions] Fin de corrida. Sesiones nuevas en total: ${totalNuevas} (${tenants.length} club(es))`);
    };

    cron.schedule(schedule, run);
    console.log(
        `[cron-sessions] Programado "${schedule}" — mantiene mínimo de sesiones futuras respetando vigenteHasta de cada horario.`,
    );

    if (process.env.SESSION_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-sessions] Run on start:', e));
    }
}
