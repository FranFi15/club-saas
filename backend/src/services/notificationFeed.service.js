import { hijosDelTutorFilter } from '../utils/userQuery.js';
import { atletaCuotasEnApp } from '../utils/ageHelper.js';

const CUOTA_NOTIFICATION_TIPOS = new Set(['cuota_vencida', 'cuota_proxima', 'pago_registrado']);

export async function buildNewsFeedOrConditions(user, models) {
    const { Enrollment, User } = models;
    const userId = user._id;
    const userRole = user.rol;

    let misCategoriasIds = [];
    let targetUsuarioIds = [userId];

    if (userRole === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(userId)).select('_id');
        const hijosIds = hijos.map((h) => h._id);
        targetUsuarioIds = [userId, ...hijosIds];
        const inscripcionesHijos = await Enrollment.find({ atleta: { $in: hijosIds }, estado: 'activo' });
        misCategoriasIds = inscripcionesHijos.map((insc) => insc.categoria);
    } else if (userRole === 'atleta') {
        const misInscripciones = await Enrollment.find({ atleta: userId, estado: 'activo' });
        misCategoriasIds = misInscripciones.map((insc) => insc.categoria);
    }

    return {
        $or: [
            { alcance: 'global' },
            { alcance: 'rol', targetRoles: userRole },
            { alcance: 'categoria', targetCategorias: { $in: misCategoriasIds } },
            { alcance: 'usuario', targetUsuarios: { $in: targetUsuarioIds } },
            { alcance: 'tutor', targetUsuarios: { $in: targetUsuarioIds } },
        ],
    };
}

function newsIsRead(createdAt, lastSeenNewsAt) {
    if (!lastSeenNewsAt) return false;
    return new Date(createdAt) <= new Date(lastSeenNewsAt);
}

function resourceIsRead(createdAt, lastSeenResourcesAt) {
    if (!lastSeenResourcesAt) return false;
    return new Date(createdAt) <= new Date(lastSeenResourcesAt);
}

async function listNewsFeedItems(user, models, limit = 20) {
    const { News } = models;
    const feedFilter = await buildNewsFeedOrConditions(user, models);
    const hasOr = feedFilter?.$or?.length;
    if (!hasOr) return [];

    const items = await News.find(feedFilter).sort({ createdAt: -1 }).limit(limit).lean();
    const since = user.lastSeenNewsAt;

    return items.map((n) => ({
        id: `news:${n._id}`,
        source: 'feed',
        tipo: 'noticia',
        titulo: n.titulo || 'Novedad',
        mensaje: (n.contenido || '').trim().slice(0, 220) || 'Hay un nuevo aviso en el club.',
        createdAt: n.createdAt,
        leida: newsIsRead(n.createdAt, since),
        referencia: n._id,
    }));
}

export async function resourceVisibilityFilter(atletaId, models) {
    const { Enrollment } = models;
    const inscripciones = await Enrollment.find({ atleta: atletaId, estado: 'activo' });
    const categoriasIds = inscripciones.map((i) => i.categoria);
    return {
        $or: [
            { alcance: 'global' },
            { alcance: 'categoria', targetCategoria: { $in: categoriasIds } },
            { alcance: 'usuario', targetUsuario: atletaId },
        ],
    };
}

function parseResourceFeedId(itemId) {
    if (!itemId.startsWith('resource:')) return null;
    const rest = itemId.slice(9);
    const [resId] = rest.split(':');
    return resId || null;
}

