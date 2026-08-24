import { hijosDelTutorFilter } from '../utils/userQuery.js';
import { atletaCuotasEnApp } from '../utils/ageHelper.js';
import { listRosterPendingForCoach } from './categoryRoster.service.js';
import {
    buildNewsFeedOrConditions,
    resourceVisibilityFilter,
    countUnifiedUnread,
    buildUnifiedNotificationFeed,
} from './notificationFeed.service.js';
import { countUnreadChatForUser } from './chat.service.js';
import { getAdminPendingCounts, sumPendingCounts } from './pendingInbox.service.js';

export async function countDocsPendientesAtleta(atletaId, models) {
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
        .select('_id')
        .lean();

    if (!reqs.length) return 0;

    const reqIds = reqs.map((r) => r._id);
    const subs = await Submission.find({
        atleta: atletaId,
        requerimiento: { $in: reqIds },
    }).lean();
    const subByReq = new Map(subs.map((s) => [String(s.requerimiento), s]));

    return reqs.filter((r) => {
        const sub = subByReq.get(String(r._id));
        return !sub || sub.estado === 'rechazado';
    }).length;
}

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

export async function countUnreadNews(user, models) {
    const { News } = models;
    const since = user.lastSeenNewsAt || new Date(0);
    const feedFilter = await buildNewsFeedOrConditions(user, models);
    return News.countDocuments({
        ...feedFilter,
        createdAt: { $gt: since },
    });
}

export async function countUnreadResources(user, models) {
    const { Resource, User } = models;
    const since = user.lastSeenResourcesAt || new Date(0);

    if (user.rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id)).select('_id').lean();
        if (!hijos.length) return 0;
        let total = 0;
        for (const h of hijos) {
            const vis = await resourceVisibilityFilter(h._id, models);
            total += await Resource.countDocuments({ ...vis, createdAt: { $gt: since } });
        }
        return total;
    }

    if (user.rol !== 'atleta') return 0;

    const vis = await resourceVisibilityFilter(user._id, models);
    return Resource.countDocuments({ ...vis, createdAt: { $gt: since } });
}

export async function countCuotasImpagasAtleta(atletaId, models) {
    const { Payment, User } = models;
    const atleta = await User.findById(atletaId).select('rol cuotasEnApp').lean();
    if (!atleta || atleta.rol !== 'atleta' || !atletaCuotasEnApp(atleta)) return 0;
    return Payment.countDocuments({
        atleta: atletaId,
        estado: { $in: ['pendiente', 'vencido'] },
    });
}

async function countDocsRevisionForUser(user, models) {
    const { Submission, Requirement, Enrollment, Category } = models;
    const isAdmin = ['admin_club', 'administrativo'].includes(user.rol);

    if (isAdmin) {
        return Submission.countDocuments({ estado: 'revision' });
    }

    const staffRoles = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
    if (!staffRoles.includes(user.rol)) return 0;

    const reqIds = await Requirement.find({ activo: true, creadoPor: user._id }).distinct('_id');
    if (!reqIds.length) return 0;

    const catIds = await getStaffCategoryIds(user._id, user.rol, Category);
    if (!catIds.length) return 0;

    const atletaIds = await Enrollment.find({
        categoria: { $in: catIds },
        estado: 'activo',
    }).distinct('atleta');
    if (!atletaIds.length) return 0;

    return Submission.countDocuments({
        atleta: { $in: atletaIds },
        requerimiento: { $in: reqIds },
        estado: 'revision',
    });
}

