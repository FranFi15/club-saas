import { listRosterPendingForCoach } from './categoryRoster.service.js';

async function getStaffCategoryIds(userId, rol, Category) {
    let query;
    if (rol === 'profe') query = { profesores: userId };
    else if (rol === 'preparador_fisico') query = { preparadoresFisicos: userId };
    else if (rol === 'nutricionista') query = { nutricionistas: userId };
    else if (rol === 'psicologo') query = { psicologos: userId };
    else return [];

    const cats = await Category.find(query).select('_id').lean();
    return cats.map((c) => c._id);
}

/**
 * Contadores de pendientes por categoría (plantel, docs en revisión, intercambios).
 * Alineado con el badge del tab Equipo del coach.
 */
export async function getCoachCategoryAlertCounts(user, models) {
    const { Category, Enrollment, Submission, Requirement, SwapRequest, Session } = models;
    const staffRoles = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
    if (!staffRoles.includes(user.rol)) return {};

    const catIds = await getStaffCategoryIds(user._id, user.rol, Category);
    const alerts = Object.fromEntries(catIds.map((id) => [String(id), 0]));
    if (!catIds.length) return alerts;

    if (['profe', 'preparador_fisico'].includes(user.rol)) {
        const pending = await listRosterPendingForCoach(models, user._id, user.rol);
        for (const p of pending) {
            const key = String(p._id);
            if (alerts[key] !== undefined) alerts[key] += 1;
        }
    }

    const reqIds = await Requirement.find({ activo: true, creadoPor: user._id }).distinct('_id');
    if (reqIds.length) {
        const enrollments = await Enrollment.find({
            categoria: { $in: catIds },
            estado: 'activo',
        })
            .select('atleta categoria')
            .lean();

        const atletaCats = new Map();
        for (const e of enrollments) {
            const aid = String(e.atleta);
            if (!atletaCats.has(aid)) atletaCats.set(aid, new Set());
            atletaCats.get(aid).add(String(e.categoria));
        }

        const atletaIds = [...atletaCats.keys()];
        if (atletaIds.length) {
            const subs = await Submission.find({
                requerimiento: { $in: reqIds },
                estado: 'revision',
                atleta: { $in: atletaIds },
            })
                .select('atleta')
                .lean();

            for (const s of subs) {
                const catSet = atletaCats.get(String(s.atleta));
                if (!catSet) continue;
                for (const cid of catSet) {
                    if (alerts[cid] !== undefined) alerts[cid] += 1;
                }
            }
        }
    }

    if (user.rol === 'profe') {
        const swaps = await SwapRequest.find({ estado: 'pendiente' })
            .select('sesionDestino solicitante')
            .lean();
        if (swaps.length) {
            const sessionIds = [...new Set(swaps.map((s) => String(s.sesionDestino)))];
            const sessions = await Session.find({ _id: { $in: sessionIds } })
                .select('categoria')
                .lean();
            const sessionCat = new Map(sessions.map((s) => [String(s._id), String(s.categoria)]));

            const profCats = await Category.find({ profesores: user._id }).select('_id').lean();
            const profCatSet = new Set(profCats.map((c) => String(c._id)));

            for (const sw of swaps) {
                if (String(sw.solicitante) === String(user._id)) continue;
                const cid = sessionCat.get(String(sw.sesionDestino));
                if (cid && profCatSet.has(cid) && alerts[cid] !== undefined) {
                    alerts[cid] += 1;
                }
            }
        }
    }

    return alerts;
}
