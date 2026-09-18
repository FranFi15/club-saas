/**
 * Genera cuotas del mes para inscripciones activas que facturan (una por atleta/disciplina).
 * Usado por POST /financial/payments/generate y el cron del día 1.
 */

import {
    findTrainingPaymentInDiscipline,
    reconcileDisciplineBillingFlags,
} from './disciplineBilling.service.js';
import {
    calendarMonthYearInTz,
    DEFAULT_CLUB_TIMEZONE,
    zonedWallTimeToDate,
} from '../utils/timeHelper.js';
import { isBecaPlan, removeOpenTrainingPaymentsForBeca } from './becaPlan.service.js';
import { userHasRole } from '../constants/userRoles.js';

function paymentAmountsFromEnrollment(inscripcion) {
    const plan = typeof inscripcion.plan === 'object' && inscripcion.plan
        ? inscripcion.plan
        : null;
    if (!plan?._id && !plan?.id) return null;
    if (isBecaPlan(plan)) return null;

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

export { paymentAmountsFromEnrollment };

/**
 * Recalcula montos de cuotas abiertas (pendiente/vencido) según el descuento de la inscripción.
 * @param {'current_month'|'all_open'} scope
 */
export async function retargetOpenPaymentsFromEnrollments(
    models,
    athleteIds,
    { scope = 'all_open', mes, anio } = {},
) {
    const { Payment, Enrollment } = models;
    const ids = [...new Set((athleteIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return { updated: 0, pending: 0 };

    const openFilter = {
        atleta: { $in: ids },
        estado: { $in: ['pendiente', 'vencido'] },
        $or: [{ tipo: 'entrenamiento' }, { tipo: { $exists: false } }, { tipo: null }],
    };
    if (scope === 'current_month' && mes && anio) {
        openFilter.mes = Number(mes);
        openFilter.anio = Number(anio);
    }

    const payments = await Payment.find(openFilter).populate('plan');
    if (!payments.length) return { updated: 0, pending: 0 };

    const enrollments = await Enrollment.find({
        atleta: { $in: ids },
        estado: 'activo',
        esFacturacion: true,
    }).populate('plan');

    const enrollmentByKey = new Map();
    for (const e of enrollments) {
        const aid = String(e.atleta);
        const planId = String(e.plan?._id || e.plan || '');
        const catId = String(e.categoria?._id || e.categoria || '');
        if (planId) enrollmentByKey.set(`${aid}:plan:${planId}`, e);
        if (catId) enrollmentByKey.set(`${aid}:cat:${catId}`, e);
        if (!enrollmentByKey.has(`${aid}:any`)) enrollmentByKey.set(`${aid}:any`, e);
    }

    let updated = 0;
    for (const p of payments) {
        const aid = String(p.atleta);
        const planId = String(p.plan?._id || p.plan || '');
        const catId = String(p.categoria || '');
        const insc =
            enrollmentByKey.get(`${aid}:plan:${planId}`) ||
            enrollmentByKey.get(`${aid}:cat:${catId}`) ||
            enrollmentByKey.get(`${aid}:any`);
        if (!insc) continue;

        const planForAmounts =
            insc.plan && typeof insc.plan === 'object' ? insc.plan : p.plan;
        const amounts = paymentAmountsFromEnrollment({
            ...(insc.toObject?.() || insc),
            plan: planForAmounts,
        });
        if (!amounts) continue;

        const same =
            Math.abs(Number(p.montoFinal) - amounts.montoAFacturar) < 0.01 &&
            Math.abs(Number(p.descuentoAplicado || 0) - amounts.dineroDescontado) < 0.01;
        if (same) continue;

        p.montoOriginal = amounts.valorCuota;
        p.descuentoAplicado = amounts.dineroDescontado;
        p.motivoDescuento = amounts.motivoDescuento || p.motivoDescuento || '';
        p.montoFinal = amounts.montoAFacturar;
        await p.save();
        updated += 1;
    }

    return { updated };
}

/** Cuenta cuotas abiertas que no coinciden con el descuento de inscripción (sin guardar). */
export async function countOpenPaymentsNeedingDiscountRetarget(models, athleteIds, { mes, anio } = {}) {
    const { Payment, Enrollment } = models;
    const ids = [...new Set((athleteIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return { allOpen: 0, currentMonth: 0 };

    const payments = await Payment.find({
        atleta: { $in: ids },
        estado: { $in: ['pendiente', 'vencido'] },
        $or: [{ tipo: 'entrenamiento' }, { tipo: { $exists: false } }, { tipo: null }],
    }).populate('plan');

    const enrollments = await Enrollment.find({
        atleta: { $in: ids },
        estado: 'activo',
        esFacturacion: true,
    }).populate('plan');

    const enrollmentByKey = new Map();
    for (const e of enrollments) {
        const aid = String(e.atleta);
        const planId = String(e.plan?._id || e.plan || '');
        const catId = String(e.categoria?._id || e.categoria || '');
        if (planId) enrollmentByKey.set(`${aid}:plan:${planId}`, e);
        if (catId) enrollmentByKey.set(`${aid}:cat:${catId}`, e);
        if (!enrollmentByKey.has(`${aid}:any`)) enrollmentByKey.set(`${aid}:any`, e);
    }

    let allOpen = 0;
    let currentMonth = 0;
    const mesN = mes != null ? Number(mes) : null;
    const anioN = anio != null ? Number(anio) : null;

    for (const p of payments) {
        const aid = String(p.atleta);
        const planId = String(p.plan?._id || p.plan || '');
        const catId = String(p.categoria || '');
        const insc =
            enrollmentByKey.get(`${aid}:plan:${planId}`) ||
            enrollmentByKey.get(`${aid}:cat:${catId}`) ||
            enrollmentByKey.get(`${aid}:any`);
        if (!insc) continue;
        const planForAmounts =
            insc.plan && typeof insc.plan === 'object' ? insc.plan : p.plan;
        const amounts = paymentAmountsFromEnrollment({
            ...(insc.toObject?.() || insc),
            plan: planForAmounts,
        });
        if (!amounts) continue;
        const same =
            Math.abs(Number(p.montoFinal) - amounts.montoAFacturar) < 0.01 &&
            Math.abs(Number(p.descuentoAplicado || 0) - amounts.dineroDescontado) < 0.01;
        if (same) continue;
        allOpen += 1;
        if (mesN && anioN && Number(p.mes) === mesN && Number(p.anio) === anioN) {
            currentMonth += 1;
        }
    }

    return { allOpen, currentMonth };
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
export async function ensurePaymentForEnrollment(models, enrollment, mes, anio, timezone = DEFAULT_CLUB_TIMEZONE) {
    const { Payment, Enrollment } = models;
    if (!enrollment) return { created: false, omitted: true, reason: 'sin_inscripcion' };

    let insc = enrollment;
    const needsPopulate =
        !insc.plan ||
        typeof insc.plan !== 'object' ||
        (insc.plan.monto == null && !insc.plan.esBeca) ||
        !insc.categoria ||
        typeof insc.categoria !== 'object';

    if (needsPopulate) {
        insc = await Enrollment.findById(enrollment._id || enrollment)
            .populate('plan')
            .populate({
                path: 'categoria',
                select: 'nombre disciplina',
                populate: { path: 'disciplina', select: 'nombre' },
            });
    }
    if (!insc) return { created: false, omitted: true, reason: 'sin_inscripcion' };
    if (insc.esFacturacion !== true) {
        return { created: false, omitted: true, reason: 'no_facturacion' };
    }

    if (isBecaPlan(insc.plan)) {
        const atletaId = insc.atleta?._id || insc.atleta;
        await removeOpenTrainingPaymentsForBeca(models, {
            atletaId,
            planId: insc.plan._id || insc.plan,
            categoriaId: insc.categoria?._id || insc.categoria,
        });
        return { created: false, omitted: true, reason: 'beca' };
    }

    const { User } = models;
    const atletaIdEarly = insc.atleta?._id || insc.atleta;
    if (atletaIdEarly) {
        const trialUser = await User.findById(atletaIdEarly).select('esPrueba rol roles').lean();
        if (trialUser?.esPrueba && userHasRole(trialUser, 'atleta')) {
            return { created: false, omitted: true, reason: 'atleta_prueba' };
        }
    }

    const amounts = paymentAmountsFromEnrollment(insc);
    if (!amounts) return { created: false, omitted: true, reason: 'sin_plan' };

    const atletaId = insc.atleta?._id || insc.atleta;
    const categoriaId = insc.categoria?._id || insc.categoria;
    const disciplinaId = disciplinaIdFromEnrollment(insc);

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

    const ymd = `${anio}-${String(mes).padStart(2, '0')}-${String(amounts.diaVenc).padStart(2, '0')}`;
    const fechaVencimiento = zonedWallTimeToDate(ymd, '23:59', timezone);

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

/** Cuota del mes calendario actual (zona del club). */
export async function ensureCurrentMonthPaymentForEnrollment(
    models,
    enrollment,
    timezone = DEFAULT_CLUB_TIMEZONE,
) {
    const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
    return ensurePaymentForEnrollment(models, enrollment, mes, anio, timezone);
}

export async function generateMonthlyPaymentsForTenant(
    models,
    mes,
    anio,
    timezone = DEFAULT_CLUB_TIMEZONE,
) {
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

    for (const insc of inscripcionesActivas) {
        const result = await ensurePaymentForEnrollment(models, insc, mes, anio, timezone);
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
