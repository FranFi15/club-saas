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
import { ensureSocialFeeForUser } from './generateSocialFees.service.js';

function paymentAmountsFromEnrollment(inscripcion, { partialMonthPct = 0 } = {}) {
    const plan = typeof inscripcion.plan === 'object' && inscripcion.plan
        ? inscripcion.plan
        : null;
    if (!plan?._id && !plan?.id) return null;
    if (isBecaPlan(plan)) return null;

    const valorCuota = Number(plan.monto) || 0;
    let montoAFacturar = valorCuota;
    let dineroDescontado = 0;
    const motivos = [];

    const familyPct = Number(inscripcion.descuentoPorcentaje) || 0;
    if (familyPct > 0) {
        const d = (montoAFacturar * familyPct) / 100;
        dineroDescontado += d;
        montoAFacturar -= d;
        if (inscripcion.motivoDescuento) motivos.push(inscripcion.motivoDescuento);
        else motivos.push(`Descuento ${familyPct}%`);
    }

    const parcial = Math.min(100, Math.max(0, Number(partialMonthPct) || 0));
    if (parcial > 0) {
        const d = (montoAFacturar * parcial) / 100;
        dineroDescontado += d;
        montoAFacturar -= d;
        motivos.push(
            parcial === 50 ? 'Mitad de cuota (mes parcial)' : `Descuento mes parcial ${parcial}%`,
        );
    }

    const diaVenc = plan.diaVencimiento || 10;
    return {
        planId: plan._id || plan.id,
        valorCuota,
        dineroDescontado,
        montoAFacturar,
        diaVenc,
        motivoDescuento: motivos.filter(Boolean).join(' · ') || undefined,
    };
}

export { paymentAmountsFromEnrollment };

