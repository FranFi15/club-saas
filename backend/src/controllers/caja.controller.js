import asyncHandler from 'express-async-handler';
import { getBecaPlanIds, excludeBecaPaymentsFilter } from '../services/becaPlan.service.js';

function parsePeriod(mes, anio) {
    const m = Number(mes);
    const a = Number(anio);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
        const err = new Error('Mes inválido (1-12).');
        err.statusCode = 400;
        throw err;
    }
    if (!Number.isInteger(a) || a < 2000 || a > 2100) {
        const err = new Error('Año inválido.');
        err.statusCode = 400;
        throw err;
    }
    return { mes: m, anio: a };
}

function monthDateRange(mes, anio) {
    const from = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
    const to = new Date(anio, mes, 1, 0, 0, 0, 0);
    return { from, to };
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Resumen de caja del período (mes/año) con las mismas reglas de cada módulo.
 * @route GET /api/financial/caja?mes=&anio=
 */
const getCaja = asyncHandler(async (req, res) => {
    const { Payment, SponsorPayment, Rental, ClubEvent, EventTicketOrder, PayrollEntry, Bill } =
        req.models;

    const { mes, anio } = parsePeriod(req.query.mes, req.query.anio);
    const { from, to } = monthDateRange(mes, anio);

    const becaPlanIds = await getBecaPlanIds(req.models);
    const becaExclude = excludeBecaPaymentsFilter(becaPlanIds);
    const paymentMatch = becaExclude ? { $and: [{ mes, anio }, becaExclude] } : { mes, anio };

    const [
        cuotasRows,
        sponsorsRows,
        alquileresRows,
        eventIds,
        nominaRows,
        gastosRows,
    ] = await Promise.all([
        Payment.aggregate([
            { $match: paymentMatch },
            {
                $group: {
                    _id: null,
                    facturado: { $sum: { $ifNull: ['$montoFinal', 0] } },
                    cobrado: {
                        $sum: {
                            $cond: [{ $eq: ['$estado', 'pagado'] }, { $ifNull: ['$montoFinal', 0] }, 0],
                        },
                    },
                },
            },
        ]),
        SponsorPayment.aggregate([
            { $match: { mes, anio } },
            {
                $group: {
                    _id: null,
                    esperado: { $sum: { $ifNull: ['$monto', 0] } },
                    cobrado: {
                        $sum: {
                            $cond: [{ $eq: ['$estado', 'pagado'] }, { $ifNull: ['$monto', 0] }, 0],
                        },
                    },
                },
            },
        ]),
        Rental.aggregate([
            {
                $match: {
                    estadoReserva: { $ne: 'cancelada' },
                    fecha: { $gte: from, $lt: to },
                },
            },
            {
                $group: {
                    _id: null,
                    facturado: { $sum: { $ifNull: ['$montoTotal', 0] } },
                    cobrado: { $sum: { $ifNull: ['$señaPagada', 0] } },
                },
            },
        ]),
        ClubEvent.find({ fechaInicio: { $gte: from, $lt: to } }).select('_id').lean(),
        PayrollEntry.aggregate([
            { $match: { mes, anio } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$monto', 0] } } } },
        ]),
        Bill.aggregate([
            { $match: { fecha: { $gte: from, $lt: to } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: { $ifNull: ['$monto', 0] } },
                    pagado: {
                        $sum: {
                            $cond: [{ $eq: ['$estado', 'pagado'] }, { $ifNull: ['$monto', 0] }, 0],
                        },
                    },
                    pendiente: {
                        $sum: {
                            $cond: [{ $eq: ['$estado', 'pendiente'] }, { $ifNull: ['$monto', 0] }, 0],
                        },
                    },
                },
            },
        ]),
    ]);

    const ids = (eventIds || []).map((e) => e._id);
    let eventosCobrado = 0;
    let eventosOrdenes = 0;
    if (ids.length) {
        const [eventosAgg] = await EventTicketOrder.aggregate([
            {
                $match: {
                    evento: { $in: ids },
                    estado: { $in: ['pagada', 'gratis'] },
                },
            },
            {
                $group: {
                    _id: null,
                    cobrado: { $sum: { $ifNull: ['$montoTotal', 0] } },
                    ordenes: { $sum: 1 },
                },
            },
        ]);
        eventosCobrado = eventosAgg?.cobrado || 0;
        eventosOrdenes = eventosAgg?.ordenes || 0;
    }

    const cuotasFacturado = round2(cuotasRows[0]?.facturado);
    const cuotasCobrado = round2(cuotasRows[0]?.cobrado);
    const cuotasPendiente = round2(Math.max(0, cuotasFacturado - cuotasCobrado));

    const sponsorsEsperado = round2(sponsorsRows[0]?.esperado);
    const sponsorsCobrado = round2(sponsorsRows[0]?.cobrado);

    const alquileresFacturado = round2(alquileresRows[0]?.facturado);
    const alquileresCobrado = round2(alquileresRows[0]?.cobrado);

    const eventosCobradoR = round2(eventosCobrado);

    const nominaTotal = round2(nominaRows[0]?.total);
    const gastosTotal = round2(gastosRows[0]?.total);
    const gastosPagado = round2(gastosRows[0]?.pagado);
    const gastosPendiente = round2(gastosRows[0]?.pendiente);

    const totalCobrado = round2(
        cuotasCobrado + sponsorsCobrado + alquileresCobrado + eventosCobradoR
    );
    const totalFacturado = round2(
        cuotasFacturado + sponsorsEsperado + alquileresFacturado + eventosCobradoR
    );
    const egresosTotal = round2(nominaTotal + gastosTotal);
    const resultado = round2(totalCobrado - egresosTotal);

    res.json({
        mes,
        anio,
        ingresos: {
            cuotas: {
                facturado: cuotasFacturado,
                cobrado: cuotasCobrado,
                pendiente: cuotasPendiente,
            },
            sponsors: {
                esperado: sponsorsEsperado,
                cobrado: sponsorsCobrado,
            },
            alquileres: {
                facturado: alquileresFacturado,
                cobrado: alquileresCobrado,
            },
            eventos: {
                cobrado: eventosCobradoR,
                ordenes: eventosOrdenes,
            },
            totalCobrado,
            totalFacturado,
        },
        egresos: {
            nomina: { total: nominaTotal },
            gastos: {
                total: gastosTotal,
                pagado: gastosPagado,
                pendiente: gastosPendiente,
            },
            total: egresosTotal,
        },
        resultado,
    });
});

export { getCaja };
