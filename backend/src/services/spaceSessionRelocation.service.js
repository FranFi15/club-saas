import { hasTimeOverlap } from '../utils/timeHelper.js';

export function startOfTodayUtc() {
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    return hoy;
}

/** YYYY-MM-DD o ISO → fin de ese día en UTC. */
export function parseIndisponibleHastaEnd(isoYmd) {
    if (!isoYmd) return null;
    const raw = String(isoYmd).trim();
    const s = raw.includes('T') ? raw.split('T')[0] : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T23:59:59.999Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function validateIndisponibleHasta(isoYmd) {
    const end = parseIndisponibleHastaEnd(isoYmd);
    if (!end) {
        return { ok: false, error: 'Indicá una fecha de fin válida (YYYY-MM-DD).' };
    }
    if (end < startOfTodayUtc()) {
        return { ok: false, error: 'La fecha de fin no puede ser anterior a hoy.' };
    }
    return { ok: true, end };
}

export function isSpaceUnavailableForSessionDate(space, sessionDate) {
    if (!space || space.estado === 'disponible') return false;
    if (!space.indisponibleHasta) {
        return space.estado === 'mantenimiento' || space.estado === 'clausurado';
    }

    const sessionStart = new Date(sessionDate);
    sessionStart.setUTCHours(0, 0, 0, 0);
    const isoHasta =
        space.indisponibleHasta instanceof Date
            ? space.indisponibleHasta.toISOString().split('T')[0]
            : String(space.indisponibleHasta).split('T')[0];
    const hastaEnd = parseIndisponibleHastaEnd(isoHasta);
    if (!hastaEnd) {
        return space.estado === 'mantenimiento' || space.estado === 'clausurado';
    }

    return sessionStart <= hastaEnd;
}

export async function expireExpiredSpaceRestrictions(Space) {
    await Space.updateMany(
        {
            estado: { $in: ['mantenimiento', 'clausurado'] },
            indisponibleHasta: { $lt: startOfTodayUtc() },
        },
        {
            $set: {
                estado: 'disponible',
                indisponibleHasta: null,
                notasMantenimiento: '',
            },
        },
    );
}

export async function findFutureProgrammedSessions(Session, spaceId, indisponibleHastaIso = null) {
    const fechaFilter = { $gte: startOfTodayUtc() };
    if (indisponibleHastaIso) {
        const hastaEnd = parseIndisponibleHastaEnd(indisponibleHastaIso);
        if (hastaEnd) {
            fechaFilter.$lte = hastaEnd;
        }
    }

    return Session.find({
        espacio: spaceId,
        fecha: fechaFilter,
        estado: 'programada',
    })
        .populate('categoria', 'nombre')
        .sort({ fecha: 1, horaInicio: 1 })
        .lean();
}

async function checkSpaceConflict(Session, { espacioId, fecha, horaInicio, horaFin, excludeSessionId, spaceInfo }) {
    if (spaceInfo.admiteSubdivision) {
        return { ok: true };
    }

    const inicioDia = new Date(fecha);
    inicioDia.setUTCHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setUTCHours(23, 59, 59, 999);

    const sesionesExistentes = await Session.find({
        espacio: espacioId,
        fecha: { $gte: inicioDia, $lte: finDia },
        estado: { $ne: 'cancelada' },
        _id: { $ne: excludeSessionId },
    });

    const choque = sesionesExistentes.find((s) =>
        hasTimeOverlap(horaInicio, horaFin, s.horaInicio, s.horaFin),
    );

    if (choque) {
        return { ok: false, choque };
    }
    return { ok: true };
}

export async function isSpaceFreeForSession(Session, space, { fecha, horaInicio, horaFin, excludeSessionId }) {
    if (!space || space.estado !== 'disponible') return false;
    if (isSpaceUnavailableForSessionDate(space, fecha)) return false;
    const conflict = await checkSpaceConflict(Session, {
        espacioId: space._id,
        fecha,
        horaInicio,
        horaFin,
        excludeSessionId,
        spaceInfo: space,
    });
    return conflict.ok;
}

function spacePickerFields(sp) {
    return { _id: sp._id, nombre: sp.nombre, tipo: sp.tipo, admiteSubdivision: sp.admiteSubdivision };
}

export async function findSpacesFreeForSession(
    Session,
    Space,
    { fecha, horaInicio, horaFin, excludeSessionId, excludeSpaceIds = [] },
) {
    await expireExpiredSpaceRestrictions(Space);
    const excludeSet = new Set(excludeSpaceIds.filter(Boolean).map((id) => String(id)));
    const candidates = await Space.find({ estado: 'disponible' }).sort({ nombre: 1 });
    const free = [];

    for (const sp of candidates) {
        if (excludeSet.has(String(sp._id))) continue;
        if (
            await isSpaceFreeForSession(Session, sp, {
                fecha,
                horaInicio,
                horaFin,
                excludeSessionId,
            })
        ) {
            free.push(spacePickerFields(sp));
        }
    }

    return free;
}

export async function findSpacesFreeForAllSessions(Session, Space, { sessions, excludeSpaceId }) {
    if (!sessions.length) return [];

    const lists = [];
    for (const s of sessions) {
        const list = await findSpacesFreeForSession(Session, Space, {
            fecha: s.fecha,
            horaInicio: s.horaInicio,
            horaFin: s.horaFin,
            excludeSessionId: s._id,
            excludeSpaceIds: excludeSpaceId ? [excludeSpaceId] : [],
        });
        lists.push(list);
    }

    let result = lists[0];
    for (let i = 1; i < lists.length; i++) {
        const ids = new Set(lists[i].map((x) => String(x._id)));
        result = result.filter((x) => ids.has(String(x._id)));
    }
    return result;
}

export async function attachFreeSpacesToSessions(Session, Space, sessions, { excludeSpaceIds = [] } = {}) {
    const result = [];
    for (const s of sessions) {
        const doc = typeof s.toObject === 'function' ? s.toObject() : { ...s };
        doc.espaciosLibres = await findSpacesFreeForSession(Session, Space, {
            fecha: s.fecha,
            horaInicio: s.horaInicio,
            horaFin: s.horaFin,
            excludeSessionId: s._id,
            excludeSpaceIds,
        });
        result.push(doc);
    }
    return result;
}

export async function reassignSessionsToSpace({ Session, Space, sessions, nuevoEspacioId, espacioOriginalId }) {
    const newSpace = await Space.findById(nuevoEspacioId);
    if (!newSpace || newSpace.estado !== 'disponible') {
        return { ok: false, error: 'El espacio destino no está disponible.' };
    }

    const reassigned = [];
    const conflicts = [];

    for (const s of sessions) {
        const sessDoc = await Session.findById(s._id);
        if (!sessDoc) continue;

        if (isSpaceUnavailableForSessionDate(newSpace, sessDoc.fecha)) {
            conflicts.push({
                sessionId: String(sessDoc._id),
                categoria: s.categoria?.nombre || '',
                fecha: sessDoc.fecha,
                horaInicio: sessDoc.horaInicio,
                horaFin: sessDoc.horaFin,
            });
            continue;
        }

        const conflict = await checkSpaceConflict(Session, {
            espacioId: nuevoEspacioId,
            fecha: sessDoc.fecha,
            horaInicio: sessDoc.horaInicio,
            horaFin: sessDoc.horaFin,
            excludeSessionId: sessDoc._id,
            spaceInfo: newSpace,
        });

        if (!conflict.ok) {
            conflicts.push({
                sessionId: String(sessDoc._id),
                categoria: s.categoria?.nombre || '',
                fecha: sessDoc.fecha,
                horaInicio: sessDoc.horaInicio,
                horaFin: sessDoc.horaFin,
            });
            continue;
        }

        sessDoc.espacio = nuevoEspacioId;
        sessDoc.lugarExterno = null;
        sessDoc.reubicacionPendiente = false;
        sessDoc.reubicacionMotivo = '';
        if (espacioOriginalId) {
            sessDoc.espacioSuspendido = espacioOriginalId;
        }
        await sessDoc.save();
        reassigned.push(String(sessDoc._id));
    }

    return {
        ok: conflicts.length === 0,
        reassigned,
        conflicts,
        partial: reassigned.length > 0 && conflicts.length > 0,
    };
}

export async function delegateSessionsToCoach({ Session, sessions, motivo, espacioOriginalId }) {
    let count = 0;
    for (const s of sessions) {
        const sessDoc = await Session.findById(s._id);
        if (!sessDoc) continue;
        sessDoc.reubicacionPendiente = true;
        sessDoc.reubicacionMotivo = motivo;
        sessDoc.espacioSuspendido = espacioOriginalId;
        sessDoc.espacio = null;
        await sessDoc.save();
        count += 1;
    }
    return count;
}

export async function cancelSessions({ Session, sessions, motivo }) {
    const ids = sessions.map((s) => s._id);
    if (!ids.length) return 0;

    const result = await Session.updateMany(
        { _id: { $in: ids } },
        {
            $set: {
                estado: 'cancelada',
                motivoCancelacion: motivo,
                reubicacionPendiente: false,
                reubicacionMotivo: '',
                espacioSuspendido: null,
            },
        },
    );
    return result.modifiedCount;
}

export function clearSessionRelocation(session) {
    session.reubicacionPendiente = false;
    session.reubicacionMotivo = '';
}

export function completeSessionRestore(session) {
    session.reubicacionPendiente = false;
    session.reubicacionMotivo = '';
    session.espacioSuspendido = null;
}

function sessionIsOnHomeSpace(session) {
    const homeId = session.espacioSuspendido?._id || session.espacioSuspendido;
    if (!homeId) return false;
    const currentId = session.espacio?._id || session.espacio;
    const hasExterno = Boolean((session.lugarExterno || '').trim());
    return !hasExterno && currentId && String(currentId) === String(homeId);
}

export async function findRestorableSessions(Session, catIds) {
    const rows = await Session.find({
        categoria: { $in: catIds },
        espacioSuspendido: { $ne: null },
        estado: 'programada',
        fecha: { $gte: startOfTodayUtc() },
    })
        .populate('categoria', 'nombre')
        .populate('espacio', 'nombre tipo')
        .populate('espacioSuspendido', 'nombre tipo estado')
        .sort({ fecha: 1, horaInicio: 1 })
        .lean();

    return rows.filter((s) => {
        const home = s.espacioSuspendido;
        if (!home || home.estado !== 'disponible') return false;
        if (sessionIsOnHomeSpace(s) && !s.reubicacionPendiente) return false;
        if (isSpaceUnavailableForSessionDate(home, s.fecha)) return false;
        return true;
    });
}

export async function restoreSessionToHomeSpace({ Session, Space, sessionDoc }) {
    const homeId = sessionDoc.espacioSuspendido?._id || sessionDoc.espacioSuspendido;
    if (!homeId) {
        const err = new Error('Esta sesión no tiene espacio original registrado.');
        err.statusCode = 400;
        throw err;
    }

    const home = await Space.findById(homeId);
    if (!home || home.estado !== 'disponible') {
        const err = new Error('El espacio original no está disponible.');
        err.statusCode = 400;
        throw err;
    }
    if (isSpaceUnavailableForSessionDate(home, sessionDoc.fecha)) {
        const err = new Error('El espacio original sigue indisponible en la fecha de esta sesión.');
        err.statusCode = 400;
        throw err;
    }

    const conflict = await checkSpaceConflict(Session, {
        espacioId: homeId,
        fecha: sessionDoc.fecha,
        horaInicio: sessionDoc.horaInicio,
        horaFin: sessionDoc.horaFin,
        excludeSessionId: sessionDoc._id,
        spaceInfo: home,
    });
    if (!conflict.ok) {
        const err = new Error(`Choque de horario en el espacio original: ${conflict.choque.horaInicio}–${conflict.choque.horaFin}`);
        err.statusCode = 409;
        throw err;
    }

    sessionDoc.espacio = homeId;
    sessionDoc.lugarExterno = null;
    completeSessionRestore(sessionDoc);
    await sessionDoc.save();
    return sessionDoc;
}