async function listResourceFeedItems(user, models, limit = 20) {
    const { Resource, User } = models;
    const since = user.lastSeenResourcesAt;
    const out = [];

    const pushResources = async (atletaId, labelPrefix) => {
        const vis = await resourceVisibilityFilter(atletaId, models);
        const list = await Resource.find(vis).sort({ createdAt: -1 }).limit(limit).lean();
        for (const r of list) {
            const prefix = labelPrefix ? `${labelPrefix}: ` : '';
            out.push({
                id: labelPrefix ? `resource:${r._id}:${atletaId}` : `resource:${r._id}`,
                source: 'feed',
                tipo: 'recurso',
                titulo: r.titulo || 'Nuevo recurso',
                mensaje:
                    prefix +
                    ((r.descripcion || '').trim().slice(0, 180) ||
                        'Hay material nuevo disponible para vos.'),
                createdAt: r.createdAt,
                leida: resourceIsRead(r.createdAt, since),
                referencia: r._id,
                atletaId: labelPrefix ? atletaId : undefined,
            });
        }
    };

    if (user.rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id))
            .select('nombre apellido')
            .lean();
        for (const h of hijos) {
            await pushResources(h._id, `${h.nombre} ${h.apellido}`.trim());
        }
    } else if (user.rol === 'atleta') {
        await pushResources(user._id, null);
    }

    return out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}

async function listDocsForAtleta(atletaId, atletaLabel, models) {
    const { Requirement, Enrollment, Submission } = models;
    const inscripciones = await Enrollment.find({ atleta: atletaId, estado: 'activo' });
    const catIds = inscripciones.map((i) => i.categoria);

    const reqs = await Requirement.find({
        activo: true,
        $or: [
            { alcance: 'global' },
            { alcance: 'categoria', targetCategoria: { $in: catIds } },
            { alcance: 'usuario', targetUsuario: atletaId },
        ],
    })
        .sort({ createdAt: -1 })
        .lean();

    if (!reqs.length) return [];

    const reqIds = reqs.map((r) => r._id);
    const subs = await Submission.find({
        atleta: atletaId,
        requerimiento: { $in: reqIds },
    }).lean();
    const subByReq = new Map(subs.map((s) => [String(s.requerimiento), s]));

    const items = [];
    for (const r of reqs) {
        const sub = subByReq.get(String(r._id));
        const pendiente = !sub || sub.estado === 'rechazado';
        if (!pendiente) continue;

        let estadoTxt = 'Tenés que subir este archivo.';
        if (sub?.estado === 'rechazado') {
            estadoTxt = sub.motivoRechazo
                ? `Rechazado: ${sub.motivoRechazo}`
                : 'Rechazado: volvé a subir el archivo.';
        }
        if (r.fechaVencimiento) {
            const vence = new Date(r.fechaVencimiento).toLocaleDateString('es-AR');
            estadoTxt += ` Vence ${vence}.`;
        }

        const prefix = atletaLabel ? `${atletaLabel} · ` : '';
        items.push({
            id: `doc:${r._id}:${atletaId}`,
            source: 'feed',
            tipo: 'documentacion',
            titulo: r.titulo,
            mensaje: prefix + estadoTxt,
            createdAt: r.createdAt,
            leida: false,
            referencia: r._id,
            atletaId,
        });
    }
    return items;
}

async function listDocumentacionFeedItems(user, models) {
    const { User } = models;
    if (user.rol === 'atleta') {
        return listDocsForAtleta(user._id, null, models);
    }
    if (user.rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id))
            .select('nombre apellido')
            .lean();
        const all = [];
        for (const h of hijos) {
            const label = `${h.nombre || ''} ${h.apellido || ''}`.trim();
            all.push(...(await listDocsForAtleta(h._id, label, models)));
        }
        return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return [];
}

