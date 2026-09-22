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
import { DEFAULT_CLUB_TIMEZONE } from '../utils/timeHelper.js';

/** Docs pendientes por atleta (batch). Claves = String(atletaId). */
export async function countDocsPendientesByAthleteIds(atletaIds, models) {
    const out = new Map();
    const ids = [...new Set((atletaIds || []).map((id) => String(id)).filter(Boolean))];
    for (const id of ids) out.set(id, 0);
    if (!ids.length) return out;

    const { Requirement, Enrollment, Submission } = models;
    const objectIds = atletaIds;

    const inscripciones = await Enrollment.find({
        atleta: { $in: objectIds },
        estado: 'activo',
    })
        .select('atleta categoria')
        .lean();

    const catsByAthlete = new Map();
    const allCatIds = [];
    for (const en of inscripciones) {
        const aid = String(en.atleta);
        if (!catsByAthlete.has(aid)) catsByAthlete.set(aid, []);
        catsByAthlete.get(aid).push(en.categoria);
        allCatIds.push(en.categoria);
    }

    const reqs = await Requirement.find({
        activo: true,
        $or: [
            { alcance: 'global' },
            { alcance: 'categoria', targetCategoria: { $in: allCatIds } },
            { alcance: 'usuario', targetUsuario: { $in: objectIds } },
        ],
    })
        .select('_id alcance targetCategoria targetUsuario')
        .lean();

    if (!reqs.length) return out;

    const reqIds = reqs.map((r) => r._id);
    const subs = await Submission.find({
        atleta: { $in: objectIds },
        requerimiento: { $in: reqIds },
    })
        .select('atleta requerimiento estado')
        .lean();

    const subByAthleteReq = new Map();
    for (const s of subs) {
        subByAthleteReq.set(`${String(s.atleta)}:${String(s.requerimiento)}`, s);
    }

    for (const aid of ids) {
        const catIds = new Set((catsByAthlete.get(aid) || []).map(String));
        let n = 0;
        for (const r of reqs) {
            let applies = false;
            if (r.alcance === 'global') applies = true;
            else if (r.alcance === 'categoria') {
                applies = catIds.has(String(r.targetCategoria));
            } else if (r.alcance === 'usuario') {
                applies = String(r.targetUsuario) === aid;
            }
            if (!applies) continue;
            const sub = subByAthleteReq.get(`${aid}:${String(r._id)}`);
            if (!sub || sub.estado === 'rechazado') n += 1;
        }
        out.set(aid, n);
    }

    return out;
}

