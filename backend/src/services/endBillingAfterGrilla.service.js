/**
 * Cuando la grilla de una categoría ya no tiene sesiones vigentes y al menos
 * un horario pidió "terminar cuotas al finalizar", deja de facturar a los inscriptos
 * (siguen en plantel; se promociona facturación a otra categoría de la disciplina si hay).
 * Al crear/reactivar una grilla, resumeBillingForCategory vuelve a facturar.
 */
import { startOfTodayUtc } from './sessionFromSchedule.service.js';
import {
    clearEnrollmentBilling,
    promoteBillingAfterUnenroll,
    setEnrollmentAsDisciplineBilling,
} from './disciplineBilling.service.js';

function defaultPlanIdForCategory(cat) {
    return (
        cat?.planDefault?._id ||
        cat?.planDefault ||
        cat?.disciplina?.planDefault?._id ||
        cat?.disciplina?.planDefault ||
        null
    );
}

export async function endBillingForEndedSchedules(models) {
    const { Schedule, Enrollment } = models;
    const hoy = startOfTodayUtc();

    const flaggedCategoryIds = await Schedule.distinct('categoria', {
        terminarCuotasAlFinalizar: true,
    });

    let categoriasCerradas = 0;
    let inscripcionesSinFacturar = 0;

    for (const categoriaId of flaggedCategoryIds) {
        if (!categoriaId) continue;

        const slots = await Schedule.find({ categoria: categoriaId })
            .select('vigenteHasta terminarCuotasAlFinalizar')
            .lean();
        if (!slots.length) continue;
        if (!slots.some((s) => s.terminarCuotasAlFinalizar)) continue;

        let maxHasta = null;
        for (const s of slots) {
            if (!s.vigenteHasta) continue;
            const d = new Date(s.vigenteHasta);
            if (!maxHasta || d > maxHasta) maxHasta = d;
        }
        if (!maxHasta || maxHasta >= hoy) continue;

        const enrollments = await Enrollment.find({
            categoria: categoriaId,
            estado: 'activo',
            esFacturacion: true,
        });
        if (!enrollments.length) continue;

        categoriasCerradas += 1;
        for (const enr of enrollments) {
            await clearEnrollmentBilling(enr);
            try {
                await promoteBillingAfterUnenroll(models, enr);
            } catch (e) {
                console.warn(
                    '[endBillingForEndedSchedules] promover facturación:',
                    e.message,
                );
            }
            inscripcionesSinFacturar += 1;
        }
    }

    return {
        categoriasRevisadas: flaggedCategoryIds.length,
        categoriasCerradas,
        inscripcionesSinFacturar,
    };
}

/**
 * Reanuda facturación de inscriptos activos de la categoría cuando la grilla
 * vuelve a estar vigente (nueva temporada / nuevo rango desde–hasta).
 */
export async function resumeBillingForCategory(models, categoriaId) {
    const { Enrollment, Category, Schedule } = models;
    if (!categoriaId) return { resumed: 0, skipped: 0 };

    const hoy = startOfTodayUtc();
    const activeSlot = await Schedule.findOne({
        categoria: categoriaId,
        vigenteHasta: { $gte: hoy },
        $or: [
            { vigenteDesde: null },
            { vigenteDesde: { $exists: false } },
            { vigenteDesde: { $lte: hoy } },
        ],
    }).select('_id');
    if (!activeSlot) return { resumed: 0, skipped: 0, motivo: 'sin_grilla_vigente' };

    const cat = await Category.findById(categoriaId).populate('disciplina', 'planDefault');
    if (!cat) return { resumed: 0, skipped: 0, motivo: 'sin_categoria' };
    const planId = defaultPlanIdForCategory(cat);

    const enrollments = await Enrollment.find({
        categoria: categoriaId,
        estado: 'activo',
    });

    let resumed = 0;
    let skipped = 0;
    for (const enr of enrollments) {
        if (enr.esFacturacion && enr.plan) {
            skipped += 1;
            continue;
        }
        try {
            await setEnrollmentAsDisciplineBilling(models, enr, planId);
            resumed += 1;
        } catch (e) {
            console.warn('[resumeBillingForCategory]', e.message);
            skipped += 1;
        }
    }

    return { resumed, skipped };
}

/** Cron: categorías con grilla vigente hoy y atletas sin facturar → reanudar. */
export async function resumeBillingForActiveSchedules(models) {
    const { Schedule } = models;
    const hoy = startOfTodayUtc();
    const catIds = await Schedule.distinct('categoria', {
        vigenteHasta: { $gte: hoy },
        $or: [
            { vigenteDesde: null },
            { vigenteDesde: { $exists: false } },
            { vigenteDesde: { $lte: hoy } },
        ],
    });

    let resumed = 0;
    for (const categoriaId of catIds) {
        const r = await resumeBillingForCategory(models, categoriaId);
        resumed += r.resumed || 0;
    }
    return { categorias: catIds.length, resumed };
}
