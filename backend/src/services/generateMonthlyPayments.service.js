/**
 * Genera cuotas del mes para inscripciones activas con plan asignado.
 * Usado por POST /financial/payments/generate y el cron del día 1.
 */

function paymentAmountsFromEnrollment(inscripcion) {
    const plan = typeof inscripcion.plan === 'object' && inscripcion.plan
        ? inscripcion.plan
        : null;
    if (!plan?._id && !plan?.id) return null;

    const valorCuota = Number(plan.monto) || 0;
    let dineroDescontado = 0;
    let montoAFacturar = valorCuota;
    const pct = Number(inscripcion.descuentoPorcentaje) || 0;
    if (pct > 0) {
        dineroDescontado = (valorCuota * pct) / 100;
        montoAFacturar = valorCuota - dineroDescontado;
    }
    const diaVenc = plan.diaVencimiento || 10;
    return {
        planId: plan._id || plan.id,
        valorCuota,
        dineroDescontado,
        montoAFacturar,
        diaVenc,
        motivoDescuento: inscripcion.motivoDescuento,
    };
}

/**
 * Crea la cuota de un período para una inscripción si aún no existe.
 * @returns {{ created: boolean, omitted: boolean, reason?: string }}
 */
export async function ensurePaymentForEnrollment(models, enrollment, mes, anio) {
    const { Payment, Enrollment } = models;
    if (!enrollment) return { created: false, omitted: true, reason: 'sin_inscripcion' };

    let inscripcion = enrollment;
    if (!inscripcion.plan || typeof inscripcion.plan !== 'object' || !inscripcion.plan.monto) {
        inscripcion = await Enrollment.findById(enrollment._id || enrollment)
            .populate('plan')
            .populate('categoria');
    }
    if (!inscripcion) return { created: false, omitted: true, reason: 'sin_inscripcion' };

    const amounts = paymentAmountsFromEnrollment(inscripcion);
    if (!amounts) return { created: false, omitted: true, reason: 'sin_plan' };

    const atletaId = inscripcion.atleta?._id || inscripcion.atleta;
    const categoriaId =
        inscripcion.categoria?._id || inscripcion.categoria;

    const reciboExistente = await Payment.findOne({
        atleta: atletaId,
        plan: amounts.planId,
        mes,
        anio,
    });
    if (reciboExistente) return { created: false, omitted: true, reason: 'ya_existe' };

    const fechaVencimiento = new Date(anio, mes - 1, amounts.diaVenc, 23, 59, 59);

    await Payment.create({
        atleta: atletaId,
        plan: amounts.planId,
        categoria: categoriaId,
        mes,
        anio,
        montoOriginal: amounts.valorCuota,
        descuentoAplicado: amounts.dineroDescontado,
        motivoDescuento: amounts.motivoDescuento,
        montoFinal: amounts.montoAFacturar,
        fechaVencimiento,
        estado: 'pendiente',
    });

    return { created: true, omitted: false };
}

/** Cuota del mes calendario actual (zona del servidor). */
export async function ensureCurrentMonthPaymentForEnrollment(models, enrollment) {
    const now = new Date();
    return ensurePaymentForEnrollment(models, enrollment, now.getMonth() + 1, now.getFullYear());
}

export async function generateMonthlyPaymentsForTenant(models, mes, anio) {
    const { Enrollment } = models;

    const inscripcionesActivas = await Enrollment.find({ estado: 'activo' })
        .select('atleta plan categoria descuentoPorcentaje motivoDescuento')
        .populate('plan')
        .populate('categoria');

    const inscripcionesConPlan = inscripcionesActivas.filter((i) => i.plan);
    const inscripcionesSinPlan = inscripcionesActivas.length - inscripcionesConPlan.length;

    let cuotasCreadas = 0;
    let cuotasOmitidas = 0;

    for (const inscripcion of inscripcionesConPlan) {
        const result = await ensurePaymentForEnrollment(models, inscripcion, mes, anio);
        if (result.created) cuotasCreadas++;
        else cuotasOmitidas++;
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
