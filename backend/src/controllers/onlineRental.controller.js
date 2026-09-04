import asyncHandler from 'express-async-handler';
import {
    ONLINE_HOLD_MINUTES,
    calcSlotPrice,
    dayBoundsFromYmd,
    expirePendingOnlineRentals,
    generateOnlineSlots,
    assertSlotFree,
    sanitizeAlquilerOnline,
    isOnlineDayAllowed,
    normalizeDiasDisponibles,
    weekdayNameFromYmd,
    isPastCalendarDay,
    isSlotInPast,
} from '../services/onlineRental.service.js';

function memberDisplayName(user) {
    const parts = [user?.nombre, user?.apellido].filter(Boolean);
    return parts.join(' ').trim() || user?.email || 'Socio';
}

function cfgFromSpace(space) {
    const raw = space.alquilerOnline?.toObject?.() ?? space.alquilerOnline ?? {};
    return sanitizeAlquilerOnline({
        ...raw,
        habilitado: true,
    });
}

function spaceOnlinePublic(space) {
    const cfg = space.alquilerOnline || {};
    const duracion = Number(cfg.duracionSlotMinutos) || 60;
    const precioPorHora = Number(cfg.precioPorHora) || 0;
    return {
        _id: space._id,
        nombre: space.nombre,
        tipo: space.tipo,
        precioPorHora,
        horaInicio: cfg.horaInicio || '08:00',
        horaFin: cfg.horaFin || '22:00',
        duracionSlotMinutos: duracion,
        precioPorSlot: calcSlotPrice(precioPorHora, duracion),
        diasDisponibles: normalizeDiasDisponibles(cfg.diasDisponibles),
    };
}

// @desc    Espacios con alquiler online habilitado
// @route   GET /api/rentals/online/spaces
export const listOnlineSpaces = asyncHandler(async (req, res) => {
    const { Space, Rental } = req.models;
    await expirePendingOnlineRentals(Rental);

    const spaces = await Space.find({
        estado: 'disponible',
        'alquilerOnline.habilitado': true,
        'alquilerOnline.precioPorHora': { $gt: 0 },
    })
        .sort({ nombre: 1 })
        .lean();

    res.json(spaces.map(spaceOnlinePublic));
});

// @desc    Slots libres de un espacio en una fecha
// @route   GET /api/rentals/online/availability?espacio=&fecha=YYYY-MM-DD
export const getOnlineAvailability = asyncHandler(async (req, res) => {
    const { Space, Session, Rental, Schedule } = req.models;
    const { espacio, fecha } = req.query;

    if (!espacio || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
        res.status(400);
        throw new Error('Indicá espacio y fecha (YYYY-MM-DD).');
    }

    await expirePendingOnlineRentals(Rental);

    const space = await Space.findById(espacio);
    if (!space || space.estado !== 'disponible' || !space.alquilerOnline?.habilitado) {
        res.status(400);
        throw new Error('Este espacio no admite alquiler online.');
    }

    const cfg = cfgFromSpace(space);
    const diaSemana = weekdayNameFromYmd(fecha);

    if (isPastCalendarDay(fecha)) {
        return res.json({
            espacio: spaceOnlinePublic(space),
            fecha,
            diaSemana,
            diaDisponible: false,
            slots: [],
            mensaje: 'No se pueden alquilar días que ya pasaron.',
        });
    }

    const diaDisponible = isOnlineDayAllowed(cfg, fecha);

    if (!diaDisponible) {
        return res.json({
            espacio: spaceOnlinePublic(space),
            fecha,
            diaSemana,
            diaDisponible: false,
            slots: [],
            mensaje: `${diaSemana || 'Este día'} no está habilitado para alquiler online en este espacio.`,
        });
    }

    const candidates = generateOnlineSlots(cfg);
    const precioPorSlot = calcSlotPrice(cfg.precioPorHora, cfg.duracionSlotMinutos);

    const slots = [];
    for (const slot of candidates) {
        if (isSlotInPast(fecha, slot.horaInicio)) {
            slots.push({ ...slot, disponible: false, precio: precioPorSlot, pasado: true });
            continue;
        }
        try {
            await assertSlotFree({
                Session,
                Rental,
                Schedule,
                espacioId: space._id,
                fechaYmd: fecha,
                horaInicio: slot.horaInicio,
                horaFin: slot.horaFin,
            });
            slots.push({ ...slot, disponible: true, precio: precioPorSlot });
        } catch {
            slots.push({ ...slot, disponible: false, precio: precioPorSlot });
        }
    }

    res.json({
        espacio: spaceOnlinePublic(space),
        fecha,
        diaSemana,
        diaDisponible: true,
        slots,
    });
});