/** Oculta avisos de cuotas si el atleta vinculado no tiene cuotas en la app. */
async function filterCuotaNotificationsForUser(user, dbItems, models) {
    const cuotaItems = dbItems.filter((n) => CUOTA_NOTIFICATION_TIPOS.has(n.tipo));
    if (!cuotaItems.length) return dbItems;

    if (user.rol === 'atleta' && !atletaCuotasEnApp(user)) {
        return dbItems.filter((n) => !CUOTA_NOTIFICATION_TIPOS.has(n.tipo));
    }

    const { Payment, User: UserModel } = models;
    const refIds = [...new Set(cuotaItems.map((n) => n.referencia).filter(Boolean))];
    if (!refIds.length) {
        return dbItems.filter((n) => !CUOTA_NOTIFICATION_TIPOS.has(n.tipo) || atletaCuotasEnApp(user));
    }

    const payments = await Payment.find({ _id: { $in: refIds } }).select('atleta').lean();
    const paymentToAtleta = new Map(payments.map((p) => [String(p._id), String(p.atleta)]));

    const atletaIds = [...new Set(payments.map((p) => p.atleta).filter(Boolean))];
    const atletas = atletaIds.length
        ? await UserModel.find({ _id: { $in: atletaIds } }).select('cuotasEnApp rol').lean()
        : [];
    const atletaById = new Map(atletas.map((a) => [String(a._id), a]));

    return dbItems.filter((n) => {
        if (!CUOTA_NOTIFICATION_TIPOS.has(n.tipo)) return true;
        const atletaId = paymentToAtleta.get(String(n.referencia));
        if (!atletaId) {
            return user.rol !== 'atleta' || atletaCuotasEnApp(user);
        }
        const atleta = atletaById.get(atletaId);
        return atleta ? atletaCuotasEnApp(atleta) : true;
    });
}

/** Oculta avisos de consulta pendiente si la sesión ya fue confirmada o rechazada. */
async function filterAnsweredConsultPendingNotifications(mappedDb, models) {
    const refs = [
        ...new Set(
            mappedDb
                .filter((n) => n.tipo === 'consulta_pendiente' && n.referencia)
                .map((n) => String(n.referencia)),
        ),
    ];
    if (!refs.length) return mappedDb;

    const { Session } = models;
    const sessions = await Session.find({ _id: { $in: refs } })
        .select('confirmacionAtleta.estado')
        .lean();
    const answeredIds = new Set(
        sessions
            .filter((s) => {
                const st = s.confirmacionAtleta?.estado;
                return st && st !== 'pendiente';
            })
            .map((s) => String(s._id)),
    );
    if (!answeredIds.size) return mappedDb;

    return mappedDb.filter((n) => {
        if (n.tipo !== 'consulta_pendiente' || !n.referencia) return true;
        return !answeredIds.has(String(n.referencia));
    });
}

const DISMISSED_IDS_CAP = 500;

function dismissedIdSet(user) {
    return new Set(user.dismissedNotificationIds || []);
}

async function addDismissedIds(user, ids, models) {
    const { User } = models;
    const merged = new Set([...(user.dismissedNotificationIds || []), ...ids]);
    const list = [...merged];
    user.dismissedNotificationIds =
        list.length > DISMISSED_IDS_CAP ? list.slice(-DISMISSED_IDS_CAP) : list;
    await user.save();
    return user;
}

