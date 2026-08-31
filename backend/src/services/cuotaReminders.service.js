import { createAppNotification } from './appNotification.service.js';
import { getOrCreateClubSettings } from './familyDiscount.service.js';
import { atletaCuotasEnApp } from '../utils/ageHelper.js';

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

function startOfLocalDay(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d, days) {
    const out = new Date(d);
    out.setDate(out.getDate() + days);
    return out;
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

/** Nombre del concepto: plan de entrenamiento o cuota social del club. */
function conceptoCuota(cuota) {
    if (cuota.tipo === 'social') return cuota.cuotaSocial?.nombre || 'cuota social';
    return cuota.plan?.nombre || 'plan';
}

/**
 * "…de Juan Pérez" cuando avisamos al tutor; vacío cuando el titular de la cuota
 * es quien recibe la notificación.
 */
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
 * @param {boolean} [options.force] reenviar aunque ya se notificó
 * @param {boolean} [options.onlyVencidas] solo cuotas vencidas (avisar morosos)
 * @param {number} [options.mes]
 * @param {number} [options.anio]
 * @param {string} [options.atletaId]
 */
export async function sendCuotaReminders(models, options = {}) {
    const { Payment, Notification } = models;
    const force = Boolean(options.force);
    const onlyVencidas = Boolean(options.onlyVencidas);
    const daysBefore =
        options.daysBefore != null
            ? clampReminderDaysBefore(options.daysBefore)
            : await getCuotaReminderDaysBefore(models);

    const hoyInicio = startOfLocalDay();
    const ventanaFin = endOfLocalDay(addDays(hoyInicio, daysBefore));

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
