/**
 * Asegura que planDefault venga como { _id, nombre, monto } en respuestas
 * de disciplinas/categorías (el frontend lee item.planDefault?.nombre).
 */
export async function hydratePlanDefault(models, docs) {
    if (!docs) return docs;
    const { Plan } = models;
    if (!Plan) return docs;

    const list = Array.isArray(docs) ? docs : [docs];
    const needIds = [];

    for (const doc of list) {
        if (!doc) continue;
        const raw = doc.planDefault;
        if (!raw) continue;
        // Ya viene populado con nombre usable
        if (typeof raw === 'object' && raw.nombre) continue;
        const id = String(raw._id || raw);
        if (id && id !== 'null' && id !== 'undefined') needIds.push(id);
    }

    if (!needIds.length) return docs;

    const plans = await Plan.find({ _id: { $in: [...new Set(needIds)] } })
        .select('nombre monto')
        .lean();
    const byId = new Map(plans.map((p) => [String(p._id), p]));

    for (const doc of list) {
        if (!doc) continue;
        const raw = doc.planDefault;
        if (!raw) continue;
        if (typeof raw === 'object' && raw.nombre) continue;
        const id = String(raw._id || raw);
        const plan = byId.get(id);
        doc.planDefault = plan
            ? { _id: plan._id, nombre: plan.nombre, monto: plan.monto }
            : null;
    }

    return docs;
}

/** Convierte un doc Mongoose a objeto plano y hidrata planDefault. */
export async function toPlainWithPlan(models, doc) {
    if (!doc) return doc;
    const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    await hydratePlanDefault(models, plain);
    return plain;
}

/**
 * Para categorías: si no tienen plan propio, mostrar el de la disciplina
 * (misma regla que la facturación al inscribir).
 */
export async function hydrateCategoryPlans(models, categories, disciplineIdHint = null) {
    if (!categories) return categories;
    const list = Array.isArray(categories) ? categories : [categories];
    await hydratePlanDefault(models, list);

    const { Discipline } = models;
    if (!Discipline) return categories;

    const needDiscIds = new Set();
    for (const cat of list) {
        if (!cat || cat.planDefault?.nombre) continue;
        const did = String(cat.disciplina?._id || cat.disciplina || disciplineIdHint || '');
        if (did && did !== 'null' && did !== 'undefined') needDiscIds.add(did);
    }

    if (!needDiscIds.size) return categories;

    const discs = await Discipline.find({ _id: { $in: [...needDiscIds] } })
        .select('planDefault')
        .lean();
    await hydratePlanDefault(models, discs);
    const planByDisc = new Map(
        discs.map((d) => [String(d._id), d.planDefault?.nombre ? d.planDefault : null]),
    );

    for (const cat of list) {
        if (!cat || cat.planDefault?.nombre) continue;
        const did = String(cat.disciplina?._id || cat.disciplina || disciplineIdHint || '');
        const inherited = planByDisc.get(did);
        if (inherited) {
            cat.planDefault = {
                _id: inherited._id,
                nombre: inherited.nombre,
                monto: inherited.monto,
            };
        }
    }

    return categories;
}
