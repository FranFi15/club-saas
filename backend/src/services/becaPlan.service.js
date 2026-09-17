/**
 * Plan "Beca": atletas con este plan no generan cuotas de entrenamiento
 * y no aparecen en el listado de Finanzas (pagos ligados al plan).
 */
export const BECA_PLAN_NOMBRE = 'Beca';

export function isBecaPlan(plan) {
    if (!plan) return false;
    if (typeof plan === 'object') return plan.esBeca === true;
    return false;
}

/** Crea o reutiliza el plan Beca del tenant (idempotente). */
export async function ensureBecaPlan(models) {
    const { Plan } = models;
    if (!Plan) return null;

    let plan = await Plan.findOne({ esBeca: true }).sort({ activo: -1, createdAt: 1 });
    if (plan) {
        let dirty = false;
        if (!plan.activo) {
            plan.activo = true;
            dirty = true;
        }
        if (plan.monto !== 0) {
            plan.monto = 0;
            dirty = true;
        }
        if (dirty) await plan.save();
        return plan;
    }

    plan = await Plan.findOne({ nombre: new RegExp(`^${BECA_PLAN_NOMBRE}$`, 'i') });
    if (plan) {
        plan.esBeca = true;
        plan.monto = 0;
        plan.activo = true;
        if (!plan.descripcion) {
            plan.descripcion = 'Atleta becado: no genera cuotas ni figura en Finanzas.';
        }
        await plan.save();
        return plan;
    }

    return Plan.create({
        nombre: BECA_PLAN_NOMBRE,
        monto: 0,
        descripcion: 'Atleta becado: no genera cuotas ni figura en Finanzas.',
        diaVencimiento: 10,
        porcentajeRecargo: 0,
        esBeca: true,
        activo: true,
    });
}

/** IDs de planes marcados como beca (para excluir de listados). */
export async function getBecaPlanIds(models) {
    const { Plan } = models;
    if (!Plan) return [];
    return Plan.find({ esBeca: true }).distinct('_id');
}

/**
 * Borra cuotas de entrenamiento abiertas ligadas a un plan/inscripción beca.
 * No toca pagos ya pagados (historial).
 * Preferí categoría (cubre cambio de plan); si no, planId.
 */
export async function removeOpenTrainingPaymentsForBeca(models, { atletaId, planId, categoriaId } = {}) {
    const { Payment } = models;
    if (!atletaId) return { deleted: 0 };

    const filter = {
        atleta: atletaId,
        estado: { $in: ['pendiente', 'vencido', 'en_revision'] },
        $or: [{ tipo: 'entrenamiento' }, { tipo: { $exists: false } }, { tipo: null }],
    };
    if (categoriaId) filter.categoria = categoriaId;
    else if (planId) filter.plan = planId;
    else return { deleted: 0 };

    const result = await Payment.deleteMany(filter);
    return { deleted: result.deletedCount || 0 };
}

/** Filtro Mongo para excluir pagos de planes beca del listado de Finanzas. */
export function excludeBecaPaymentsFilter(becaPlanIds) {
    if (!becaPlanIds?.length) return null;
    return {
        $or: [
            { plan: { $exists: false } },
            { plan: null },
            { plan: { $nin: becaPlanIds } },
            { tipo: 'social' },
        ],
    };
}
