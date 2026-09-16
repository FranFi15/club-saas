import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { markOverduePayments } from '../services/overduePayments.service.js';
import { sendCuotaReminders } from '../services/cuotaReminders.service.js';
import { parseLocalHourEnv, shouldRunClubCron } from '../utils/clubCronTime.js';
import { DEFAULT_CLUB_TIMEZONE, normalizeClubTimezone } from '../utils/timeHelper.js';

/**
 * Marca cuotas vencidas a la hora local del club.
 * Activar con ENABLE_OVERDUE_CRON=true.
 * Default local hour 4.
 */
export function startOverduePaymentsCron() {
    if (process.env.ENABLE_OVERDUE_CRON !== 'true') {
        console.log('[cron-overdue] Desactivado. Usá ENABLE_OVERDUE_CRON=true para marcar vencimientos automáticamente.');
        return;
    }
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.warn('[cron-overdue] Faltan SUPER_ADMIN_URL o INTERNAL_ADMIN_API_KEY; no se programa el job.');
        return;
    }

    const schedule = process.env.OVERDUE_CRON_SCHEDULE || '0 * * * *';
    const localHour = parseLocalHourEnv('OVERDUE_CRON_LOCAL_HOUR', 4);

    const run = async () => {
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-overdue] No se pudo obtener el índice de tenants:', e.response?.data || e.message);
            return;
        }

        let totalMarcadas = 0;
        let totalReminders = 0;
        let ran = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            const timezone = normalizeClubTimezone(t.timezone || DEFAULT_CLUB_TIMEZONE);
            if (!shouldRunClubCron(timezone, { hour: localHour })) continue;

            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const modified = await markOverduePayments(models);
                totalMarcadas += modified;
                ran += 1;
                if (modified > 0) {
                    console.log(`[cron-overdue] ${t.urlIdentifier}: ${modified} cuota(s) marcada(s) como vencida(s).`);
                }
                const { enviados } = await sendCuotaReminders(models, { timezone });
                totalReminders += enviados;
                if (enviados > 0) {
                    console.log(`[cron-overdue] ${t.urlIdentifier}: ${enviados} recordatorio(s) de cuota.`);
                }
            } catch (e) {
                console.error(`[cron-overdue] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        if (ran > 0) {
            console.log(
                `[cron-overdue] Fin de corrida local hour=${localHour}. Cuotas marcadas: ${totalMarcadas}; recordatorios: ${totalReminders} (${ran}/${tenants.length} club(es)).`,
            );
        }
    };

    cron.schedule(schedule, run);
    console.log(
        `[cron-overdue] Programado "${schedule}" → hora local ${localHour} (OVERDUE_CRON_LOCAL_HOUR).`,
    );

    if (process.env.OVERDUE_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-overdue] Run on start:', e));
    }
}