async function adminBadgeSummary(models, userId) {
    const { Payment } = models;
    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();

    const [finanzasImpagas, pendingCounts] = await Promise.all([
        Payment.countDocuments({
            mes,
            anio,
            estado: { $in: ['pendiente', 'vencido'] },
        }),
        getAdminPendingCounts(models, userId),
    ]);

    const {
        transferenciasRevision: transferenciasRevisionGrupos,
        docsRevision,
        solicitudesInscripcion,
        alquileres: alquileresPendientes,
        chat: chatUnread,
    } = pendingCounts;

    const pendientes = sumPendingCounts(pendingCounts);
    const estructura = solicitudesInscripcion;
    const gestion = alquileresPendientes + docsRevision + chatUnread;
    const finanzas = finanzasImpagas + transferenciasRevisionGrupos;

    return {
        tabs: {
            estructura: estructura > 0 ? estructura : 0,
            gestion: gestion > 0 ? Math.min(99, gestion) : 0,
            finanzas: finanzas > 0 ? finanzas : 0,
            perfil: 0,
        },
        hubs: {
            solicitudesInscripcion,
            finanzasAtletas: finanzasImpagas,
            finanzasRevision: transferenciasRevisionGrupos,
            finanzasFamilias: 0,
            alquileres: alquileresPendientes,
            docsRevision,
            chat: chatUnread > 0 ? Math.min(99, chatUnread) : 0,
            pendientes,
        },
    };
}

async function coachBadgeSummary(user, models) {
    const plantelPendientes = (await listRosterPendingForCoach(models, user._id, user.rol)).length;
    const docsRevision = await countDocsRevisionForUser(user, models);
    const chatUnread = await countUnreadChatForUser(models, user._id);
    const equipo = plantelPendientes + docsRevision;
    const comunicar = chatUnread;

    return {
        tabs: {
            inicio: 0,
            sesiones: 0,
            equipo: equipo > 0 ? equipo : 0,
            comunicar: comunicar > 0 ? Math.min(99, comunicar) : 0,
            perfil: 0,
        },
        hubs: {
            plantelPendientes,
            docsRevision,
            chat: chatUnread > 0 ? Math.min(99, chatUnread) : 0,
        },
    };
}

/** Control de ingreso / colaborador: chat (+ noticias para colaborador). */
async function opsBadgeSummary(user, models) {
    const chatUnread = await countUnreadChatForUser(models, user._id);
    const newsUnread = user.rol === 'colaborador' ? await countUnreadNews(user, models) : 0;
    const chat = chatUnread > 0 ? Math.min(99, chatUnread) : 0;
    const noticias = newsUnread > 0 ? Math.min(99, newsUnread) : 0;

    return {
        tabs: {
            chat,
            noticias,
            comunicar: chat,
        },
        hubs: {
            chat,
            noticias,
        },
    };
}

async function countPendingConsultConfirmations(user, models) {
    const { Session, User } = models;
    const consultTypes = ['consulta_nutricion', 'consulta_psicologia'];
    let atletaIds = [user._id];

    if (user.rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id)).select('_id').lean();
        atletaIds = hijos.map((h) => h._id);
        if (!atletaIds.length) return 0;
    }

    return Session.countDocuments({
        atletaIndividual: { $in: atletaIds },
        tipo: { $in: consultTypes },
        estado: { $ne: 'cancelada' },
        'confirmacionAtleta.estado': 'pendiente',
    });
}

async function countPendingConsultForAtleta(atletaId, models) {
    const { Session } = models;
    return Session.countDocuments({
        atletaIndividual: atletaId,
        tipo: { $in: ['consulta_nutricion', 'consulta_psicologia'] },
        estado: { $ne: 'cancelada' },
        'confirmacionAtleta.estado': 'pendiente',
    });
}

/** Indica si un hijo del tutor tiene avisos pendientes (docs, cuotas, consultas, recursos, feed). */
export async function tutorAthleteHasAlerts(tutorUser, atletaId, models) {
    if ((await countDocsPendientesAtleta(atletaId, models)) > 0) return true;
    if ((await countCuotasImpagasAtleta(atletaId, models)) > 0) return true;
    if ((await countPendingConsultForAtleta(atletaId, models)) > 0) return true;

    const { Resource } = models;
    const since = tutorUser.lastSeenResourcesAt || new Date(0);
    const vis = await resourceVisibilityFilter(atletaId, models);
    if ((await Resource.countDocuments({ ...vis, createdAt: { $gt: since } })) > 0) return true;

    const feed = await buildUnifiedNotificationFeed(tutorUser, models, { limit: 80 });
    for (const item of feed) {
        if (item.leida) continue;
        if (item.atletaId && String(item.atletaId) === String(atletaId)) return true;
        const id = String(item.id || '');
        if (id.endsWith(`:${atletaId}`)) return true;
    }

    return false;
}

