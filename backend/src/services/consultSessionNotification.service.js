import { createAppNotification, createAppNotificationsMany } from './appNotification.service.js';

function refId(value) {
    if (!value) return value;
    if (typeof value === 'object' && value._id != null) return value._id;
    return value;
}

function formatConsultWhen(session) {
    let fechaTxt = '';
    try {
        fechaTxt = new Date(session.fecha).toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        fechaTxt = String(session.fecha || '');
    }
    return `${fechaTxt} · ${session.horaInicio}–${session.horaFin}`;
}

function consultLabel(tipo) {
    return tipo === 'consulta_nutricion' ? 'consulta de nutrición' : 'consulta de psicología';
}

function staffRoleLabel(tipo) {
    return tipo === 'consulta_nutricion' ? 'Nutricionista' : 'Psicólogo/a';
}

async function createConsultNews(models, { titulo, contenido, autorId, atletaId, tutorId }) {
    const { News } = models;
    await News.create({
        titulo,
        contenido,
        autor: autorId,
        tipo: 'salud',
        alcance: 'usuario',
        targetRoles: [],
        targetCategorias: [],
        targetUsuarios: [atletaId],
    });
    if (tutorId) {
        await News.create({
            titulo,
            contenido,
            autor: autorId,
            tipo: 'salud',
            alcance: 'tutor',
            targetRoles: [],
            targetCategorias: [],
            targetUsuarios: [tutorId],
        });
    }
}

/** Avisos al crear consulta: novedad + push para atleta y tutor. */
export async function notifyConsultSessionCreated(models, session, staffUser) {
    const { User } = models;
    const atletaId = refId(session.atletaIndividual);
    if (!atletaId) return;

    const esNutri = session.tipo === 'consulta_nutricion';
    const label = consultLabel(session.tipo);
    const categoriaNombre = session.categoria?.nombre || 'tu categoría';
    const profesional = `${staffUser?.nombre || ''} ${staffUser?.apellido || ''}`.trim();
    const cuando = formatConsultWhen(session);
    const lugar = String(session.lugarLibre || '').trim();

    let contenido = `Te programaron una ${label}. Confirmá tu asistencia desde la Agenda.`;
    contenido += `\n\n${cuando}`;
    if (lugar) contenido += `\nLugar: ${lugar}`;
    contenido += `\n\nCategoría: ${categoriaNombre}.`;
    if (profesional) contenido += `\n${staffRoleLabel(session.tipo)}: ${profesional}.`;

    const titulo = esNutri ? 'Nueva consulta de nutrición' : 'Nueva consulta de psicología';

    const atleta = await User.findById(atletaId).select('nombre apellido tutorPrincipal').lean();
    const tutorId = atleta?.tutorPrincipal ? refId(atleta.tutorPrincipal) : null;

    await createConsultNews(models, {
        titulo,
        contenido,
        autorId: staffUser._id,
        atletaId,
        tutorId,
    });

    const pushAthlete = {
        usuario: atletaId,
        tipo: 'consulta_pendiente',
        titulo,
        mensaje: `Confirmá tu asistencia: ${cuando}`,
        referencia: session._id,
    };
    await createAppNotification(models, pushAthlete);

    if (tutorId) {
        const nombreAtleta = `${atleta?.nombre || ''} ${atleta?.apellido || ''}`.trim() || 'tu atleta';
        await createAppNotification(models, {
            usuario: tutorId,
            tipo: 'consulta_pendiente',
            titulo: `${titulo} · ${nombreAtleta}`,
            mensaje: `${nombreAtleta} debe confirmar asistencia: ${cuando}`,
            referencia: session._id,
        });
    }
}

/** Marca como leídas las notificaciones de confirmación pendiente de una consulta. */
export async function resolveConsultPendingNotifications(models, sessionId) {
    const { Notification } = models;
    if (!sessionId) return;
    await Notification.updateMany(
        { tipo: 'consulta_pendiente', referencia: sessionId, leida: false },
        { leida: true },
    );
}

/** Avisos cuando el atleta/tutor confirma o rechaza: push al staff y a quien no respondió. */
export async function notifyConsultSessionResponded(models, session, respondedByUser) {
    const { User } = models;
    const atletaId = refId(session.atletaIndividual);
    if (!atletaId) return;

    const atleta = await User.findById(atletaId).select('nombre apellido tutorPrincipal').lean();
    const nombreAtleta = `${atleta?.nombre || ''} ${atleta?.apellido || ''}`.trim() || 'El atleta';
    const cuando = formatConsultWhen(session);
    const rechazada = session.confirmacionAtleta?.estado === 'rechazada';
    const tipo = rechazada ? 'consulta_rechazada' : 'consulta_confirmada';
    const titulo = rechazada ? 'Consulta rechazada' : 'Asistencia confirmada';
    let mensaje = rechazada
        ? `${nombreAtleta} no podrá asistir: ${cuando}`
        : `${nombreAtleta} confirmó asistencia: ${cuando}`;

    if (rechazada && session.confirmacionAtleta?.motivoRechazo) {
        mensaje += `. Motivo: ${session.confirmacionAtleta.motivoRechazo}`;
    }

    await resolveConsultPendingNotifications(models, session._id);

    const staffId = refId(session.creadoPor);
    const responderId = String(respondedByUser._id);
    const atletaIdStr = String(atletaId);
    const tutorId = atleta?.tutorPrincipal ? String(refId(atleta.tutorPrincipal)) : null;

    const destinatarios = new Set();
    if (staffId) destinatarios.add(String(staffId));
    if (responderId !== atletaIdStr) destinatarios.add(atletaIdStr);
    if (tutorId && responderId !== tutorId) destinatarios.add(tutorId);

    if (destinatarios.size) {
        await createAppNotificationsMany(models, [...destinatarios], {
            tipo,
            titulo,
            mensaje,
            referencia: session._id,
        });
    }
}
