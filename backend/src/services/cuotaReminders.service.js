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
    if (!atletaCuotasEnApp(atleta) && atleta.tutorPrincipal) {
        return atleta.tutorPrincipal;
    }
    return atleta._id;
}

async function alreadyNotified(Notification, { tipo, referencia }) {
    const existing = await Notification.findOne({ tipo, referencia }).select('_id').lean();
    return Boolean(existing);
}

/**
 * Envía recordatorios in-app + push:
 * - cuota_proxima: pendiente que vence entre hoy y hoy+daysBefore (1 vez por cuota)
 * - cuota_vencida: estado vencido (1 vez por cuota)
 */
export async function sendCuotaReminders(models, options = {}) {
    const { Payment, Notification } = models;
    const daysBefore =
        options.daysBefore != null
            ? clampReminderDaysBefore(options.daysBefore)
            : await getCuotaReminderDaysBefore(models);

    const hoyInicio = startOfLocalDay();
    const ventanaFin = endOfLocalDay(addDays(hoyInicio, daysBefore));

    const proximas = await Payment.find({
        estado: 'pendiente',
        fechaVencimiento: { $gte: hoyInicio, $lte: ventanaFin },
    })
        .populate('plan', 'nombre')
        .populate('atleta', 'nombre apellido tutorPrincipal rol cuotasEnApp')
        .lean();

    const vencidas = await Payment.find({ estado: 'vencido' })
        .populate('plan', 'nombre')
        .populate('atleta', 'nombre apellido tutorPrincipal rol cuotasEnApp')
        .lean();

    let enviados = 0;

    for (const cuota of proximas) {
        if (!cuota.atleta) continue;
        if (await alreadyNotified(Notification, { tipo: 'cuota_proxima', referencia: cuota._id })) {
            continue;
        }
        const destinatario = resolveDestinatario(cuota.atleta);
        if (!destinatario) continue;

        const nombreAtleta = `${cuota.atleta.nombre || ''} ${cuota.atleta.apellido || ''}`.trim() || 'atleta';
        await createAppNotification(models, {
            usuario: destinatario,
            tipo: 'cuota_proxima',
            titulo: 'Cuota próxima a vencer',
            mensaje: `La cuota de ${cuota.plan?.nombre || 'plan'} de ${nombreAtleta} vence pronto. Monto: ${formatMoney(cuota.montoFinal)}.`,
            referencia: cuota._id,
        });
        enviados += 1;
    }

    for (const cuota of vencidas) {
        if (!cuota.atleta) continue;
        if (await alreadyNotified(Notification, { tipo: 'cuota_vencida', referencia: cuota._id })) {
            continue;
        }
        const destinatario = resolveDestinatario(cuota.atleta);
        if (!destinatario) continue;

        const nombreAtleta = `${cuota.atleta.nombre || ''} ${cuota.atleta.apellido || ''}`.trim() || 'atleta';
        await createAppNotification(models, {
            usuario: destinatario,
            tipo: 'cuota_vencida',
            titulo: 'Cuota vencida',
            mensaje: `La cuota de ${cuota.plan?.nombre || 'plan'} de ${nombreAtleta} está vencida. Monto: ${formatMoney(cuota.montoFinal)}.`,
            referencia: cuota._id,
        });
        enviados += 1;
    }

    return { enviados, daysBefore };
}