async function memberBadgeSummary(user, models) {
    const { User, Payment } = models;
    const rol = user.rol;
    const out = {
        tabs: {
            inicio: 0,
            agenda: 0,
            novedades: 0,
            comunicar: 0,
            cuotas: 0,
            perfil: 0,
        },
        hubs: {
            documentacion: 0,
            recursos: 0,
            novedades: 0,
            chat: 0,
        },
    };

    const newsUnread = await countUnreadNews(user, models);
    const chatUnread = await countUnreadChatForUser(models, user._id);
    out.hubs.novedades = newsUnread;
    out.hubs.chat = chatUnread > 0 ? Math.min(99, chatUnread) : 0;

    if (rol === 'atleta') {
        out.hubs.documentacion = await countDocsPendientesAtleta(user._id, models);
        out.hubs.recursos = await countUnreadResources(user, models);
        if (atletaCuotasEnApp(user)) {
            out.tabs.cuotas = await countCuotasImpagasAtleta(user._id, models);
        }
        const comm = out.hubs.documentacion + out.hubs.recursos + newsUnread + chatUnread;
        out.tabs.comunicar = comm > 0 ? Math.min(99, comm) : 0;
        const pendingConsultas = await countPendingConsultConfirmations(user, models);
        out.tabs.agenda = pendingConsultas > 0 ? Math.min(99, pendingConsultas) : 0;
    } else if (rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id)).lean();
        let docs = 0;
        let cuotas = 0;
        for (const h of hijos) {
            docs += await countDocsPendientesAtleta(h._id, models);
            if (atletaCuotasEnApp(h)) {
                cuotas += await Payment.countDocuments({
                    atleta: h._id,
                    estado: { $in: ['pendiente', 'vencido'] },
                });
            }
        }
        out.hubs.documentacion = docs;
        out.hubs.recursos = await countUnreadResources(user, models);
        out.tabs.inicio = docs + cuotas > 0 ? Math.min(99, docs + cuotas) : 0;
        out.tabs.cuotas = cuotas;
        out.tabs.comunicar = Math.min(99, docs + out.hubs.recursos + chatUnread);
        out.tabs.novedades = newsUnread;
        const pendingConsultas = await countPendingConsultConfirmations(user, models);
        out.tabs.agenda = pendingConsultas > 0 ? Math.min(99, pendingConsultas) : 0;
    }

    return out;
}

export async function buildBadgeSummary(req) {
    const { Notification, User } = req.models;
    const userId = req.user._id;
    const rol = req.user.rol;

    const user = await User.findById(userId).select('rol lastSeenNewsAt lastSeenResourcesAt cuotasEnApp').lean();
    if (!user) {
        return { notifications: { unread: 0 }, tabs: {}, hubs: {} };
    }

    const notificationsUnread = await countUnifiedUnread(user, req.models);

    let rolePart = { tabs: {}, hubs: {} };

    if (['admin_club', 'administrativo'].includes(rol)) {
        rolePart = await adminBadgeSummary(req.models, userId);
    } else if (['profe', 'preparador_fisico'].includes(rol)) {
        rolePart = await coachBadgeSummary(req.user, req.models);
    } else if (['nutricionista', 'psicologo'].includes(rol)) {
        rolePart = await coachBadgeSummary(req.user, req.models);
    } else if (rol === 'atleta' || rol === 'tutor') {
        rolePart = await memberBadgeSummary(user, req.models);
    } else if (rol === 'control_ingreso' || rol === 'colaborador') {
        rolePart = await opsBadgeSummary(user, req.models);
    }

    return {
        notifications: { unread: notificationsUnread },
        tabs: rolePart.tabs,
        hubs: rolePart.hubs,
    };
}
