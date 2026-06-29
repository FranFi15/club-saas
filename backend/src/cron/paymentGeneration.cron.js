import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { generateMonthlyPaymentsForTenant } from '../services/generateMonthlyPayments.service.js';

/** Mes y año calendario actuales del servidor (cuando corre el job, típicamente día 1). */
export function currentCalendarMonthYear() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
}

/**
 * Genera cuotas del mes para todos los clubs activos.
 * Activar con ENABLE_PAYMENT_CRON=true (misma config de tenants que sesiones).
 * Por defecto: 06:00 del día 1 de cada mes.
 */
export function startPaymentGenerationCron() {
    if (process.env.ENABLE_PAYMENT_CRON !== 'true') {
        console.log('[cron-payments] Desactivado. Usá ENABLE_PAYMENT_CRON=true para facturar automáticamente.');
        return;
    }
    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !internalKey) {
        console.warn('[cron-payments] Faltan SUPER_ADMIN_URL o INTERNAL_ADMIN_API_KEY; no se programa el job.');
        return;
    }

    const schedule = process.env.PAYMENT_CRON_SCHEDULE || '0 6 1 * *';

    const run = async () => {
        const { mes, anio } = currentCalendarMonthYear();
        let tenants = [];
        try {
            const { data } = await axios.get(`${superUrl.replace(/\/$/, '')}/api/clubs/internal/cron-tenants`, {
                headers: { 'x-internal-api-key': internalKey },
                timeout: 60000,
            });
            tenants = data.tenants || [];
        } catch (e) {
            console.error('[cron-payments] No se pudo obtener el índice de tenants:', e.response?.data || e.message);
            return;
        }

        let totalCreadas = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                const stats = await generateMonthlyPaymentsForTenant(models, mes, anio);
                totalCreadas += stats.cuotasCreadas;
                if (stats.cuotasCreadas > 0) {
                    console.log(
                        `[cron-payments] ${t.urlIdentifier}: ${stats.cuotasCreadas} cuota(s) nuevas (${mes}/${anio}), omitidas: ${stats.cuotasOmitidas}`,
                    );
                }
            } catch (e) {
                console.error(`[cron-payments] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        console.log(
            `[cron-payments] Fin de corrida ${mes}/${anio}. Cuotas nuevas en total: ${totalCreadas} (${tenants.length} club(es))`,
        );
    };

    cron.schedule(schedule, run);
    const { mes, anio } = currentCalendarMonthYear();
    console.log(`[cron-payments] Programado "${schedule}" → facturación de ${mes}/${anio} por club.`);

    if (process.env.PAYMENT_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-payments] Run on start:', e));
    }
}
