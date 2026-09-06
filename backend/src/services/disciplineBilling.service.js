/**
 * Una cuota de entrenamiento por atleta y disciplina.
 * El plantel puede tener varias categorías; solo una inscripción factura (esFacturacion).
 */

function idOf(ref) {
    if (!ref) return null;
    return ref._id || ref.id || ref;
}

export function defaultPlanIdForCategory(category) {
    const fromCat = idOf(category?.planDefault);
    if (fromCat) return fromCat;
    return idOf(category?.disciplina?.planDefault) || null;
}

export async function listActiveEnrollmentsInDiscipline(
    models,
    atletaId,
    disciplinaId,
    excludeEnrollmentId = null,
) {
    const { Enrollment, Category } = models;
    if (!disciplinaId) return [];

    const cats = await Category.find({ disciplina: disciplinaId }).select('_id').lean();
    const catIds = cats.map((c) => c._id);
    if (!catIds.length) return [];

    const q = {
        atleta: atletaId,
        estado: 'activo',
        categoria: { $in: catIds },
    };
    if (excludeEnrollmentId) q._id = { $ne: excludeEnrollmentId };

    return Enrollment.find(q)
        .populate('plan', 'nombre monto diaVencimiento')
        .populate({
            path: 'categoria',
            select: 'nombre disciplina planDefault',
            populate: { path: 'disciplina', select: 'nombre planDefault' },
        });
}

/** Inscripción que factura la disciplina (flag o legado: primera con plan). */
export async function findBillingEnrollment(
    models,
    atletaId,
    disciplinaId,
    excludeEnrollmentId = null,
) {
    const list = await listActiveEnrollmentsInDiscipline(
        models,
        atletaId,
        disciplinaId,
        excludeEnrollmentId,
    );
    const marked = list.find((e) => e.esFacturacion === true);
    if (marked) return marked;
    return list.find((e) => e.plan) || null;
}

async function planSummary(models, planId) {
    if (!planId) return null;
    const { Plan } = models;
    if (!Plan) {
        return { _id: planId };
    }
    const plan = await Plan.findById(planId).select('nombre monto').lean();
    if (!plan) return { _id: planId };
    return { _id: plan._id, nombre: plan.nombre, monto: plan.monto };
}

/**
 * Campos de facturación al crear/reactivar una inscripción.
 * @param {'keep'|'switch'|undefined} preferencia
 * @param {boolean} autoKeepOnConflict — plantel/solicitudes sin UI
 */
export async function resolveNewEnrollmentBilling(
    models,
    { atletaId, category, preferencia, autoKeepOnConflict = false },
) {
    const disciplinaId = idOf(category?.disciplina);
    const planAuto = defaultPlanIdForCategory(category);

    if (!disciplinaId) {
        return {
            esFacturacion: Boolean(planAuto),
            plan: planAuto || undefined,
            billingConflict: null,
            previousBillingId: null,
        };
    }

    const existing = await findBillingEnrollment(models, atletaId, disciplinaId);
    if (!existing) {
        return {
            esFacturacion: Boolean(planAuto),
            plan: planAuto || undefined,
            billingConflict: null,
            previousBillingId: null,
        };
    }

    const existingPlanId = String(idOf(existing.plan) || '');
    const newPlanId = String(planAuto || '');

    // Misma cuota o la categoría no trae plan: no duplicar ni preguntar
    if (!planAuto || (existingPlanId && newPlanId && existingPlanId === newPlanId)) {
        return {
            esFacturacion: false,
            plan: undefined,
            billingConflict: null,
            previousBillingId: null,
        };
    }

    const effective =
        preferencia === 'keep' || preferencia === 'switch'
            ? preferencia
            : autoKeepOnConflict
              ? 'keep'
              : undefined;

    if (effective === 'keep') {
        return {
            esFacturacion: false,
            plan: undefined,
            billingConflict: null,
            previousBillingId: null,
        };
    }

    if (effective === 'switch') {
        return {
            esFacturacion: true,
            plan: planAuto,
            billingConflict: null,
            previousBillingId: existing._id,
        };
    }

    const proposedPlan = await planSummary(models, planAuto);
    return {
        esFacturacion: false,
        plan: undefined,
        previousBillingId: null,
        billingConflict: {
            code: 'DISCIPLINE_BILLING_CHOICE',
            message:
                'El atleta ya tiene cuota de entrenamiento en esta disciplina. Elegí si mantener la actual o usar el plan de esta categoría.',
            disciplina: {
                _id: disciplinaId,
                nombre: category.disciplina?.nombre,
            },
            current: {
                enrollmentId: existing._id,
                categoria: {
                    _id: idOf(existing.categoria),
                    nombre: existing.categoria?.nombre,
                },
                plan: existing.plan
                    ? {
                          _id: idOf(existing.plan),
                          nombre: existing.plan.nombre,
                          monto: existing.plan.monto,
                      }
                    : null,
            },
            proposed: {
                categoria: { _id: category._id, nombre: category.nombre },
                plan: proposedPlan,
            },
        },
    };
}

/** Deja de facturar una inscripción (sigue en plantel). */
export async function clearEnrollmentBilling(enrollment) {
    enrollment.esFacturacion = false;
    enrollment.plan = null;
    await enrollment.save();
    return enrollment;
}

