import { createAppNotification } from './appNotification.service.js';
import { getOrCreateClubSettings } from './familyDiscount.service.js';
import { atletaCuotasEnApp } from '../utils/ageHelper.js';
import {
    DEFAULT_CLUB_TIMEZONE,
    todayYmdClub,
    zonedWallTimeToDate,
} from '../utils/timeHelper.js';

const DEFAULT_DAYS_BEFORE = 3;

export function clampReminderDaysBefore(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 1) return DEFAULT_DAYS_BEFORE;
    if (n > 14) return 14;
    return n;
}

export async function getCuotaReminderDaysBefore(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return clampReminderDaysBefore(doc.cuotaReminderDaysBefore ?? DEFAULT_DAYS_BEFORE);
}

function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d + days));
    const yy = utc.getUTCFullYear();
    const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(utc.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function formatMoney(n) {
    return `$${Number(n || 0).toLocaleString('es-AR')}`;
}

function resolveDestinatario(atleta) {
    if (!atleta?._id) return null;
    if (atleta.rol === 'atleta' && !atletaCuotasEnApp(atleta) && atleta.tutorPrincipal) {
        return atleta.tutorPrincipal;
    }
    return atleta._id;
}

function conceptoCuota(cuota) {
    if (cuota.tipo === 'social') return cuota.cuotaSocial?.nombre || 'cuota social';
    return cuota.plan?.nombre || 'plan';
}

function sufijoTitular(cuota, destinatario) {
    const titular = cuota.atleta;
    if (!titular) return '';
    if (String(destinatario) === String(titular._id)) return '';
    const nombre = `${titular.nombre || ''} ${titular.apellido || ''}`.trim();
    return nombre ? ` de ${nombre}` : '';
}

async function alreadyNotified(Notification, { tipo, referencia }) {
    const existing = await Notification.findOne({ tipo, referencia }).select('_id').lean();
    return Boolean(existing);
}

/**
 * Envía recordatorios in-app + push.
 * @param {object} [options]
 * @param {string} [options.timezone]
 */
export async function sendCuotaReminders(models, options = {}) {
    const { Payment, Notification } = models;
    const force = Boolean(options.force);
    const onlyVencidas = Boolean(options.onlyVencidas);
    const timezone = options.timezone || DEFAULT_CLUB_TIMEZONE;
    const daysBefore =
        options.daysBefore != null
            ? clampReminderDaysBefore(options.daysBefore)
            : await getCuotaReminderDaysBefore(models);

    const todayYmd = todayYmdClub(new Date(), timezone);
    const ventanaYmd = addDaysYmd(todayYmd, daysBefore);
    const hoyInicio = zonedWallTimeToDate(todayYmd, '00:00', timezone);
    const ventanaFin = zonedWallTimeToDate(ventanaYmd, '23:59', timezone);

    const periodFilter = {};
    const mes = options.mes != null ? Number(options.mes) : null;
    const anio = options.anio != null ? Number(options.anio) : null;
    if (mes >= 1 && mes <= 12 && anio > 2000) {
        periodFilter.mes = mes;
        periodFilter.anio = anio;
    }
    if (options.atletaId) {
        periodFilter.atleta = options.atletaId;
    }

    let proximas = [];
    if (!onlyVencidas) {
        proximas = await Payment.find({
            estado: 'pendiente',
            fechaVencimiento: { $gte: hoyInicio, $lte: ventanaFin },
            ...periodFilter,
        })
            .populate('plan', 'nombre')
            .populate('cuotaSocial', 'nombre')
            .populate('atleta', 'nombre apellido tutorPrincipal rol cuotasEnApp')
            .lean();
    }

    const vencidas = await Payment.find({ estado: 'vencido', ...periodFilter })
        .populate('plan', 'nombre')
        .populate('cuotaSocial', 'nombre')
        .populate('atleta', 'nombre apellido tutorPrincipal rol cuotasEnApp')
        .lean();

    let enviados = 0;

    for (const cuota of proximas) {
        if (!cuota.atleta) continue;
        if (!force && (await alreadyNotified(Notification, { tipo: 'cuota_proxima', referencia: cuota._id }))) {
            continue;
        }
        const destinatario = resolveDestinatario(cuota.atleta);
        if (!destinatario) continue;

        await createAppNotification(models, {
            usuario: destinatario,
            tipo: 'cuota_proxima',
            titulo: 'Cuota próxima a vencer',
            mensaje: `La cuota de ${conceptoCuota(cuota)}${sufijoTitular(cuota, destinatario)} vence pronto. Monto: ${formatMoney(cuota.montoFinal)}.`,
            referencia: cuota._id,
        });
        enviados += 1;
    }

    for (const cuota of vencidas) {
        if (!cuota.atleta) continue;
        if (!force && (await alreadyNotified(Notification, { tipo: 'cuota_vencida', referencia: cuota._id }))) {
            continue;
        }
        const destinatario = resolveDestinatario(cuota.atleta);
        if (!destinatario) continue;

        await createAppNotification(models, {
            usuario: destinatario,
            tipo: 'cuota_vencida',
            titulo: 'Cuota vencida',
            mensaje: `La cuota de ${conceptoCuota(cuota)}${sufijoTitular(cuota, destinatario)} está vencida. Monto: ${formatMoney(cuota.montoFinal)}.`,
            referencia: cuota._id,
        });
        enviados += 1;
    }

    return { enviados, daysBefore, force, onlyVencidas };
}
