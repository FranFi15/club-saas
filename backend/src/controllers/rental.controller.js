import asyncHandler from 'express-async-handler';
import { hasTimeOverlap } from '../utils/timeHelper.js';
import { syncRentalEstadoPago, rentalSaldoPendiente } from '../utils/rentalPayments.js';
import { parsePageLimit, paginationMeta } from '../utils/pagination.js';
import { activeRentalFilter, expirePendingOnlineRentals } from '../services/onlineRental.service.js';
// @desc    Crear un alquiler de cancha externo
// @route   POST /api/rentals
const createRental = asyncHandler(async (req, res) => {
    const { nombreCliente, telefonoCliente, espacio, fecha, horaInicio, horaFin, montoTotal, señaPagada, notas } = req.body;
    const { Rental, Session, Space, Schedule } = req.models;

    if (!horaInicio || !horaFin || !(String(horaInicio) < String(horaFin))) {
        res.status(400);
        throw new Error('El horario de fin debe ser posterior al de inicio.');
    }

    await expirePendingOnlineRentals(Rental);

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

    const alquileresExistentes = await Rental.find({
        espacio,
        fecha: { $gte: inicioDia, $lte: finDia },
        ...activeRentalFilter(),
    });

    const choqueAlquiler = alquileresExistentes.find((r) =>
        hasTimeOverlap(horaInicio, horaFin, r.horaInicio, r.horaFin),
    );

    if (choqueAlquiler) {
        res.status(400);
        throw new Error(`Ya hay un alquiler de ${choqueAlquiler.horaInicio} a ${choqueAlquiler.horaFin}.`);
    }

    // 2b. Grilla semanal (mismo criterio visual del calendario), salvo slot liberado por cancelación
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaSemana = DIAS[inicioDia.getUTCDay()];
    const plantillas = await Schedule.find({
        espacio,
        diaSemana,
        vigenteHasta: { $gte: inicioDia },
    }).lean();

    if (plantillas.length) {
        const canceladas = await Session.find({
            espacio,
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
            res.status(400);
            throw new Error(
                `Ese horario está reservado por la grilla de entrenamientos (${choqueGrilla.horaInicio}–${choqueGrilla.horaFin}).`,
            );
        }
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

    // 4. Historial y estado del pago
    const señaNum = Number(señaPagada) || 0;
    const totalNum = Number(montoTotal) || 0;
    const historialPagos = [];
    if (señaNum > 0) {
        historialPagos.push({
            monto: señaNum,
            concepto: señaNum >= totalNum ? 'pago_total' : 'seña_inicial',
            fecha: new Date(),
            registradoPor: req.user?._id,
        });
    }

    const rentalDraft = {
        nombreCliente,
        telefonoCliente,
        espacio,
        fecha,
        horaInicio,
        horaFin,
        montoTotal: totalNum,
        señaPagada: señaNum,
        historialPagos,
        sesionVinculada: nuevaSesion._id,
        notas,
    };
    syncRentalEstadoPago(rentalDraft);

    let rental;
    try {
        rental = await Rental.create(rentalDraft);
    } catch (err) {
        await Session.findByIdAndDelete(nuevaSesion._id);
        throw err;
    }
    await rental.populate('espacio', 'nombre');
    res.status(201).json(rental);
});

// @desc    Ver alquileres (paginado)
// @route   GET /api/rentals?page=1&limit=30&espacio=
const getRentals = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });

    const filter = { estadoReserva: { $ne: 'cancelada' } };
    if (req.query.espacio) filter.espacio = req.query.espacio;

    const total = await Rental.countDocuments(filter);
    const rentals = await Rental.find(filter)
        .sort({ fecha: -1, horaInicio: -1 })
        .skip(skip)
        .limit(limit)
        .populate('espacio', 'nombre');

    res.json({
        rentals,
        ...paginationMeta(page, limit, total),
    });
});

// @desc    Ver alquileres de un espacio en una fecha
// @route   GET /api/rentals/espacio/:spaceId
const getRentalsBySpaceAndDate = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const { fecha } = req.query;

    await expirePendingOnlineRentals(Rental);

    const inicioDia = new Date(fecha);
    inicioDia.setUTCHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setUTCHours(23, 59, 59, 999);

    const rentals = await Rental.find({
        espacio: req.params.spaceId,
        fecha: { $gte: inicioDia, $lte: finDia },
        ...activeRentalFilter(),
    }).populate('espacio', 'nombre');

    res.json(rentals);
});

// @desc    Editar estado o pago de un alquiler
// @route   PUT /api/rentals/:id
const updateRental = asyncHandler(async (req, res) => {
    const { Rental, Session } = req.models;
    const { estadoPago, señaPagada, notas, estadoReserva } = req.body;

    const rental = await Rental.findById(req.params.id);
    if (!rental) {
        res.status(404);
        throw new Error('Alquiler no encontrado');
    }

    const nextEstado = estadoReserva || rental.estadoReserva;
    if (nextEstado === 'cancelada' && rental.estadoReserva !== 'cancelada') {
        if (rental.sesionVinculada) {
            await Session.findByIdAndDelete(rental.sesionVinculada);
            rental.sesionVinculada = undefined;
        }
    }

    rental.estadoPago = estadoPago || rental.estadoPago;
    rental.señaPagada = señaPagada !== undefined ? señaPagada : rental.señaPagada;
    rental.notas = notas || rental.notas;
    rental.estadoReserva = nextEstado;
    syncRentalEstadoPago(rental);

    const updatedRental = await rental.save();
    await updatedRental.populate('espacio', 'nombre');
    res.json(updatedRental);
});

