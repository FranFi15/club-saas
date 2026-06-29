import asyncHandler from 'express-async-handler';
import {
    findFutureProgrammedSessions,
    reassignSessionsToSpace,
    delegateSessionsToCoach,
    cancelSessions,
    validateIndisponibleHasta,
    parseIndisponibleHastaEnd,
    expireExpiredSpaceRestrictions,
    findSpacesFreeForSession,
    findSpacesFreeForAllSessions,
} from '../services/spaceSessionRelocation.service.js';

// @desc    Crear un nuevo espacio en el club
// @route   POST /api/spaces
const createSpace = asyncHandler(async (req, res) => {
    const { nombre, tipo, admiteSubdivision } = req.body;
    const { Space } = req.models;

    const space = await Space.create({ nombre, tipo, admiteSubdivision });
    res.status(201).json(space);
});

// @desc    Obtener todos los espacios
// @route   GET /api/spaces
const getSpaces = asyncHandler(async (req, res) => {
    const { Space } = req.models;
    await expireExpiredSpaceRestrictions(Space);
    const spaces = await Space.find({});
    res.json(spaces);
});

// @desc    Sesiones programadas afectadas por indisponibilidad (preview)
// @route   GET /api/spaces/:id/sesiones-afectadas?indisponibleHasta=YYYY-MM-DD
const getAffectedSessions = asyncHandler(async (req, res) => {
    const { Space, Session } = req.models;
    const { indisponibleHasta } = req.query;

    const validation = validateIndisponibleHasta(indisponibleHasta);
    if (!validation.ok) {
        res.status(400);
        throw new Error(validation.error);
    }

    const space = await Space.findById(req.params.id);
    if (!space) {
        res.status(404);
        throw new Error('Espacio no encontrado');
    }

    const sessions = await findFutureProgrammedSessions(Session, space._id, indisponibleHasta);
    res.json({ count: sessions.length, sessions, indisponibleHasta });
});

// @desc    Espacios disponibles y libres para un horario concreto
// @route   GET /api/spaces/libres?fecha=&horaInicio=&horaFin=&excludeSessionId=&excludeSpaceId=
const getFreeSpacesForSlot = asyncHandler(async (req, res) => {
    const { Session, Space } = req.models;
    const { fecha, horaInicio, horaFin, excludeSessionId, excludeSpaceId } = req.query;

    if (!fecha || !horaInicio || !horaFin) {
        res.status(400);
        throw new Error('Indicá fecha, hora de inicio y hora de fin.');
    }

    const espaciosLibres = await findSpacesFreeForSession(Session, Space, {
        fecha,
        horaInicio,
        horaFin,
        excludeSessionId: excludeSessionId || undefined,
        excludeSpaceIds: excludeSpaceId ? [excludeSpaceId] : [],
    });

    res.json({ espaciosLibres });
});

// @desc    Espacios libres para varias sesiones (intersección + por sesión)
// @route   POST /api/spaces/libres-para-sesiones
const getFreeSpacesForSessions = asyncHandler(async (req, res) => {
    const { Session, Space } = req.models;
    const { sessions, excludeSpaceId } = req.body;

    if (!Array.isArray(sessions) || !sessions.length) {
        res.status(400);
        throw new Error('Indicá al menos una sesión.');
    }

    for (const s of sessions) {
        if (!s.fecha || !s.horaInicio || !s.horaFin) {
            res.status(400);
            throw new Error('Cada sesión debe incluir fecha, horaInicio y horaFin.');
        }
    }

    const espaciosLibresParaTodas = await findSpacesFreeForAllSessions(Session, Space, {
        sessions,
        excludeSpaceId,
    });

    const porSesion = {};
    for (const s of sessions) {
        const key = s._id ? String(s._id) : `${s.fecha}|${s.horaInicio}|${s.horaFin}`;
        porSesion[key] = await findSpacesFreeForSession(Session, Space, {
            fecha: s.fecha,
            horaInicio: s.horaInicio,
            horaFin: s.horaFin,
            excludeSessionId: s._id,
            excludeSpaceIds: excludeSpaceId ? [excludeSpaceId] : [],
        });
    }

    res.json({ espaciosLibresParaTodas, porSesion });
});

