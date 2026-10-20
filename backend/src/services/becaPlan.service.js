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

function idOf(ref) {
    if (!ref) return null;
    return ref._id || ref.id || ref;
}

/**
 * Si el atleta está marcado como becado, la inscripción que factura usa el plan Beca
 * en lugar del plan de la categoría. Si ya factura con Beca, la nueva no duplica cuota.
 */
export async function billingOverrideForBecado(models, user, category, billing) {
    if (!user?.esBecado) return billing;
    const plan = await ensureBecaPlan(models);
    if (!plan) return billing;

    const onTrial = Boolean(user.esPrueba);
    const disciplinaId = idOf(category?.disciplina);
    const atletaId = user._id;

    if (disciplinaId && atletaId) {
        const { findBillingEnrollment } = await import('./disciplineBilling.service.js');
        const existing = await findBillingEnrollment(models, atletaId, disciplinaId);
        if (existing) {
            const existingPlanId = String(idOf(existing.plan) || '');
            if (existingPlanId === String(plan._id)) {
                return {
                    esFacturacion: false,
                    plan: undefined,
                    billingConflict: null,
                    previousBillingId: null,
                };
            }
            return {
                esFacturacion: !onTrial,
                plan: plan._id,
                billingConflict: null,
                previousBillingId: existing._id,
            };
        }
    }

    return {
        esFacturacion: !onTrial,
        plan: plan._id,
        billingConflict: null,
        previousBillingId: billing?.previousBillingId || null,
    };
}

/**
 * Alinea inscripciones activas con el flag esBecado.
 * @returns {{ billableIds: import('mongoose').Types.ObjectId[] }}
 */
export async function syncAthleteBecaFlag(models, user) {
    const { Enrollment, Category, Plan } = models;
    if (!user?._id || !Enrollment) return { billableIds: [] };
    const beca = await ensureBecaPlan(models);
    if (!beca) return { billableIds: [] };

    const activos = await Enrollment.find({ atleta: user._id, estado: 'activo' });
    const billableIds = [];
    if (!activos.length) return { billableIds };

    if (user.esBecado) {
        const cats = await Category.find({ _id: { $in: activos.map((e) => e.categoria) } })
            .select('disciplina')
            .lean();
        const discOf = new Map(cats.map((c) => [String(c._id), String(c.disciplina || c._id)]));
        const groups = new Map();
        for (const enr of activos) {
            const key = discOf.get(String(enr.categoria)) || String(enr._id);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(enr);
        }
        for (const group of groups.values()) {
            const primary = group.find((e) => e.esFacturacion) || group.find((e) => e.plan);
            if (!primary) continue;
            for (const enr of group) {
                if (String(enr._id) === String(primary._id)) {
                    enr.plan = beca._id;
                    enr.esFacturacion = !user.esPrueba;
                } else if (enr.plan || enr.esFacturacion) {
                    enr.plan = null;
                    enr.esFacturacion = false;
                }
                await enr.save();
            }
            await removeOpenTrainingPaymentsForBeca(models, {
                atletaId: user._id,
                planId: beca._id,
                categoriaId: primary.categoria,
            });
        }
        return { billableIds };
    }

    const { defaultPlanIdForCategory } = await import('./disciplineBilling.service.js');
    for (const enr of activos) {
        if (!enr.plan) continue;
        const planDoc = await Plan.findById(enr.plan).select('esBeca').lean();
        if (!planDoc?.esBeca) continue;
        const cat = await Category.findById(enr.categoria).populate('disciplina', 'nombre planDefault');
        const nextPlan = defaultPlanIdForCategory(cat);
        enr.plan = nextPlan || null;
        enr.esFacturacion = Boolean(nextPlan) && !user.esPrueba;
        await enr.save();
        if (enr.esFacturacion && enr.plan) billableIds.push(enr._id);
    }
    return { billableIds };
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
