/**
 * Genera cuotas del mes para inscripciones activas con plan asignado.
 * Usado por POST /financial/payments/generate y el cron del día 1.
 */
export async function generateMonthlyPaymentsForTenant(models, mes, anio) {
    const { Enrollment, Payment } = models;

    const inscripcionesActivas = await Enrollment.find({ estado: 'activo' })
        .select('atleta plan categoria descuentoPorcentaje motivoDescuento')
        .populate('plan')
        .populate('categoria');

    const inscripcionesConPlan = inscripcionesActivas.filter((i) => i.plan);
    const inscripcionesSinPlan = inscripcionesActivas.length - inscripcionesConPlan.length;

    let cuotasCreadas = 0;
    let cuotasOmitidas = 0;

    for (const inscripcion of inscripcionesConPlan) {
        const reciboExistente = await Payment.findOne({
            atleta: inscripcion.atleta,
            plan: inscripcion.plan._id,
            mes,
            anio,
        });

        if (reciboExistente) {
            cuotasOmitidas++;
            continue;
        }

        const valorCuota = inscripcion.plan.monto;
        let dineroDescontado = 0;
        let montoAFacturar = valorCuota;

        if (inscripcion.descuentoPorcentaje > 0) {
            dineroDescontado = (valorCuota * inscripcion.descuentoPorcentaje) / 100;
            montoAFacturar = valorCuota - dineroDescontado;
        }

        const diaVenc = inscripcion.plan.diaVencimiento || 10;
        const fechaVencimiento = new Date(anio, mes - 1, diaVenc, 23, 59, 59);

        await Payment.create({
            atleta: inscripcion.atleta,
            plan: inscripcion.plan._id,
            categoria: inscripcion.categoria._id || inscripcion.categoria,
            mes,
            anio,
            montoOriginal: valorCuota,
            descuentoAplicado: dineroDescontado,
            motivoDescuento: inscripcion.motivoDescuento,
            montoFinal: montoAFacturar,
            fechaVencimiento,
            estado: 'pendiente',
        });

        cuotasCreadas++;
    }

    return {
        cuotasCreadas,
        cuotasOmitidas,
        totalProcesados: inscripcionesActivas.length,
        inscripcionesActivas: inscripcionesActivas.length,
        inscripcionesSinPlan,
        inscripcionesConPlan: inscripcionesConPlan.length,
    };
}