// @desc    Registrar pago del saldo restante
// @route   POST /api/rentals/:id/pagar-total
const payRentalBalance = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const rental = await Rental.findById(req.params.id);
    if (!rental) {
        res.status(404);
        throw new Error('Alquiler no encontrado');
    }
    if (rental.estadoReserva === 'cancelada') {
        res.status(400);
        throw new Error('La reserva está cancelada.');
    }

    const saldo = rentalSaldoPendiente(rental);
    if (saldo <= 0) {
        res.status(400);
        throw new Error('Esta reserva ya está pagada en su totalidad.');
    }

    rental.historialPagos.push({
        monto: saldo,
        concepto: 'pago_saldo',
        fecha: new Date(),
        registradoPor: req.user?._id,
        nota: req.body?.nota || '',
    });
    rental.señaPagada = Number(rental.montoTotal) || 0;
    syncRentalEstadoPago(rental);
    await rental.save();
    await rental.populate('espacio', 'nombre');
    res.json(rental);
});

// @desc    Resumen de caja y historial de cobros (historial paginado)
// @route   GET /api/rentals/balance?page=1&limit=30
const getRentalBalance = asyncHandler(async (req, res) => {
    const { Rental } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });
    const baseMatch = { estadoReserva: { $ne: 'cancelada' } };
    /** Incluye canceladas para no perder cobros ya registrados en el historial. */
    const historialMatch = {};

    const [summaryRow] = await Rental.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: null,
                totalFacturado: { $sum: { $ifNull: ['$montoTotal', 0] } },
                totalCobrado: { $sum: { $ifNull: ['$señaPagada', 0] } },
                reservasActivas: { $sum: 1 },
                reservasPagadas: {
                    $sum: {
                        $cond: [
                            { $lte: [{ $subtract: ['$montoTotal', { $ifNull: ['$señaPagada', 0] }] }, 0] },
                            1,
                            0,
                        ],
                    },
                },
                reservasConSaldo: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $subtract: ['$montoTotal', { $ifNull: ['$señaPagada', 0] }] }, 0] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    const summary = summaryRow || {
        totalFacturado: 0,
        totalCobrado: 0,
        reservasActivas: 0,
        reservasPagadas: 0,
        reservasConSaldo: 0,
    };

    const historialCountAgg = await Rental.aggregate([
        { $match: historialMatch },
        {
            $project: {
                entries: {
                    $cond: [
                        { $gt: [{ $size: { $ifNull: ['$historialPagos', []] } }, 0] },
                        '$historialPagos',
                        {
                            $cond: [
                                { $gt: [{ $ifNull: ['$señaPagada', 0] }, 0] },
                                [{ monto: '$señaPagada', concepto: 'seña_inicial', fecha: '$createdAt', nota: '' }],
                                [],
                            ],
                        },
                    ],
                },
            },
        },
        { $unwind: '$entries' },
        { $count: 'total' },
    ]);
    const historialTotal = historialCountAgg[0]?.total || 0;

    const historialRows = await Rental.aggregate([
        { $match: historialMatch },
        {
            $lookup: {
                from: 'spaces',
                localField: 'espacio',
                foreignField: '_id',
                as: 'espacioDoc',
            },
        },
        { $unwind: { path: '$espacioDoc', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                nombreCliente: 1,
                fecha: 1,
                horaInicio: 1,
                horaFin: 1,
                espacioNombre: '$espacioDoc.nombre',
                entries: {
                    $cond: [
                        { $gt: [{ $size: { $ifNull: ['$historialPagos', []] } }, 0] },
                        '$historialPagos',
                        {
                            $cond: [
                                { $gt: [{ $ifNull: ['$señaPagada', 0] }, 0] },
                                [{ monto: '$señaPagada', concepto: 'seña_inicial', fecha: '$createdAt', nota: '' }],
                                [],
                            ],
                        },
                    ],
                },
            },
        },
        { $unwind: '$entries' },
        { $sort: { 'entries.fecha': -1 } },
        { $skip: skip },
        { $limit: limit },
        {
            $project: {
                rentalId: '$_id',
                nombreCliente: 1,
                espacio: '$espacioNombre',
                fechaReserva: '$fecha',
                horaInicio: 1,
                horaFin: 1,
                monto: '$entries.monto',
                concepto: '$entries.concepto',
                fecha: '$entries.fecha',
                nota: '$entries.nota',
            },
        },
    ]);

    res.json({
        totalFacturado: summary.totalFacturado,
        totalCobrado: summary.totalCobrado,
        totalPendiente: summary.totalFacturado - summary.totalCobrado,
        reservasActivas: summary.reservasActivas,
        reservasPagadas: summary.reservasPagadas,
        reservasConSaldo: summary.reservasConSaldo,
        historial: historialRows,
        ...paginationMeta(page, limit, historialTotal),
    });
});
// @desc    Cancelar un alquiler (soft) y liberar la cancha
// @route   DELETE /api/rentals/:id
const deleteRental = asyncHandler(async (req, res) => {
    const { Rental, Session } = req.models;

    const rental = await Rental.findById(req.params.id);
    if (!rental) {
        res.status(404);
        throw new Error('Alquiler no encontrado');
    }

    if (rental.estadoReserva === 'cancelada') {
        res.status(400);
        throw new Error('La reserva ya está cancelada.');
    }

    // Liberar el bloqueo del calendario (sesión fantasma)
    if (rental.sesionVinculada) {
        await Session.findByIdAndDelete(rental.sesionVinculada);
        rental.sesionVinculada = undefined;
    }

    rental.estadoReserva = 'cancelada';
    await rental.save();
    await rental.populate('espacio', 'nombre');

    res.json({
        message: 'Alquiler cancelado y horario de cancha liberado.',
        rental,
    });
});

export { createRental, getRentals, updateRental, deleteRental, getRentalsBySpaceAndDate, payRentalBalance, getRentalBalance };