/**
 * Marca esta inscripción como la única que factura la disciplina.
 * Limpia plan/flag en hermanas de la misma disciplina.
 */
export async function setEnrollmentAsDisciplineBilling(models, enrollment, planId) {
    const { Category } = models;
    const cat = await Category.findById(enrollment.categoria).populate(
        'disciplina',
        'nombre planDefault',
    );
    if (!cat) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }

    const disciplinaId = idOf(cat.disciplina);
    const siblings = await listActiveEnrollmentsInDiscipline(
        models,
        enrollment.atleta,
        disciplinaId,
        enrollment._id,
    );

    for (const sibling of siblings) {
        if (sibling.esFacturacion || sibling.plan) {
            sibling.esFacturacion = false;
            sibling.plan = null;
            await sibling.save();
        }
    }

    enrollment.esFacturacion = true;
    if (planId !== undefined) {
        enrollment.plan = planId || null;
    } else if (!enrollment.plan) {
        enrollment.plan = defaultPlanIdForCategory(cat) || null;
    }
    await enrollment.save();
    return enrollment;
}

/**
 * Pasa la facturación a otra inscripción activa de la misma disciplina
 * (baja de plantel o quitar plan de la que facturaba).
 */
export async function promoteBillingToSibling(
    models,
    { atletaId, categoriaId, excludeEnrollmentId },
) {
    const { Category } = models;
    const cat = await Category.findById(categoriaId).populate('disciplina', 'planDefault');
    const disciplinaId = idOf(cat?.disciplina);
    if (!disciplinaId) return null;

    const siblings = await listActiveEnrollmentsInDiscipline(
        models,
        atletaId,
        disciplinaId,
        excludeEnrollmentId,
    );
    if (!siblings.length) return null;

    const next = siblings[0];
    const nextCat = await Category.findById(next.categoria).populate('disciplina', 'planDefault');
    const plan = defaultPlanIdForCategory(nextCat);
    return setEnrollmentAsDisciplineBilling(models, next, plan);
}

/** Compat: tras dar de baja la inscripción que facturaba. */
export async function promoteBillingAfterUnenroll(models, inactiveEnrollment) {
    return promoteBillingToSibling(models, {
        atletaId: inactiveEnrollment.atleta,
        categoriaId: inactiveEnrollment.categoria,
        excludeEnrollmentId: inactiveEnrollment._id,
    });
}

/**
 * Legado / inconsistencias: como máximo una inscripción con plan+esFacturacion por atleta/disciplina.
 */
export async function reconcileDisciplineBillingFlags(models) {
    const { Enrollment, Category } = models;

    const activos = await Enrollment.find({ estado: 'activo' })
        .select('_id atleta categoria plan esFacturacion')
        .lean();
    if (!activos.length) return { groups: 0, fixed: 0 };

    const catIds = [...new Set(activos.map((e) => String(e.categoria)))];
    const cats = await Category.find({ _id: { $in: catIds } })
        .select('_id disciplina')
        .lean();
    const discByCat = new Map(cats.map((c) => [String(c._id), String(c.disciplina || '')]));

    const groups = new Map();
    for (const e of activos) {
        const disc = discByCat.get(String(e.categoria));
        if (!disc) continue;
        const key = `${e.atleta}:${disc}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }

    let fixed = 0;
    for (const list of groups.values()) {
        const marked = list.filter((e) => e.esFacturacion === true);
        const withPlan = list.filter((e) => e.plan);

        let keeperId = null;
        if (marked.length === 1) {
            keeperId = String(marked[0]._id);
        } else if (marked.length > 1) {
            keeperId = String(marked[0]._id);
        } else if (withPlan.length >= 1) {
            keeperId = String(withPlan[0]._id);
        } else {
            continue;
        }

        for (const e of list) {
            const shouldBill = String(e._id) === keeperId;
            const wantPlan = shouldBill ? e.plan : null;
            const wantFlag = shouldBill;
            if (Boolean(e.esFacturacion) !== wantFlag || String(e.plan || '') !== String(wantPlan || '')) {
                await Enrollment.updateOne(
                    { _id: e._id },
                    {
                        $set: {
                            esFacturacion: wantFlag,
                            ...(shouldBill ? {} : { plan: null }),
                        },
                    },
                );
                fixed += 1;
            }
        }
    }

    return { groups: groups.size, fixed };
}

/** Cuota de entrenamiento ya generada en el mes para esa disciplina (cualquier categoría). */
export async function findTrainingPaymentInDiscipline(
    models,
    atletaId,
    disciplinaId,
    mes,
    anio,
) {
    const { Payment, Category } = models;
    if (!disciplinaId) return null;

    const cats = await Category.find({ disciplina: disciplinaId }).select('_id').lean();
    const catIds = cats.map((c) => c._id);
    if (!catIds.length) return null;

    return Payment.findOne({
        atleta: atletaId,
        mes,
        anio,
        categoria: { $in: catIds },
        $or: [{ tipo: 'entrenamiento' }, { tipo: { $exists: false } }, { tipo: null }],
    });
}
