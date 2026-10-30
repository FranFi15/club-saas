import { createAppNotificationsMany } from './appNotification.service.js';
import { tutorIdsOf } from '../utils/userQuery.js';

/**
 * Resolve who should get a push when a muro noticia is published.
 * Mirrors feed visibility in buildNewsFeedOrConditions (atletas, tutores, staff de categoría, etc.).
 */
export async function resolveNewsRecipientUserIds(models, news, { excludeUserId } = {}) {
    const { User, Enrollment, Category } = models;
    const alcance = news?.alcance;
    const ids = new Set();

    if (alcance === 'global') {
        const users = await User.find({ estado: { $ne: 'inactivo' } }).select('_id').lean();
        users.forEach((u) => ids.add(String(u._id)));
    } else if (alcance === 'rol') {
        const roles = Array.isArray(news.targetRoles) ? news.targetRoles.filter(Boolean) : [];
        if (roles.length) {
            const users = await User.find({
                estado: { $ne: 'inactivo' },
                $or: [{ rol: { $in: roles } }, { roles: { $in: roles } }],
            })
                .select('_id')
                .lean();
            users.forEach((u) => ids.add(String(u._id)));
        }
    } else if (alcance === 'categoria') {
        const catIds = Array.isArray(news.targetCategorias) ? news.targetCategorias : [];
        if (catIds.length) {
            const enrollments = await Enrollment.find({
                categoria: { $in: catIds },
                estado: 'activo',
            })
                .populate('atleta', 'tutorPrincipal tutores estado')
                .lean();

            for (const e of enrollments) {
                const atleta = e.atleta;
                if (!atleta || atleta.estado === 'inactivo') continue;
                ids.add(String(atleta._id));
                for (const tutorId of tutorIdsOf(atleta)) ids.add(tutorId);
            }

            const cats = await Category.find({ _id: { $in: catIds } })
                .select('profesores preparadoresFisicos nutricionistas psicologos')
                .lean();
            for (const c of cats) {
                for (const field of ['profesores', 'preparadoresFisicos', 'nutricionistas', 'psicologos']) {
                    for (const uid of c[field] || []) {
                        ids.add(String(uid));
                    }
                }
            }
        }
    } else if (alcance === 'usuario') {
        const userIds = (Array.isArray(news.targetUsuarios) ? news.targetUsuarios : []).map(String);
        userIds.forEach((id) => ids.add(id));
        if (userIds.length) {
            const athletes = await User.find({ _id: { $in: userIds }, rol: 'atleta' })
                .select('tutorPrincipal tutores')
                .lean();
            for (const a of athletes) {
                for (const tutorId of tutorIdsOf(a)) ids.add(tutorId);
            }
        }
    } else if (alcance === 'tutor') {
        (Array.isArray(news.targetUsuarios) ? news.targetUsuarios : []).forEach((id) =>
            ids.add(String(id)),
        );
    }

    if (excludeUserId) ids.delete(String(excludeUserId));

    const list = [...ids].filter(Boolean);
    if (!list.length) return [];

    const active = await User.find({
        _id: { $in: list },
        estado: { $ne: 'inactivo' },
    })
        .select('_id')
        .lean();

    return active.map((u) => String(u._id));
}

/** In-app + Expo push to everyone targeted by a published muro noticia. */
export async function notifyNewsPublished(models, news, authorId) {
    if (!news?._id) return;
    const recipientIds = await resolveNewsRecipientUserIds(models, news, {
        excludeUserId: authorId,
    });
    if (!recipientIds.length) return;

    const mensaje =
        String(news.contenido || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 180) || 'Hay una nueva noticia en el club.';

    await createAppNotificationsMany(models, recipientIds, {
        tipo: 'noticia',
        titulo: news.titulo || 'Nueva noticia',
        mensaje,
        referencia: news._id,
    });
}
