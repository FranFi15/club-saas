import { hasTimeOverlap } from '../utils/timeHelper.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const ONLINE_HOLD_MINUTES = 15;
export const MEMBER_RENTAL_ROLES = ['atleta', 'tutor', 'socio'];
export const SLOT_DURATIONS = [30, 60, 90];

export function isValidHhMm(value) {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

export function hhMmToMinutes(value) {
    const [h, m] = String(value || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
}

export function minutesToHhMm(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sanitizeAlquilerOnline(raw = {}) {
    const habilitado = Boolean(raw.habilitado);
    const precioPorHora = Math.max(0, Number(raw.precioPorHora) || 0);
    const horaInicio = isValidHhMm(raw.horaInicio) ? raw.horaInicio : '08:00';
    const horaFin = isValidHhMm(raw.horaFin) ? raw.horaFin : '22:00';
    const duracionSlotMinutos = SLOT_DURATIONS.includes(Number(raw.duracionSlotMinutos))
        ? Number(raw.duracionSlotMinutos)
        : 60;

    if (habilitado) {
        if (precioPorHora <= 0) {
            const err = new Error('Indicá un precio por hora mayor a 0 para habilitar el alquiler online.');
            err.statusCode = 400;
            throw err;
        }
        if (!(horaInicio < horaFin)) {
            const err = new Error('La hora de fin del alquiler online debe ser posterior a la de inicio.');
            err.statusCode = 400;
            throw err;
        }
        const span = hhMmToMinutes(horaFin) - hhMmToMinutes(horaInicio);
        if (span < duracionSlotMinutos) {
            const err = new Error('El rango horario debe cubrir al menos un slot completo.');
            err.statusCode = 400;
            throw err;
        }
    }

    return {
        habilitado,
        precioPorHora,
        horaInicio,
        horaFin,
        duracionSlotMinutos,
    };
}

export function calcSlotPrice(precioPorHora, duracionSlotMinutos) {
    const hours = Number(duracionSlotMinutos) / 60;
    return Math.round(Number(precioPorHora) * hours);
}

export function generateOnlineSlots({ horaInicio, horaFin, duracionSlotMinutos }) {
    const start = hhMmToMinutes(horaInicio);
    const end = hhMmToMinutes(horaFin);
    const step = Number(duracionSlotMinutos) || 60;
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(start < end)) return [];

    const slots = [];
    for (let t = start; t + step <= end; t += step) {
        slots.push({
            horaInicio: minutesToHhMm(t),
            horaFin: minutesToHhMm(t + step),
        });
    }
    return slots;
}

export function dayBoundsFromYmd(fechaYmd) {
    const inicioDia = new Date(`${fechaYmd}T00:00:00.000Z`);
    const finDia = new Date(`${fechaYmd}T23:59:59.999Z`);
    return { inicioDia, finDia };
}

export function activeRentalFilter(now = new Date()) {
    return {
        $or: [
            { estadoReserva: { $in: ['confirmada', 'completada'] } },
            {
                estadoReserva: 'pendiente_pago',
                $or: [{ pagoExpiraEn: { $gt: now } }, { pagoExpiraEn: null }],
            },
        ],
    };
}

/** Cancela holds online vencidos (sin sesión vinculada). */
export async function expirePendingOnlineRentals(Rental, now = new Date()) {
    await Rental.updateMany(
        {
            origen: 'online',
            estadoReserva: 'pendiente_pago',
            pagoExpiraEn: { $lte: now },
        },
        {
            $set: {
                estadoReserva: 'cancelada',
                notas: 'Cancelado automáticamente: venció el tiempo de pago.',
            },
        },
    );
}

export async function assertSlotFree({
    Session,
    Rental,
    Schedule,
    espacioId,
    fechaYmd,
    horaInicio,
    horaFin,
    excludeRentalId,
}) {
    const { inicioDia, finDia } = dayBoundsFromYmd(fechaYmd);
    const now = new Date();

    const sesionesExistentes = await Session.find({
        espacio: espacioId,
        fecha: { $gte: inicioDia, $lte: finDia },
        estado: { $ne: 'cancelada' },
    }).lean();

    const choqueSesion = sesionesExistentes.find((s) =>
        hasTimeOverlap(horaInicio, horaFin, s.horaInicio, s.horaFin),
    );
    if (choqueSesion) {
        const err = new Error(`Cancha ocupada de ${choqueSesion.horaInicio} a ${choqueSesion.horaFin}.`);
        err.statusCode = 400;
        throw err;
    }

    const rentalQuery = {
        espacio: espacioId,
        fecha: { $gte: inicioDia, $lte: finDia },
        ...activeRentalFilter(now),
    };
    if (excludeRentalId) rentalQuery._id = { $ne: excludeRentalId };

    const alquileres = await Rental.find(rentalQuery).lean();
    const choqueAlquiler = alquileres.find((r) =>
        hasTimeOverlap(horaInicio, horaFin, r.horaInicio, r.horaFin),
    );
    if (choqueAlquiler) {
        const err = new Error(`Ya hay un alquiler de ${choqueAlquiler.horaInicio} a ${choqueAlquiler.horaFin}.`);
        err.statusCode = 400;
        throw err;
    }

    const diaSemana = DIAS[inicioDia.getUTCDay()];
    const plantillas = await Schedule.find({
        espacio: espacioId,
        diaSemana,
        vigenteHasta: { $gte: inicioDia },
    }).lean();

    if (plantillas.length) {
        const canceladas = await Session.find({
            espacio: espacioId,
            fecha: { $gte: inicioDia, $lte: finDia },
            estado: 'cancelada',
        }).lean();

        const choqueGrilla = plantillas.find((sch) => {
            if (!hasTimeOverlap(horaInicio, horaFin, sch.horaInicio, sch.horaFin)) return false;
            const liberado = canceladas.some((s) =>
                hasTimeOverlap(horaInicio, horaFin, s.horaInicio, s.horaFin),
            );
            return !liberado;
        });

        if (choqueGrilla) {
            const err = new Error(
                `Ese horario está reservado por la grilla de entrenamientos (${choqueGrilla.horaInicio}–${choqueGrilla.horaFin}).`,
            );
            err.statusCode = 400;
            throw err;
        }
    }
}

export async function ensureSessionForConfirmedRental(models, rental) {
    const { Session } = models;
    if (rental.sesionVinculada) return rental;
    if (rental.estadoReserva !== 'confirmada' && rental.estadoReserva !== 'completada') return rental;

    const sesion = await Session.create({
        tipo: 'alquiler',
        fecha: rental.fecha,
        horaInicio: rental.horaInicio,
        horaFin: rental.horaFin,
        espacio: rental.espacio,
        estado: 'programada',
    });
    rental.sesionVinculada = sesion._id;
    await rental.save();
    return rental;
}

/**
 * Tras pago MP aprobado: confirma hold online y crea la sesión en el calendario.
 */
export async function finalizeOnlineRentalAfterPayment(models, rental) {
    if (rental.origen !== 'online') return rental;
    if (rental.estadoReserva === 'cancelada') return rental;

    if (rental.estadoReserva === 'pendiente_pago') {
        rental.estadoReserva = 'confirmada';
        rental.pagoExpiraEn = undefined;
    }
    await rental.save();
    return ensureSessionForConfirmedRental(models, rental);
}

export function assertMemberOwnsOnlineRental(rental, userId) {
    if (!rental || rental.origen !== 'online') {
        const err = new Error('Reserva online no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (String(rental.reservadoPor) !== String(userId)) {
        const err = new Error('No tenés permiso sobre esta reserva.');
        err.statusCode = 403;
        throw err;
    }
    if (rental.estadoReserva === 'cancelada') {
        const err = new Error('Esta reserva está cancelada.');
        err.statusCode = 400;
        throw err;
    }
    if (rental.estadoReserva === 'pendiente_pago' && rental.pagoExpiraEn && rental.pagoExpiraEn <= new Date()) {
        const err = new Error('Se venció el tiempo para pagar. Reservá de nuevo.');
        err.statusCode = 400;
        throw err;
    }
}