export async function countDocsPendientesAtleta(atletaId, models) {
    const map = await countDocsPendientesByAthleteIds([atletaId], models);
    return map.get(String(atletaId)) || 0;
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

/** Suma de recursos no vistos por atleta (mismo criterio que el loop tutor: un global cuenta N veces). */
async function countUnreadResourcesForAthleteIds(atletaIds, since, models) {
    const ids = (atletaIds || []).filter(Boolean);
    if (!ids.length) return 0;

    const { Enrollment, Resource } = models;
    const enrollments = await Enrollment.find({
        atleta: { $in: ids },
        estado: 'activo',
    })
        .select('atleta categoria')
        .lean();

    const catsByAthlete = new Map();
    const allCatIds = [];
    for (const en of enrollments) {
        const aid = String(en.atleta);
        if (!catsByAthlete.has(aid)) catsByAthlete.set(aid, []);
        catsByAthlete.get(aid).push(en.categoria);
        allCatIds.push(en.categoria);
    }

    const resources = await Resource.find({
        createdAt: { $gt: since },
        $or: [
            { alcance: 'global' },
            { alcance: 'categoria', targetCategoria: { $in: allCatIds } },
            { alcance: 'usuario', targetUsuario: { $in: ids } },
        ],
    })
        .select('alcance targetCategoria targetUsuario')
        .lean();

    let total = 0;
    for (const aid of ids.map(String)) {
        const catIds = new Set((catsByAthlete.get(aid) || []).map(String));
        for (const r of resources) {
            if (r.alcance === 'global') total += 1;
            else if (r.alcance === 'categoria' && catIds.has(String(r.targetCategoria))) total += 1;
            else if (r.alcance === 'usuario' && String(r.targetUsuario) === aid) total += 1;
        }
    }
    return total;
}

export async function countUnreadResources(user, models) {
    const { Resource, User } = models;
    const since = user.lastSeenResourcesAt || new Date(0);

    if (user.rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id)).select('_id').lean();
        if (!hijos.length) return 0;
        return countUnreadResourcesForAthleteIds(
            hijos.map((h) => h._id),
            since,
            models,
        );
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

/** Cuotas impagas de cualquier titular (socio, tutor o atleta) sin filtrar por rol. */
export async function countCuotasImpagasUsuario(userId, models) {
    const { Payment } = models;
    return Payment.countDocuments({
        atleta: userId,
        estado: { $in: ['pendiente', 'vencido'] },
    });
}

async function countDocsRevisionForUser(user, models) {
    const { Submission, Requirement, Enrollment, Category } = models;
    const isAdmin = ['admin_club', 'dirigente', 'administrativo'].includes(user.rol);

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

async function adminBadgeSummary(models, userId, timezone = DEFAULT_CLUB_TIMEZONE) {
    const pendingCounts = await getAdminPendingCounts(models, userId, timezone);

    const {
        transferenciasRevision: transferenciasRevisionGrupos,
        docsRevision,
        solicitudesInscripcion,
        alquileres: alquileresPendientes,
        chat: chatUnread,
        finanzasImpagasMes: finanzasImpagas = 0,
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
    const [rosterPending, docsRevision, chatUnread] = await Promise.all([
        listRosterPendingForCoach(models, user._id, user.rol),
        countDocsRevisionForUser(user, models),
        countUnreadChatForUser(models, user._id),
    ]);
    const plantelPendientes = rosterPending.length;
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

/** Control de ingreso / colaborador: chat + noticias. */
async function opsBadgeSummary(user, models) {
    const chatUnread = await countUnreadChatForUser(models, user._id);
    const newsUnread = ['colaborador', 'control_ingreso'].includes(user.rol)
        ? await countUnreadNews(user, models)
        : 0;
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

/** Socio: cuota social, noticias y chat. */
async function socioBadgeSummary(user, models) {
    const [cuotas, newsUnread, chatUnread] = await Promise.all([
        countCuotasImpagasUsuario(user._id, models),
        countUnreadNews(user, models),
        countUnreadChatForUser(models, user._id),
    ]);

    const chat = chatUnread > 0 ? Math.min(99, chatUnread) : 0;
    const noticias = newsUnread > 0 ? Math.min(99, newsUnread) : 0;

    return {
        tabs: {
            cuotas: cuotas > 0 ? Math.min(99, cuotas) : 0,
            noticias,
            chat,
            comunicar: chat,
            perfil: 0,
        },
        hubs: {
            cuotas: cuotas > 0 ? Math.min(99, cuotas) : 0,
            noticias,
            chat,
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

/** Indica si un hijo del tutor tiene avisos pendientes (docs, cuotas, consultas, recursos, feed). */
export async function tutorAthleteHasAlerts(tutorUser, atletaId, models) {
    const map = await tutorAthletesAlertFlags(tutorUser, [atletaId], models);
    return map.get(String(atletaId)) === true;
}

/**
 * Flags de alerta por hijo en pocos round-trips (mis-hijos / listados tutor).
 * Claves = String(atletaId).
 */
export async function tutorAthletesAlertFlags(tutorUser, athletes, models) {
    const list = (athletes || []).filter(Boolean);
    const flags = new Map();
    for (const a of list) flags.set(String(a._id || a), false);
    if (!list.length) return flags;

    const { Payment, Resource, Session, Enrollment } = models;
    const atletaIds = list.map((a) => a._id || a);
    const cuotaIds = list
        .filter((a) => a.rol == null || a.rol === 'atleta')
        .filter((a) => (a.cuotasEnApp != null ? atletaCuotasEnApp(a) : true))
        .map((a) => a._id || a);
    const since = tutorUser.lastSeenResourcesAt || new Date(0);

    const [docsBy, paymentRows, consultRows, enrollments, feed] = await Promise.all([
        countDocsPendientesByAthleteIds(atletaIds, models),
        cuotaIds.length
            ? Payment.find({
                  atleta: { $in: cuotaIds },
                  estado: { $in: ['pendiente', 'vencido'] },
              })
                  .select('atleta')
                  .lean()
            : Promise.resolve([]),
        Session.find({
            atletaIndividual: { $in: atletaIds },
            tipo: { $in: ['consulta_nutricion', 'consulta_psicologia'] },
            estado: { $ne: 'cancelada' },
            'confirmacionAtleta.estado': 'pendiente',
        })
            .select('atletaIndividual')
            .lean(),
        Enrollment.find({ atleta: { $in: atletaIds }, estado: 'activo' })
            .select('atleta categoria')
            .lean(),
        buildUnifiedNotificationFeed(tutorUser, models, { limit: 80 }),
    ]);

    for (const [aid, n] of docsBy) {
        if (n > 0) flags.set(aid, true);
    }
    for (const p of paymentRows) flags.set(String(p.atleta), true);
    for (const s of consultRows) flags.set(String(s.atletaIndividual), true);

    const catsByAthlete = new Map();
    const allCatIds = [];
    for (const en of enrollments) {
        const aid = String(en.atleta);
        if (!catsByAthlete.has(aid)) catsByAthlete.set(aid, []);
        catsByAthlete.get(aid).push(en.categoria);
        allCatIds.push(en.categoria);
    }

    const resources = await Resource.find({
        createdAt: { $gt: since },
        $or: [
            { alcance: 'global' },
            { alcance: 'categoria', targetCategoria: { $in: allCatIds } },
            { alcance: 'usuario', targetUsuario: { $in: atletaIds } },
        ],
    })
        .select('alcance targetCategoria targetUsuario')
        .lean();

    for (const aid of [...flags.keys()]) {
        if (flags.get(aid)) continue;
        const catIds = new Set((catsByAthlete.get(aid) || []).map(String));
        for (const r of resources) {
            if (r.alcance === 'global') {
                flags.set(aid, true);
                break;
            }
            if (r.alcance === 'categoria' && catIds.has(String(r.targetCategoria))) {
                flags.set(aid, true);
                break;
            }
            if (r.alcance === 'usuario' && String(r.targetUsuario) === aid) {
                flags.set(aid, true);
                break;
            }
        }
    }

    for (const item of feed) {
        if (item.leida) continue;
        if (item.atletaId) {
            const aid = String(item.atletaId);
            if (flags.has(aid)) flags.set(aid, true);
        }
        const id = String(item.id || '');
        for (const aid of flags.keys()) {
            if (id.endsWith(`:${aid}`)) flags.set(aid, true);
        }
    }

    return flags;
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

    const [newsUnread, chatUnread] = await Promise.all([
        countUnreadNews(user, models),
        countUnreadChatForUser(models, user._id),
    ]);
    out.hubs.novedades = newsUnread;
    out.hubs.chat = chatUnread > 0 ? Math.min(99, chatUnread) : 0;

    if (rol === 'atleta') {
        const [documentacion, recursos, cuotasTab, pendingConsultas] = await Promise.all([
            countDocsPendientesAtleta(user._id, models),
            countUnreadResources(user, models),
            atletaCuotasEnApp(user)
                ? countCuotasImpagasAtleta(user._id, models)
                : Promise.resolve(0),
            countPendingConsultConfirmations(user, models),
        ]);
        out.hubs.documentacion = documentacion;
        out.hubs.recursos = recursos;
        out.tabs.cuotas = cuotasTab;
        const comm = documentacion + recursos + newsUnread + chatUnread;
        out.tabs.comunicar = comm > 0 ? Math.min(99, comm) : 0;
        out.tabs.agenda = pendingConsultas > 0 ? Math.min(99, pendingConsultas) : 0;
    } else if (rol === 'tutor') {
        const hijos = await User.find(hijosDelTutorFilter(user._id)).lean();
        const hijoIds = hijos.map((h) => h._id);
        const cuotaHijoIds = hijos.filter((h) => atletaCuotasEnApp(h)).map((h) => h._id);

        const [docsByAthlete, cuotaRows, recursos, pendingConsultas] = await Promise.all([
            countDocsPendientesByAthleteIds(hijoIds, models),
            cuotaHijoIds.length
                ? Payment.find({
                      atleta: { $in: cuotaHijoIds },
                      estado: { $in: ['pendiente', 'vencido'] },
                  })
                      .select('_id')
                      .lean()
                : Promise.resolve([]),
            countUnreadResources(user, models),
            countPendingConsultConfirmations(user, models),
        ]);

        let docs = 0;
        for (const n of docsByAthlete.values()) docs += n;
        const cuotas = cuotaRows.length;

        out.hubs.documentacion = docs;
        out.hubs.recursos = recursos;
        out.tabs.inicio = docs + cuotas > 0 ? Math.min(99, docs + cuotas) : 0;
        out.tabs.cuotas = cuotas;
        out.tabs.comunicar = Math.min(99, docs + out.hubs.recursos + chatUnread);
        out.tabs.novedades = newsUnread;
        out.tabs.agenda = pendingConsultas > 0 ? Math.min(99, pendingConsultas) : 0;
    }

    return out;
}

export async function buildBadgeSummary(req) {
    const { Notification, User } = req.models;
    const userId = req.user._id;
    const rol = req.user.rol;

    const user = await User.findById(userId)
        .select('rol lastSeenNewsAt lastSeenResourcesAt cuotasEnApp')
        .lean();
    if (!user) {
        return { notifications: { unread: 0 }, tabs: {}, hubs: {} };
    }

    const notificationsUnread = await countUnifiedUnread(user, req.models);

    let rolePart = { tabs: {}, hubs: {} };

    if (['admin_club', 'dirigente', 'administrativo'].includes(rol)) {
        rolePart = await adminBadgeSummary(req.models, userId, req.clubTimezone || DEFAULT_CLUB_TIMEZONE);
    } else if (['profe', 'preparador_fisico'].includes(rol)) {
        rolePart = await coachBadgeSummary(req.user, req.models);
    } else if (['nutricionista', 'psicologo'].includes(rol)) {
        rolePart = await coachBadgeSummary(req.user, req.models);
    } else if (rol === 'atleta' || rol === 'tutor') {
        rolePart = await memberBadgeSummary(user, req.models);
    } else if (rol === 'socio') {
        rolePart = await socioBadgeSummary({ ...user, _id: userId }, req.models);
    } else if (rol === 'control_ingreso' || rol === 'colaborador') {
        rolePart = await opsBadgeSummary(user, req.models);
    }

    return {
        notifications: { unread: notificationsUnread },
        tabs: rolePart.tabs,
        hubs: rolePart.hubs,
    };
}