async function getCategoryPartialMonthPct(models, categoriaId, mes, anio) {
    if (!categoriaId) return 0;
    const { Schedule } = models;
    const slots = await Schedule.find({
        categoria: categoriaId,
        descuentosMesesParciales: {
            $elemMatch: { mes: Number(mes), anio: Number(anio) },
        },
    })
        .select('descuentosMesesParciales')
        .lean();

    let max = 0;
    for (const s of slots) {
        for (const d of s.descuentosMesesParciales || []) {
            if (Number(d.mes) === Number(mes) && Number(d.anio) === Number(anio)) {
                max = Math.max(max, Number(d.porcentaje) || 0);
            }
        }
    }
    return max;
}

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
        const catForPartial = insc.categoria?._id || insc.categoria || p.categoria;
        const partialPct = await getCategoryPartialMonthPct(
            models,
            catForPartial,
            p.mes,
            p.anio,
        );
        const amounts = paymentAmountsFromEnrollment(
            {
                ...(insc.toObject?.() || insc),
                plan: planForAmounts,
            },
            { partialMonthPct: partialPct },
        );
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
        const catForPartial = insc.categoria?._id || insc.categoria || p.categoria;
        const partialPct = await getCategoryPartialMonthPct(
            models,
            catForPartial,
            p.mes,
            p.anio,
        );
        const amounts = paymentAmountsFromEnrollment(
            {
                ...(insc.toObject?.() || insc),
                plan: planForAmounts,
            },
            { partialMonthPct: partialPct },
        );
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

    const categoriaId = insc.categoria?._id || insc.categoria;
    const partialPct = await getCategoryPartialMonthPct(models, categoriaId, mes, anio);
    const amounts = paymentAmountsFromEnrollment(insc, { partialMonthPct: partialPct });
    if (!amounts) return { created: false, omitted: true, reason: 'sin_plan' };

    const atletaId = insc.atleta?._id || insc.atleta;
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

    const doc = await Payment.create({
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

    return { created: true, omitted: false, paymentId: doc._id };
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

function addCalendarMonths(mes, anio, delta) {
    const idx = anio * 12 + (mes - 1) + delta;
    return { mes: (idx % 12) + 1, anio: Math.floor(idx / 12) };
}

function monthRank(mes, anio) {
    return Number(anio) * 12 + Number(mes);
}

function periodAfterCap(period, cap) {
    if (!cap) return false;
    return monthRank(period.mes, period.anio) > monthRank(cap.mes, cap.anio);
}

/**
 * Si la categoría tiene grilla con "terminar cuotas al finalizar",
 * el tope de facturación es el mes del máximo vigenteHasta (última sesión),
 * inclusive aunque el fin sea a mitad de mes (ej. 15/12 → se puede crear cuota de diciembre).
 */
export async function getCategoryBillingCap(models, categoriaId) {
    const { Schedule } = models;
    if (!categoriaId) return null;

    const slots = await Schedule.find({ categoria: categoriaId })
        .select('vigenteHasta terminarCuotasAlFinalizar')
        .lean();
    if (!slots.length) return null;

    const flagged = slots.filter((s) => s.terminarCuotasAlFinalizar);
    if (!flagged.length) return null;

    let maxHasta = null;
    for (const s of flagged) {
        if (!s.vigenteHasta) continue;
        const d = new Date(s.vigenteHasta);
        if (Number.isNaN(d.getTime())) continue;
        if (!maxHasta || d > maxHasta) maxHasta = d;
    }
    if (!maxHasta) return null;

    return {
        mes: maxHasta.getUTCMonth() + 1,
        anio: maxHasta.getUTCFullYear(),
        vigenteHasta: maxHasta,
    };
}

/** Preview de tope de adelanto por grilla (terminar cuotas). */
export async function getAthleteAdvanceBillingInfo(
    models,
    atletaId,
    { desdeMes, desdeAnio, timezone = DEFAULT_CLUB_TIMEZONE } = {},
) {
    const { Enrollment, User } = models;
    const now = calendarMonthYearInTz(new Date(), timezone);
    const startMes = Number(desdeMes) || now.mes;
    const startAnio = Number(desdeAnio) || now.anio;

    const user = await User.findById(atletaId).select('nombre apellido').lean();
    const enrollments = await Enrollment.find({
        atleta: atletaId,
        estado: 'activo',
        esFacturacion: true,
        plan: { $ne: null },
    })
        .select('categoria')
        .populate('categoria', 'nombre');

    const caps = [];
    let latestCap = null;
    for (const insc of enrollments) {
        const catId = insc.categoria?._id || insc.categoria;
        const cap = await getCategoryBillingCap(models, catId);
        if (!cap) continue;
        const entry = {
            categoriaId: String(catId),
            categoriaNombre: insc.categoria?.nombre || 'Categoría',
            mes: cap.mes,
            anio: cap.anio,
            vigenteHasta: cap.vigenteHasta,
        };
        caps.push(entry);
        if (
            !latestCap ||
            monthRank(entry.mes, entry.anio) > monthRank(latestCap.mes, latestCap.anio)
        ) {
            latestCap = entry;
        }
    }

    let maxMeses = 24;
    let effectiveDesdeMes = startMes;
    let effectiveDesdeAnio = startAnio;
    if (latestCap) {
        // If Finanzas is already past the grilla end, snap to the last billable month
        // so the (possibly partial) end month can still be generated.
        if (monthRank(startMes, startAnio) > monthRank(latestCap.mes, latestCap.anio)) {
            effectiveDesdeMes = latestCap.mes;
            effectiveDesdeAnio = latestCap.anio;
        }
        const delta =
            monthRank(latestCap.mes, latestCap.anio) -
            monthRank(effectiveDesdeMes, effectiveDesdeAnio) +
            1;
        maxMeses = Math.max(0, Math.min(24, delta));
    }

    return {
        atleta: user,
        desdeMes: effectiveDesdeMes,
        desdeAnio: effectiveDesdeAnio,
        solicitadoMes: startMes,
        solicitadoAnio: startAnio,
        limitadoPorGrilla: caps.length > 0,
        caps,
        tope: latestCap,
        maxMeses,
    };
}

/**
 * Genera cuotas de entrenamiento (y opcionalmente social) para un atleta
 * en N meses consecutivos a partir del mes indicado (default: mes actual del club).
 * Respeta tope de grilla cuando "terminar cuotas al finalizar" está activo.
 */
export async function advancePaymentsForAthlete(
    models,
    atletaId,
    {
        cantidadMeses = 1,
        incluirSocial = true,
        desdeMes,
        desdeAnio,
        timezone = DEFAULT_CLUB_TIMEZONE,
    } = {},
) {
    const { Enrollment, User } = models;
    if (!atletaId) {
        const err = new Error('Atleta requerido.');
        err.statusCode = 400;
        throw err;
    }

    const user = await User.findById(atletaId)
        .select('nombre apellido rol roles estado exentoCuotaSocial cuotaSocialAsignada esPrueba')
        .lean();
    if (!user) {
        const err = new Error('Usuario no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (user.estado === 'inactivo') {
        const err = new Error('El usuario está inactivo.');
        err.statusCode = 400;
        throw err;
    }

    const now = calendarMonthYearInTz(new Date(), timezone);
    let startMes = Number(desdeMes) || now.mes;
    let startAnio = Number(desdeAnio) || now.anio;
    if (startMes < 1 || startMes > 12 || !startAnio) {
        const err = new Error('Mes o año de inicio inválido.');
        err.statusCode = 400;
        throw err;
    }

    let n = Math.min(24, Math.max(1, Math.floor(Number(cantidadMeses) || 1)));

    const enrollments = await Enrollment.find({
        atleta: atletaId,
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

    const capByCategory = new Map();
    let latestTrainingCap = null;
    for (const insc of enrollments) {
        const catId = String(insc.categoria?._id || insc.categoria || '');
        if (!catId || capByCategory.has(catId)) continue;
        const cap = await getCategoryBillingCap(models, catId);
        capByCategory.set(catId, cap);
        if (cap) {
            if (
                !latestTrainingCap ||
                monthRank(cap.mes, cap.anio) > monthRank(latestTrainingCap.mes, latestTrainingCap.anio)
            ) {
                latestTrainingCap = cap;
            }
        }
    }

    // Past the grilla end → still allow generating the last inclusive month (e.g. Dec when hasta=15/12).
    if (
        latestTrainingCap &&
        monthRank(startMes, startAnio) > monthRank(latestTrainingCap.mes, latestTrainingCap.anio)
    ) {
        startMes = latestTrainingCap.mes;
        startAnio = latestTrainingCap.anio;
    }

    const allCapped =
        enrollments.length > 0 &&
        enrollments.every((insc) => {
            const catId = String(insc.categoria?._id || insc.categoria || '');
            return Boolean(capByCategory.get(catId));
        });
    if (allCapped && latestTrainingCap) {
        const delta =
            monthRank(latestTrainingCap.mes, latestTrainingCap.anio) -
            monthRank(startMes, startAnio) +
            1;
        if (delta < 1) {
            if (!incluirSocial) {
                const err = new Error(
                    'La grilla de entrenamiento ya terminó (terminar cuotas al finalizar). No hay meses para adelantar.',
                );
                err.statusCode = 400;
                throw err;
            }
            // Solo social: igual generamos el rango pedido sin cuotas de entrenamiento.
        } else {
            n = Math.min(n, delta);
        }
    }

    let cuotasCreadas = 0;
    let cuotasOmitidas = 0;
    let cuotasFueraDeGrilla = 0;
    let socialesCreadas = 0;
    let socialesOmitidas = 0;
    const paymentIds = [];
    const periodos = [];

    for (let i = 0; i < n; i++) {
        const period = addCalendarMonths(startMes, startAnio, i);
        periodos.push(period);

        for (const insc of enrollments) {
            const catId = String(insc.categoria?._id || insc.categoria || '');
            const cap = capByCategory.get(catId);
            if (periodAfterCap(period, cap)) {
                cuotasFueraDeGrilla += 1;
                continue;
            }
            const result = await ensurePaymentForEnrollment(
                models,
                insc,
                period.mes,
                period.anio,
                timezone,
            );
            if (result.created) {
                cuotasCreadas += 1;
                if (result.paymentId) paymentIds.push(String(result.paymentId));
            } else {
                cuotasOmitidas += 1;
            }
        }

        if (incluirSocial) {
            const social = await ensureSocialFeeForUser(
                models,
                user,
                period.mes,
                period.anio,
                timezone,
            );
            if (social.created) {
                socialesCreadas += 1;
                if (social.paymentId) paymentIds.push(String(social.paymentId));
            } else {
                socialesOmitidas += 1;
            }
        }
    }

    return {
        cantidadMeses: n,
        periodos,
        cuotasCreadas,
        cuotasOmitidas,
        cuotasFueraDeGrilla,
        socialesCreadas,
        socialesOmitidas,
        paymentIds,
        inscripciones: enrollments.length,
        limitadoPorGrilla: [...capByCategory.values()].some(Boolean),
        topeGrilla: latestTrainingCap
            ? { mes: latestTrainingCap.mes, anio: latestTrainingCap.anio }
            : null,
    };
}
