import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { sendCuotaReminders } from '../services/cuotaReminders.service.js';
import { parseLocalHourEnv, shouldRunClubCron } from '../utils/clubCronTime.js';
import { DEFAULT_CLUB_TIMEZONE, normalizeClubTimezone } from '../utils/timeHelper.js';

/**
 * Recordatorios de cuota a la hora local del club.
 * Activar con ENABLE_PAYMENT_REMINDER_CRON=true.
 * Default local hour 10.
 */
export function startPaymentRemindersCron() {
    if (process.env.ENABLE_PAYMENT_REMINDER_CRON !== 'true') {
        console.log(
            '[cron-reminders] Desactivado. Usá ENABLE_PAYMENT_REMINDER_CRON=true para enviar recordatorios automáticamente.',
        );
        return;
    }
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.warn('[cron-reminders] Faltan SUPER_ADMIN_URL o INTERNAL_ADMIN_API_KEY; no se programa el job.');
        return;
    }

    const schedule = process.env.PAYMENT_REMINDER_CRON_SCHEDULE || '0 * * * *';
    const localHour = parseLocalHourEnv('PAYMENT_REMINDER_CRON_LOCAL_HOUR', 10);

    const run = async () => {
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-reminders] No se pudo obtener el índice de tenants:', e.response?.data || e.message);
            return;
        }

        let totalEnviados = 0;
        let ran = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            const timezone = normalizeClubTimezone(t.timezone || DEFAULT_CLUB_TIMEZONE);
            if (!shouldRunClubCron(timezone, { hour: localHour })) continue;

            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const { enviados } = await sendCuotaReminders(models, { timezone });
                totalEnviados += enviados;
                ran += 1;
                if (enviados > 0) {
                    console.log(`[cron-reminders] ${t.urlIdentifier}: ${enviados} recordatorio(s).`);
                }
            } catch (e) {
                console.error(`[cron-reminders] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        if (ran > 0) {
            console.log(
                `[cron-reminders] Fin de corrida local hour=${localHour}. Enviados: ${totalEnviados} (${ran}/${tenants.length} club(es)).`,
            );
        }
    };

    cron.schedule(schedule, run);
    console.log(
        `[cron-reminders] Programado "${schedule}" → hora local ${localHour} (PAYMENT_REMINDER_CRON_LOCAL_HOUR).`,
    );

    if (process.env.PAYMENT_REMINDER_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-reminders] Run on start:', e));
    }
}