// @desc    Reservar slot online (hold) — el pago se crea aparte vía MP
// @route   POST /api/rentals/online/book
export const bookOnlineRental = asyncHandler(async (req, res) => {
    const { Space, Session, Rental, Schedule } = req.models;
    const { espacio, fecha, horaInicio, horaFin } = req.body;
    const user = req.user;

    if (!espacio || !fecha || !horaInicio || !horaFin) {
        res.status(400);
        throw new Error('Indicá espacio, fecha y horario.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
        res.status(400);
        throw new Error('Fecha inválida (YYYY-MM-DD).');
    }
    if (!(String(horaInicio) < String(horaFin))) {
        res.status(400);
        throw new Error('El horario de fin debe ser posterior al de inicio.');
    }

    await expirePendingOnlineRentals(Rental);

    const space = await Space.findById(espacio);
    if (!space || space.estado !== 'disponible' || !space.alquilerOnline?.habilitado) {
        res.status(400);
        throw new Error('Este espacio no admite alquiler online.');
    }

    const cfg = cfgFromSpace(space);

    if (isPastCalendarDay(fecha)) {
        res.status(400);
        throw new Error('No se pueden alquilar días que ya pasaron.');
    }

    if (isSlotInPast(fecha, horaInicio)) {
        res.status(400);
        throw new Error('Ese horario ya pasó. Elegí un turno futuro.');
    }

    if (!isOnlineDayAllowed(cfg, fecha)) {
        const dia = weekdayNameFromYmd(fecha) || 'ese día';
        res.status(400);
        throw new Error(`El alquiler online no está disponible los ${dia}.`);
    }

    const expectedSlots = generateOnlineSlots(cfg);
    const matched = expectedSlots.find(
        (s) => s.horaInicio === horaInicio && s.horaFin === horaFin,
    );
    if (!matched) {
        res.status(400);
        throw new Error('Ese horario no coincide con los slots configurados del espacio.');
    }

    await assertSlotFree({
        Session,
        Rental,
        Schedule,
        espacioId: space._id,
        fechaYmd: fecha,
        horaInicio,
        horaFin,
    });

    const montoTotal = calcSlotPrice(cfg.precioPorHora, cfg.duracionSlotMinutos);
    if (montoTotal <= 0) {
        res.status(400);
        throw new Error('El espacio no tiene un precio válido.');
    }

    const { inicioDia } = dayBoundsFromYmd(fecha);
    const pagoExpiraEn = new Date(Date.now() + ONLINE_HOLD_MINUTES * 60 * 1000);

    const rental = await Rental.create({
        nombreCliente: memberDisplayName(user),
        telefonoCliente: user.telefono || '—',
        emailCliente: user.email || '',
        espacio: space._id,
        fecha: inicioDia,
        horaInicio,
        horaFin,
        origen: 'online',
        reservadoPor: user._id,
        montoTotal,
        señaPagada: 0,
        estadoPago: 'pendiente',
        estadoReserva: 'pendiente_pago',
        pagoExpiraEn,
        notas: 'Reserva online — pendiente de pago Mercado Pago',
    });

    const populated = await Rental.findById(rental._id).populate('espacio', 'nombre tipo');
    res.status(201).json({
        rental: populated,
        holdMinutes: ONLINE_HOLD_MINUTES,
        pagoExpiraEn,
        montoTotal,
    });
});

// @desc    Mis reservas online
// @route   GET /api/rentals/online/mine
export const listMyOnlineRentals = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    await expirePendingOnlineRentals(Rental);

    const list = await Rental.find({
        origen: 'online',
        reservadoPor: req.user._id,
    })
        .populate('espacio', 'nombre tipo')
        .sort({ fecha: -1, horaInicio: -1 })
        .limit(50)
        .lean();

    res.json(list);
});

// @desc    Cancelar hold propio pendiente de pago
// @route   DELETE /api/rentals/online/:id
export const cancelMyOnlineRental = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const rental = await Rental.findById(req.params.id);
    if (!rental || String(rental.reservadoPor) !== String(req.user._id)) {
        res.status(404);
        throw new Error('Reserva no encontrada.');
    }
    if (rental.estadoReserva !== 'pendiente_pago') {
        res.status(400);
        throw new Error('Solo podés cancelar reservas pendientes de pago.');
    }
    rental.estadoReserva = 'cancelada';
    rental.notas = 'Cancelada por el usuario antes de pagar.';
    await rental.save();
    res.json({ ok: true, rental });
});
