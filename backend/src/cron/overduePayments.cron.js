import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { markOverduePayments } from '../services/overduePayments.service.js';
import { sendCuotaReminders } from '../services/cuotaReminders.service.js';

/**
 * Marca cuotas vencidas y aplica recargos para todos los clubs activos.
 * Activar con ENABLE_OVERDUE_CRON=true.
 * Por defecto: 04:00 todos los días.
 * Tras marcar vencidas, envía recordatorios pendientes (cuota_vencida / cuota_proxima).
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

    const schedule = process.env.OVERDUE_CRON_SCHEDULE || '0 4 * * *';

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
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const modified = await markOverduePayments(models);
                totalMarcadas += modified;
                if (modified > 0) {
                    console.log(`[cron-overdue] ${t.urlIdentifier}: ${modified} cuota(s) marcada(s) como vencida(s).`);
                }
                const { enviados } = await sendCuotaReminders(models);
                totalReminders += enviados;
                if (enviados > 0) {
                    console.log(`[cron-overdue] ${t.urlIdentifier}: ${enviados} recordatorio(s) de cuota.`);
                }
            } catch (e) {
                console.error(`[cron-overdue] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        console.log(
            `[cron-overdue] Fin de corrida. Cuotas marcadas: ${totalMarcadas}; recordatorios: ${totalReminders} (${tenants.length} club(es)).`,
        );
    };

    cron.schedule(schedule, run);
    console.log(`[cron-overdue] Programado "${schedule}" → marcar cuotas vencidas por club.`);

    if (process.env.OVERDUE_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-overdue] Run on start:', e));
    }
}
