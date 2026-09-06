/**
 * Genera cuotas del mes para inscripciones activas que facturan (una por atleta/disciplina).
 * Usado por POST /financial/payments/generate y el cron del día 1.
 */

import {
    findTrainingPaymentInDiscipline,
    reconcileDisciplineBillingFlags,
} from './disciplineBilling.service.js';

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

function disciplinaIdFromEnrollment(inscripcion) {
    const cat = inscripcion.categoria;
    if (!cat) return null;
    const disc = cat.disciplina;
    return disc?._id || disc || null;
}

/**
 * Crea la cuota de un período para una inscripción si aún no existe.
 * @returns {{ created: boolean, omitted: boolean, reason?: string }}
 */
export async function ensurePaymentForEnrollment(models, enrollment, mes, anio) {
    const { Payment, Enrollment } = models;
    if (!enrollment) return { created: false, omitted: true, reason: 'sin_inscripcion' };

    let inscripcion = enrollment;
    if (
        !inscripcion.plan ||
        typeof inscripcion.plan !== 'object' ||
        !inscripcion.plan.monto ||
        !inscripcion.categoria ||
        typeof inscripcion.categoria !== 'object'
    ) {
        inscripcion = await Enrollment.findById(enrollment._id || enrollment)
            .populate('plan')
            .populate({
                path: 'categoria',
                select: 'nombre disciplina',
                populate: { path: 'disciplina', select: 'nombre' },
            });
    }
    if (!inscripcion) return { created: false, omitted: true, reason: 'sin_inscripcion' };
    if (inscripcion.esFacturacion !== true) {
        return { created: false, omitted: true, reason: 'no_facturacion' };
    }

    const amounts = paymentAmountsFromEnrollment(inscripcion);
    if (!amounts) return { created: false, omitted: true, reason: 'sin_plan' };

    const atletaId = inscripcion.atleta?._id || inscripcion.atleta;
    const categoriaId = inscripcion.categoria?._id || inscripcion.categoria;
    const disciplinaId = disciplinaIdFromEnrollment(inscripcion);

    if (disciplinaId) {
        const enDisciplina = await findTrainingPaymentInDiscipline(
            models,
            atletaId,
            disciplinaId,
            mes,
            anio,
        );
        if (enDisciplina) return { created: false, omitted: true, reason: 'ya_existe' };
    } else {
        const reciboExistente = await Payment.findOne({
            atleta: atletaId,
            plan: amounts.planId,
            mes,
            anio,
            $or: [{ tipo: 'entrenamiento' }, { tipo: { $exists: false } }, { tipo: null }],
        });
        if (reciboExistente) return { created: false, omitted: true, reason: 'ya_existe' };
    }

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
        tipo: 'entrenamiento',
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

    await reconcileDisciplineBillingFlags(models);

    const inscripcionesActivas = await Enrollment.find({
        estado: 'activo',
        esFacturacion: true,
        plan: { $ne: null },
    })
        .select('atleta plan categoria descuentoPorcentaje motivoDescuento esFacturacion')
        .populate('plan')
        .populate({
            path: 'categoria',
            select: 'nombre disciplina',
            populate: { path: 'disciplina', select: 'nombre' },
        });

    const todasActivas = await Enrollment.countDocuments({ estado: 'activo' });
    const inscripcionesSinPlan = Math.max(0, todasActivas - inscripcionesActivas.length);

    let cuotasCreadas = 0;
    let cuotasOmitidas = 0;

    for (const inscripcion of inscripcionesActivas) {
        const result = await ensurePaymentForEnrollment(models, inscripcion, mes, anio);
        if (result.created) cuotasCreadas++;
        else cuotasOmitidas++;
    }

    return {
        cuotasCreadas,
        cuotasOmitidas,
        totalProcesados: todasActivas,
        inscripcionesActivas: todasActivas,
        inscripcionesSinPlan,
        inscripcionesConPlan: inscripcionesActivas.length,
    };
}