/** Feed unificado para el modal de notificaciones. */
export async function buildUnifiedNotificationFeed(user, models, { limit = 50 } = {}) {
    const { Notification } = models;
    const userId = user._id;

    const dbItems = await Notification.find({ usuario: userId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

    let mappedDb = dbItems.map((n) => ({
        id: String(n._id),
        source: 'db',
        tipo: n.tipo || 'general',
        titulo: n.titulo,
        mensaje: n.mensaje,
        createdAt: n.createdAt,
        leida: !!n.leida,
        referencia: n.referencia,
    }));

    mappedDb = await filterCuotaNotificationsForUser(user, mappedDb, models);
    mappedDb = await filterAnsweredConsultPendingNotifications(mappedDb, models);

    const feedItems = [...mappedDb];

    const newsItems = await listNewsFeedItems(user, models, 15);
    feedItems.push(...newsItems);

    const docItems = await listDocumentacionFeedItems(user, models);
    feedItems.push(...docItems);

    const resourceItems = await listResourceFeedItems(user, models, 15);
    feedItems.push(...resourceItems);

    feedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const dismissed = dismissedIdSet(user);
    const seenIds = new Set();
    const visible = [];
    for (const item of feedItems) {
        if (dismissed.has(item.id) || seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        visible.push(item);
    }

    return visible.slice(0, limit);
}

export async function countUnifiedUnread(user, models) {
    const feed = await buildUnifiedNotificationFeed(user, models, { limit: 80 });
    return feed.filter((i) => !i.leida).length;
}

export async function markFeedItemRead(userId, itemId, models) {
    const { Notification, User, News, Resource } = models;
    const user = await User.findById(userId);
    if (!user) return null;

    if (itemId.startsWith('news:')) {
        const newsId = itemId.slice(5);
        const noticia = await News.findById(newsId).select('createdAt').lean();
        if (!noticia) return null;
        const t = new Date(noticia.createdAt);
        if (!user.lastSeenNewsAt || t > user.lastSeenNewsAt) {
            user.lastSeenNewsAt = t;
            await user.save();
        }
        return { ok: true };
    }

    if (itemId.startsWith('resource:')) {
        const resId = parseResourceFeedId(itemId);
        if (!resId) return null;
        const recurso = await Resource.findById(resId).select('createdAt').lean();
        if (!recurso) return null;
        const t = new Date(recurso.createdAt);
        if (!user.lastSeenResourcesAt || t > user.lastSeenResourcesAt) {
            user.lastSeenResourcesAt = t;
            await user.save();
        }
        return { ok: true };
    }

    if (itemId.startsWith('doc:')) {
        return { ok: false, reason: 'doc_pending' };
    }

    const notification = await Notification.findOneAndUpdate(
        { _id: itemId, usuario: userId },
        { leida: true },
        { returnDocument: 'after' },
    );
    return notification ? { ok: true, notification } : null;
}

export async function markAllFeedRead(userId, models) {
    const { Notification, User } = models;
    const now = new Date();

    await Notification.updateMany({ usuario: userId, leida: false }, { leida: true });

    const user = await User.findById(userId);
    if (user) {
        user.lastSeenNewsAt = now;
        user.lastSeenResourcesAt = now;
        await user.save();
    }

    return now;
}

/** Elimina u oculta un ítem del feed (DB → borrar; feed → dismissed). */
export async function dismissFeedItem(userId, itemId, models) {
    const { Notification, User, News, Resource } = models;
    const user = await User.findById(userId);
    if (!user) return null;

    const isFeedId =
        itemId.startsWith('news:') ||
        itemId.startsWith('resource:') ||
        itemId.startsWith('doc:');

    if (!isFeedId) {
        const notification = await Notification.findOneAndDelete({
            _id: itemId,
            usuario: userId,
        });
        return notification ? { ok: true, kind: 'db' } : null;
    }

    const dismissed = dismissedIdSet(user);
    if (!dismissed.has(itemId)) {
        if (itemId.startsWith('news:')) {
            const noticia = await News.findById(itemId.slice(5)).select('createdAt').lean();
            if (noticia) {
                const t = new Date(noticia.createdAt);
                if (!user.lastSeenNewsAt || t > user.lastSeenNewsAt) {
                    user.lastSeenNewsAt = t;
                }
            }
        } else if (itemId.startsWith('resource:')) {
            const resId = parseResourceFeedId(itemId);
            const recurso = resId ? await Resource.findById(resId).select('createdAt').lean() : null;
            if (recurso) {
                const t = new Date(recurso.createdAt);
                if (!user.lastSeenResourcesAt || t > user.lastSeenResourcesAt) {
                    user.lastSeenResourcesAt = t;
                }
            }
        }
        await addDismissedIds(user, [itemId], models);
    }

    return { ok: true, kind: 'feed' };
}

/** Elimina todas las notificaciones DB y oculta los ítems del feed visibles. */
export async function dismissAllFeedItems(userId, models) {
    const { Notification, User } = models;
    const user = await User.findById(userId);
    if (!user) return null;

    const visibleFeed = await buildUnifiedNotificationFeed(user, models, { limit: 200 });
    const feedIds = visibleFeed.filter((item) => item.source === 'feed').map((item) => item.id);

    await Notification.deleteMany({ usuario: userId });
    await markAllFeedRead(userId, models);

    const refreshed = await User.findById(userId);
    if (refreshed && feedIds.length) {
        await addDismissedIds(refreshed, feedIds, models);
    }

    return { ok: true };
}
