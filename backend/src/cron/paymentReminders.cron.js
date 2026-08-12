import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { sendCuotaReminders } from '../services/cuotaReminders.service.js';

/**
 * Recordatorios de cuota (próxima / vencida) para todos los clubs activos.
 * Activar con ENABLE_PAYMENT_REMINDER_CRON=true.
 * Por defecto: 10:00 todos los días.
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

    const schedule = process.env.PAYMENT_REMINDER_CRON_SCHEDULE || '0 10 * * *';

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
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const { enviados } = await sendCuotaReminders(models);
                totalEnviados += enviados;
                if (enviados > 0) {
                    console.log(`[cron-reminders] ${t.urlIdentifier}: ${enviados} recordatorio(s).`);
                }
            } catch (e) {
                console.error(`[cron-reminders] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        console.log(
            `[cron-reminders] Fin de corrida. Enviados en total: ${totalEnviados} (${tenants.length} club(es)).`,
        );
    };

    cron.schedule(schedule, run);
    console.log(`[cron-reminders] Programado "${schedule}" → recordatorios de cuota por club.`);

    if (process.env.PAYMENT_REMINDER_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-reminders] Run on start:', e));
    }
}
