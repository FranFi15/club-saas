import asyncHandler from 'express-async-handler';
import { hasTimeOverlap } from '../utils/timeHelper.js';

// @desc    Crear un alquiler de cancha externo
// @route   POST /api/rentals
const createRental = asyncHandler(async (req, res) => {
    const { nombreCliente, telefonoCliente, espacio, fecha, horaInicio, horaFin, montoTotal, señaPagada, notas } = req.body;
    const { Rental, Session, Space } = req.models;

    // 1. Verificamos el Espacio
    const spaceInfo = await Space.findById(espacio);
    if (!spaceInfo || spaceInfo.estado !== 'disponible') {
        res.status(400);
        throw new Error('El espacio no existe o no está disponible.');
    }

    // 2. EL PATOVICA: Revisamos que no choque con Entrenamientos ni otros Alquileres
    const inicioDia = new Date(fecha);
    inicioDia.setUTCHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setUTCHours(23, 59, 59, 999);

    const sesionesExistentes = await Session.find({
        espacio,
        fecha: { $gte: inicioDia, $lte: finDia },
        estado: { $ne: 'cancelada' }
    });

    const choque = sesionesExistentes.find(s => 
        hasTimeOverlap(horaInicio, horaFin, s.horaInicio, s.horaFin)
    );

    if (choque) {
        res.status(400);
        throw new Error(`Cancha ocupada de ${choque.horaInicio} a ${choque.horaFin}.`);
    }

    // 3. ¡Vía Libre! Creamos la Sesión "Fantasma" en el calendario
    // Usamos tipo 'alquiler' y no le pasamos categoría porque es externo
    const nuevaSesion = await Session.create({
        tipo: 'alquiler',
        fecha,
        horaInicio,
        horaFin,
        espacio,
        estado: 'programada'
    });

    // 4. Determinamos el estado del pago
    let estadoPago = 'pendiente';
    if (señaPagada > 0 && señaPagada < montoTotal) estadoPago = 'señado';
    if (señaPagada >= montoTotal) estadoPago = 'pagado';

    // 5. Creamos el Recibo del Alquiler y lo vinculamos a la sesión
    const rental = await Rental.create({
        nombreCliente,
        telefonoCliente,
        espacio,
        fecha,
        horaInicio,
        horaFin,
        montoTotal,
        señaPagada,
        estadoPago,
        sesionVinculada: nuevaSesion._id,
        notas
    });

    await rental.populate('espacio', 'nombre');
    res.status(201).json(rental);
});

// @desc    Ver todos los alquileres (Para la caja del club)
// @route   GET /api/rentals
const getRentals = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const rentals = await Rental.find({})
        .sort({ fecha: -1 })
        .populate('espacio', 'nombre');
    res.json(rentals);
});

// @desc    Ver alquileres de un espacio en una fecha
// @route   GET /api/rentals/espacio/:spaceId
const getRentalsBySpaceAndDate = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const { fecha } = req.query;

    const inicioDia = new Date(fecha);
    inicioDia.setUTCHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setUTCHours(23, 59, 59, 999);

    const rentals = await Rental.find({
        espacio: req.params.spaceId,
        fecha: { $gte: inicioDia, $lte: finDia },
        estadoReserva: { $ne: 'cancelada' }
    }).populate('espacio', 'nombre');

    res.json(rentals);
});

// @desc    Editar estado o pago de un alquiler
// @route   PUT /api/rentals/:id
const updateRental = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const { estadoPago, señaPagada, notas, estadoReserva } = req.body;

    const rental = await Rental.findById(req.params.id);
    if (!rental) {
        res.status(404);
        throw new Error('Alquiler no encontrado');
    }

    rental.estadoPago = estadoPago || rental.estadoPago;
    rental.señaPagada = señaPagada !== undefined ? señaPagada : rental.señaPagada;
    rental.notas = notas || rental.notas;
    rental.estadoReserva = estadoReserva || rental.estadoReserva;

    const updatedRental = await rental.save();
    res.json(updatedRental);
});

// @desc    Cancelar/Eliminar un alquiler y LIBERAR LA CANCHA
// @route   DELETE /api/rentals/:id
const deleteRental = asyncHandler(async (req, res) => {
    const { Rental, Session } = req.models;
    
    const rental = await Rental.findById(req.params.id);
    if (!rental) {
        res.status(404);
        throw new Error('Alquiler no encontrado');
    }

    // MAGIA: Buscamos la sesión que bloqueaba el calendario y la borramos
    if (rental.sesionVinculada) {
        await Session.findByIdAndDelete(rental.sesionVinculada);
    }

    // Ahora sí, borramos el recibo del alquiler
    await rental.deleteOne();
    
    res.json({ message: 'Alquiler cancelado y horario de cancha liberado.' });
});

export { createRental, getRentals, updateRental, deleteRental, getRentalsBySpaceAndDate };