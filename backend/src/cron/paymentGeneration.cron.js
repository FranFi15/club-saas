import axios from 'axios';
import cron from 'node-cron';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { generateMonthlyPaymentsForTenant } from '../services/generateMonthlyPayments.service.js';
import { generateSocialFeesForTenant } from '../services/generateSocialFees.service.js';
import {
    endBillingForEndedSchedules,
    resumeBillingForActiveSchedules,
} from '../services/endBillingAfterGrilla.service.js';
import { parseLocalHourEnv, shouldRunClubCron } from '../utils/clubCronTime.js';
import {
    calendarMonthYearInTz,
    DEFAULT_CLUB_TIMEZONE,
    normalizeClubTimezone,
} from '../utils/timeHelper.js';

/**
 * Genera cuotas del mes para clubs cuya zona local es día 1 a la hora configurada.
 * Activar con ENABLE_PAYMENT_CRON=true.
 * Default: local day 1, hour 6.
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

    const schedule = process.env.PAYMENT_CRON_SCHEDULE || '0 * * * *';
    const localHour = parseLocalHourEnv('PAYMENT_CRON_LOCAL_HOUR', 6);
    const localDay = parseInt(process.env.PAYMENT_CRON_LOCAL_DAY || '1', 10) || 1;

    const run = async () => {
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
        let totalSociales = 0;
        let ran = 0;
        for (const t of tenants) {
            if (!t.urlIdentifier || !t.connectionStringDB) continue;
            const timezone = normalizeClubTimezone(t.timezone || DEFAULT_CLUB_TIMEZONE);
            if (!shouldRunClubCron(timezone, { hour: localHour, day: localDay })) continue;

            const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
            try {
                const cs = String(t.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
                const tenantDB = await getTenantDB(t.urlIdentifier, cs);
                const models = getTenantModels(tenantDB);
                try {
                    await resumeBillingForActiveSchedules(models);
                    await endBillingForEndedSchedules(models);
                } catch (be) {
                    console.error(`[cron-payments] ${t.urlIdentifier} billing grilla:`, be.message);
                }
                const stats = await generateMonthlyPaymentsForTenant(models, mes, anio, timezone);
                totalCreadas += stats.cuotasCreadas;
                ran += 1;
                if (stats.cuotasCreadas > 0) {
                    console.log(
                        `[cron-payments] ${t.urlIdentifier}: ${stats.cuotasCreadas} cuota(s) nuevas (${mes}/${anio}), omitidas: ${stats.cuotasOmitidas}`,
                    );
                }

                const social = await generateSocialFeesForTenant(models, mes, anio, timezone);
                totalSociales += social.cuotasCreadas;
                if (social.cuotasCreadas > 0) {
                    console.log(
                        `[cron-payments] ${t.urlIdentifier}: ${social.cuotasCreadas} cuota(s) social(es) nuevas (${mes}/${anio}), omitidas: ${social.cuotasOmitidas}`,
                    );
                }
            } catch (e) {
                console.error(`[cron-payments] Tenant ${t.urlIdentifier}:`, e.message);
            }
        }
        if (ran > 0) {
            console.log(
                `[cron-payments] Fin de corrida local day=${localDay} hour=${localHour}. Cuotas: ${totalCreadas} entrenamiento + ${totalSociales} sociales (${ran}/${tenants.length} club(es))`,
            );
        }
    };

    cron.schedule(schedule, run);
    console.log(
        `[cron-payments] Programado "${schedule}" → día local ${localDay} a la hora ${localHour} (PAYMENT_CRON_LOCAL_*).`,
    );

    if (process.env.PAYMENT_CRON_RUN_ON_START === 'true') {
        run().catch((e) => console.error('[cron-payments] Run on start:', e));
    }
}