// @desc    Cambiar el estado de un espacio y gestionar sesiones afectadas
// @route   PATCH /api/spaces/:id/estado
const updateSpaceStatus = asyncHandler(async (req, res) => {
    const { estado, notasMantenimiento, accionSesiones, nuevoEspacioId, indisponibleHasta } = req.body;
    const { Space, Session } = req.models;

    const update = { estado, notasMantenimiento };

    if (estado === 'disponible') {
        update.indisponibleHasta = null;
    } else if (estado === 'mantenimiento' || estado === 'clausurado') {
        const validation = validateIndisponibleHasta(indisponibleHasta);
        if (!validation.ok) {
            res.status(400);
            throw new Error(validation.error);
        }
        update.indisponibleHasta = validation.end;
    }

    const space = await Space.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });

    if (!space) {
        res.status(404);
        throw new Error('Espacio no encontrado');
    }

    const report = {
        reubicadas: 0,
        delegadas: 0,
        canceladas: 0,
        conflictos: [],
        clasesCanceladas: 0,
    };

    if (estado === 'mantenimiento' || estado === 'clausurado') {
        const isoHasta =
            indisponibleHasta && String(indisponibleHasta).includes('T')
                ? String(indisponibleHasta).split('T')[0]
                : indisponibleHasta;
        const sessions = await findFutureProgrammedSessions(Session, space._id, isoHasta);
        const motivo = notasMantenimiento || `Suspendido por ${estado} del espacio hasta ${isoHasta}.`;

        if (sessions.length > 0) {
            const accion = accionSesiones || 'cancelar';

            if (accion === 'reubicar') {
                if (!nuevoEspacioId) {
                    res.status(400);
                    throw new Error('Elegí un espacio destino para reubicar las sesiones.');
                }
                if (String(nuevoEspacioId) === String(space._id)) {
                    res.status(400);
                    throw new Error('El espacio destino debe ser distinto al actual.');
                }

                const result = await reassignSessionsToSpace({
                    Session,
                    Space,
                    sessions,
                    nuevoEspacioId,
                    espacioOriginalId: space._id,
                });

                if (result.error) {
                    res.status(400);
                    throw new Error(result.error);
                }

                report.reubicadas = result.reassigned.length;
                report.conflictos = result.conflicts;

                if (result.reassigned.length === 0) {
                    res.status(409);
                    throw new Error('No se pudo reubicar ninguna sesión por conflictos de horario.');
                }
            } else if (accion === 'delegar_coach') {
                report.delegadas = await delegateSessionsToCoach({
                    Session,
                    sessions,
                    motivo,
                    espacioOriginalId: space._id,
                });
            } else {
                report.canceladas = await cancelSessions({ Session, sessions, motivo });
                report.clasesCanceladas = report.canceladas;
            }
        }
    }

    let message = `El espacio pasó a estado: ${estado}.`;
    if (space.indisponibleHasta && (estado === 'mantenimiento' || estado === 'clausurado')) {
        message += ` Indisponible hasta el ${parseIndisponibleHastaEnd(
            space.indisponibleHasta.toISOString().split('T')[0],
        ).toLocaleDateString('es-AR')}.`;
    }
    if (report.reubicadas > 0) {
        message += ` Se reubicaron ${report.reubicadas} sesión(es).`;
    }
    if (report.delegadas > 0) {
        message += ` ${report.delegadas} sesión(es) quedaron pendientes para que el staff elija lugar.`;
    }
    if (report.canceladas > 0) {
        message += ` Se cancelaron ${report.canceladas} sesión(es).`;
    }
    if (report.conflictos.length > 0) {
        message += ` ${report.conflictos.length} sesión(es) no se pudieron mover por choque de horario.`;
    }

    res.json({
        space,
        message,
        ...report,
    });
});

// @desc    Editar datos base del espacio (Nombre, admite subdivisión)
// @route   PUT /api/spaces/:id
const updateSpace = asyncHandler(async (req, res) => {
    const { Space } = req.models;
    const space = await Space.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!space) {
        res.status(404);
        throw new Error('Espacio no encontrado');
    }
    res.json(space);
});

export { createSpace, getSpaces, getAffectedSessions, getFreeSpacesForSlot, getFreeSpacesForSessions, updateSpaceStatus, updateSpace };
