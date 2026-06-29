import asyncHandler from 'express-async-handler';
import { hasTimeOverlap } from '../utils/timeHelper.js';
import { generateSessionsInDateRange } from '../services/sessionFromSchedule.service.js';
import {
    notifyConsultSessionCreated,
    notifyConsultSessionResponded,
} from '../services/consultSessionNotification.service.js';
import {
    clearSessionRelocation,
    isSpaceUnavailableForSessionDate,
    findRestorableSessions,
    restoreSessionToHomeSpace,
    attachFreeSpacesToSessions,
} from '../services/spaceSessionRelocation.service.js';

const CONSULT_SESSION_TYPES = ['consulta_nutricion', 'consulta_psicologia'];

const TRAINING_SESSION_FILTER = { tipo: { $nin: CONSULT_SESSION_TYPES } };

// @desc    Crear una sesión manual (entrenamiento, partido, alquiler o consulta nutricional individual)
// @route   POST /api/sessions
const createSession = asyncHandler(async (req, res) => {
    const {
        tipo,
        categoria,
        fecha,
        horaInicio,
        horaFin,
        espacio,
        lugarExterno,
        forzarReserva,
        atletaIndividual,
        lugarLibre,
        nombreSesion,
        esOpcional,
    } = req.body;
    const { Session, Space, Category, Enrollment } = req.models;

    if (tipo === 'consulta_nutricion' || tipo === 'consulta_psicologia') {
        const esNutri = tipo === 'consulta_nutricion';
        const rolesOk = esNutri ? ['nutricionista', 'admin_club'] : ['psicologo', 'admin_club'];
        if (!rolesOk.includes(req.user.rol)) {
            res.status(403);
            throw new Error(
                esNutri
                    ? 'Solo nutricionistas o administración pueden crear consultas de nutrición.'
                    : 'Solo psicólogos o administración pueden crear consultas de psicología.',
            );
        }
        if (!categoria || !atletaIndividual || !fecha || !horaInicio || !horaFin) {
            res.status(400);
            throw new Error('Indicá categoría, atleta, fecha y horario.');
        }
        if (req.user.rol === 'nutricionista' && esNutri) {
            const ok = await esNutricionistaDeCategoria(Category, categoria, req.user._id);
            if (!ok) {
                res.status(403);
                throw new Error('No sos nutricionista asignado a esta categoría.');
            }
        }
        if (req.user.rol === 'psicologo' && !esNutri) {
            const ok = await esPsicologoDeCategoria(Category, categoria, req.user._id);
            if (!ok) {
                res.status(403);
                throw new Error('No sos psicólogo asignado a esta categoría.');
            }
        }
        const enr = await Enrollment.findOne({
            atleta: atletaIndividual,
            categoria,
            estado: 'activo',
        });
        if (!enr) {
            res.status(400);
            throw new Error('El atleta no está inscripto activo en esa categoría.');
        }
        const lugarTxt = typeof lugarLibre === 'string' ? lugarLibre.trim() : '';
        const session = await Session.create({
            tipo,
            categoria,
            atletaIndividual,
            lugarLibre: lugarTxt,
            fecha,
            horaInicio,
            horaFin,
            creadoPor: req.user._id,
            confirmacionAtleta: { estado: 'pendiente' },
        });
        await session.populate([
            { path: 'atletaIndividual', select: 'nombre apellido fotoPerfil' },
            { path: 'categoria', select: 'nombre' },
        ]);
        try {
            await notifyConsultSessionCreated(req.models, session, req.user);
        } catch (e) {
            console.warn('[consult] notify created:', e.message);
        }
        res.status(201).json(session);
        return;
    }

    const tipoNorm = ['entrenamiento', 'partido', 'alquiler'].includes(tipo) ? tipo : 'entrenamiento';

    if (req.user.rol === 'profe' && tipoNorm === 'alquiler') {
        res.status(403);
        throw new Error('Los alquileres los gestiona administración.');
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No sos profesor de esta categoría.');
        }
    }

    if (req.user.rol === 'preparador_fisico') {
        if (tipoNorm === 'alquiler') {
            res.status(403);
            throw new Error('Los alquileres los gestiona administración.');
        }
        if (tipoNorm === 'partido') {
            res.status(403);
            throw new Error('Los partidos los gestiona el cuerpo técnico principal. Podés crear entrenamientos (gimnasio o campo).');
        }
        const ok = await esPreparadorDeCategoria(Category, categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No sos preparador físico asignado a esta categoría.');
        }
    }

    const ext = typeof lugarExterno === 'string' ? lugarExterno.trim() : '';
    const useExterno = ext.length >= 3;

    if (tipoNorm === 'entrenamiento' && useExterno) {
        res.status(400);
        throw new Error('Los entrenamientos usan un espacio del club. Para sede externa creá un partido.');
    }

    if (tipoNorm === 'partido' && !useExterno && !espacio) {
        res.status(400);
        throw new Error('Partido: elegí un espacio del club o escribí la sede (visitante, dirección, etc.).');
    }

    if (!useExterno) {
        if (!espacio) {
            res.status(400);
            throw new Error('Tenés que elegir un espacio del club.');
        }

        const spaceInfo = await Space.findById(espacio);
        if (!spaceInfo) {
            res.status(404);
            throw new Error('El espacio seleccionado no existe');
        }

        if (isSpaceUnavailableForSessionDate(spaceInfo, fecha)) {
            res.status(400);
            throw new Error(`No se puede reservar: El espacio se encuentra en ${spaceInfo.estado}`);
        }

        if (!spaceInfo.admiteSubdivision) {
            const inicioDia = new Date(fecha);
            inicioDia.setUTCHours(0, 0, 0, 0);
            const finDia = new Date(fecha);
            finDia.setUTCHours(23, 59, 59, 999);

            const sesionesExistentes = await Session.find({
                espacio,
                fecha: { $gte: inicioDia, $lte: finDia },
                estado: { $ne: 'cancelada' },
            });

            const sesionesQueChocan = sesionesExistentes.filter((s) =>
                hasTimeOverlap(horaInicio, horaFin, s.horaInicio, s.horaFin),
            );

            if (sesionesQueChocan.length > 0) {
                if (forzarReserva) {
                    const idsParaCancelar = sesionesQueChocan.map((s) => s._id);
                    await Session.updateMany(
                        { _id: { $in: idsParaCancelar } },
                        {
                            $set: {
                                estado: 'cancelada',
                                motivoCancelacion: `Cancelado por evento prioritario: ${tipoNorm}`,
                            },
                        },
                    );
                } else {
                    res.status(400);
                    throw new Error(
                        `El espacio está ocupado. Hay ${sesionesQueChocan.length} actividad(es) en ese horario.`,
                    );
                }
            }
        }
    }

    const nombreTxt =
        typeof nombreSesion === 'string' ? nombreSesion.trim().slice(0, 120) : '';
    const opcionalFlag = esOpcional === true || esOpcional === 'true';

    const session = await Session.create({
        tipo: tipoNorm,
        categoria,
        fecha,
        horaInicio,
        horaFin,
        espacio: useExterno ? null : espacio,
        lugarExterno: useExterno ? ext : undefined,
        nombreSesion: nombreTxt,
        esOpcional: opcionalFlag,
    });

    await session.populate('espacio', 'nombre tipo estado admiteSubdivision');

    res.status(201).json(session);
});

// @desc    Pasar asistencia en una sesión
// @route   PUT /api/sessions/:id/asistencia
const takeAttendance = asyncHandler(async (req, res) => {
    const { asistencia, estado } = req.body; 
    
    const { Session, Category } = req.models;

    const session = await Session.findById(req.params.id);

    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'preparador_fisico') {
        const ok = await esPreparadorDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'nutricionista') {
        if (session.tipo !== 'consulta_nutricion') {
            res.status(403);
            throw new Error('Solo podés cargar asistencia en consultas de nutrición.');
        }
        const ok = await esNutricionistaDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'psicologo') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('Solo podés cargar asistencia en consultas de psicología.');
        }
        const ok = await esPsicologoDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    session.asistencia = asistencia;
    if (estado) session.estado = estado; 

    const updatedSession = await session.save();
    
    // Poblamos el espacio y la lista de atletas para que el front tenga la info actualizada
    await updatedSession.populate('espacio', 'nombre estado');
    await updatedSession.populate('asistencia.atleta', 'nombre apellido');

    res.json(updatedSession);
});

// @desc    Obtener sesiones de una categoría (Para que el profe vea su agenda)
// @route   GET /api/sessions/categoria/:categoryId
async function esProfeDeCategoria(Category, categoriaId, userId) {
    const cat = await Category.findById(categoriaId).select('profesores');
    if (!cat) return false;
    return (cat.profesores || []).some((p) => p.equals(userId));
}

async function esPreparadorDeCategoria(Category, categoriaId, userId) {
    const cat = await Category.findById(categoriaId).select('preparadoresFisicos');
    if (!cat) return false;
    return (cat.preparadoresFisicos || []).some((p) => p.equals(userId));
}

async function esNutricionistaDeCategoria(Category, categoriaId, userId) {
    const cat = await Category.findById(categoriaId).select('nutricionistas');
    if (!cat) return false;
    return (cat.nutricionistas || []).some((p) => p.equals(userId));
}

async function esPsicologoDeCategoria(Category, categoriaId, userId) {
    const cat = await Category.findById(categoriaId).select('psicologos');
    if (!cat) return false;
    return (cat.psicologos || []).some((p) => p.equals(userId));
}

/** Body parser for visibility flags (consultas de psicología). */
function parseInformeVisibilityBool(value, defaultWhenAmbiguous = true) {
    if (value === undefined || value === null) return defaultWhenAmbiguous;
    if (typeof value === 'boolean') return value;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    return defaultWhenAmbiguous;
}

function sessionAtletaIndividualId(sessionDoc) {
    const raw = sessionDoc?.atletaIndividual;
    if (raw == null) return '';
    if (typeof raw === 'object' && raw._id != null) return String(raw._id);
    return String(raw);
}

async function redactPsychInformeOnSessionDocForViewer(sessionDoc, rolViewer, viewerUserId, User) {
    if (!sessionDoc || sessionDoc.tipo !== 'consulta_psicologia') return;
    const aid = sessionAtletaIndividualId(sessionDoc);
    if (!aid) {
        sessionDoc.informeSesion = '';
        return;
    }
    if (rolViewer === 'atleta') {
        if (aid !== viewerUserId.toString()) {
            sessionDoc.informeSesion = '';
            return;
        }
        if (sessionDoc.informeVisibleParaAtleta === false) sessionDoc.informeSesion = '';
        return;
    }
    if (rolViewer === 'tutor') {
        const hijo = await User.findById(aid).select('tutorPrincipal').lean();
        if (!hijo?.tutorPrincipal || String(hijo.tutorPrincipal) !== String(viewerUserId)) {
            sessionDoc.informeSesion = '';
            return;
        }
        if (sessionDoc.informeVisibleParaTutor === false) sessionDoc.informeSesion = '';
    }
}

async function populateSessionDetail(sessDoc) {
    if (!sessDoc) return sessDoc;
    await sessDoc.populate('planEntrenamiento');
    await sessDoc.populate({
        path: 'categoria',
        select: 'nombre profesores preparadoresFisicos nutricionistas psicologos disciplina',
        populate: { path: 'disciplina', select: 'nombre' },
    });
    await sessDoc.populate('espacio', 'nombre tipo estado');
    await sessDoc.populate('espacioSuspendido', 'nombre tipo estado');
    await sessDoc.populate('atletaIndividual', 'nombre apellido fotoPerfil');
    await sessDoc.populate('asistencia.atleta', 'nombre apellido fotoPerfil');
    return sessDoc;
}

async function resolveCoachCategoriesFilter(req, res) {
    const { Category } = req.models;
    const { categoriaId } = req.query;

    const catFilter =
        req.user.rol === 'preparador_fisico'
            ? { preparadoresFisicos: req.user._id }
            : { profesores: req.user._id };
    const misCats = await Category.find(catFilter).select('_id nombre').sort({ nombre: 1 });

    if (misCats.length === 0) {
        return { misCats, catIds: [], categoriaSeleccionada: null };
    }

    let catIds = misCats.map((c) => c._id);
    let categoriaSeleccionada = null;

    if (categoriaId) {
        const allowed = new Set(misCats.map((c) => String(c._id)));
        if (!allowed.has(String(categoriaId))) {
            res.status(403);
            throw new Error('No tenés acceso a esa categoría.');
        }
        catIds = [categoriaId];
        categoriaSeleccionada = misCats.find((c) => String(c._id) === String(categoriaId)) || null;
    }

    return { misCats, catIds, categoriaSeleccionada };
}

// @desc    Agenda del profe (sesiones de sus categorías en un rango de fechas)
// @route   GET /api/sessions/profe/agenda
const getCoachAgenda = asyncHandler(async (req, res) => {
    const { Session } = req.models;
    const { desde, hasta } = req.query;

    const { misCats, catIds, categoriaSeleccionada } = await resolveCoachCategoriesFilter(req, res);
    if (catIds.length === 0) {
        return res.json({ categorias: misCats, sesiones: [], categoriaSeleccionada: null });
    }

    const start = desde ? new Date(desde) : new Date();
    start.setUTCHours(0, 0, 0, 0);
    let end;
    if (hasta) {
        end = new Date(hasta);
        end.setUTCHours(23, 59, 59, 999);
    } else {
        end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 21);
        end.setUTCHours(23, 59, 59, 999);
    }

    const sesiones = await Session.find({
        categoria: { $in: catIds },
        fecha: { $gte: start, $lte: end },
        estado: { $ne: 'cancelada' },
        ...TRAINING_SESSION_FILTER,
    })
        .populate('categoria', 'nombre')
        .populate('espacio', 'nombre tipo')
        .populate('espacioSuspendido', 'nombre')
        .sort({ fecha: 1, horaInicio: 1 });

    res.json({ categorias: misCats, sesiones, categoriaSeleccionada });
});

function utcEndOfToday() {
    const d = new Date();
    d.setUTCHours(23, 59, 59, 999);
    return d;
}

function utcStartDaysAgo(daysBack) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function utcStartOfCurrentMonth() {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function averageRounded(values) {
    if (!values.length) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

const ENFOQUE_KEYS = [
    'ofensivo',
    'defensivo',
    'transicion_ataque',
    'transicion_defensa',
    'fisico',
    'tecnico',
    'neutro',
];

const ENFOQUE_LABELS = {
    ofensivo: 'Ofensivo',
    defensivo: 'Defensivo',
    transicion_ataque: 'Tr. ataque',
    transicion_defensa: 'Tr. defensa',
    fisico: 'Físico',
    tecnico: 'Técnico',
    neutro: 'Neutro',
};

function emptyPorEnfoque() {
    return Object.fromEntries(ENFOQUE_KEYS.map((k) => [k, 0]));
}

function blockMinutesForStats(b) {
    const real = Number(b.duracionRealMinutos);
    if (real > 0) return real;
    const planificada = Number(b.duracionPlanificada);
    if (planificada > 0) return planificada;
    return Number(b.duracionMinutos) || 0;
}

function accumulateEnfoqueFromSession(session, porEnfoque) {
    if (session.estado !== 'completada') return;

    let blocks = session.bloquesEjecutados || [];
    if (!blocks.length && session.planEntrenamiento?.bloques?.length) {
        blocks = session.planEntrenamiento.bloques;
    }

    blocks.forEach((b) => {
        const key = b.enfoque;
        const mins = blockMinutesForStats(b);
        if (key && Object.prototype.hasOwnProperty.call(porEnfoque, key) && mins > 0) {
            porEnfoque[key] += mins;
        }
    });
}

function buildEnfoqueChart(porEnfoque) {
    const total = ENFOQUE_KEYS.reduce((acc, k) => acc + (porEnfoque[k] || 0), 0);
    const chart = ENFOQUE_KEYS.map((key) => {
        const minutos = porEnfoque[key] || 0;
        return {
            key,
            label: ENFOQUE_LABELS[key] || key,
            minutos,
            porcentaje: total > 0 ? Math.round((minutos / total) * 100) : 0,
        };
    })
        .filter((row) => row.minutos > 0)
        .sort((a, b) => b.minutos - a.minutos);

    const dominant = chart.length ? chart[0] : null;

    return {
        porEnfoque,
        totalMinutosEnfoque: total,
        enfoqueChart: chart,
        enfoqueDominante: dominant
            ? { key: dominant.key, label: dominant.label, minutos: dominant.minutos, porcentaje: dominant.porcentaje }
            : null,
    };
}

function aggregateCoachSessionStats(sessions) {
    let completadas = 0;
    let programadas = 0;
    let canceladas = 0;
    const attendanceRates = [];
    const durationMinutes = [];
    const porEnfoque = emptyPorEnfoque();

    for (const s of sessions) {
        if (s.estado === 'completada') completadas += 1;
        else if (s.estado === 'cancelada') canceladas += 1;
        else programadas += 1;

        const asist = s.asistencia || [];
        if (asist.length > 0) {
            let ok = 0;
            asist.forEach((a) => {
                if (a.estado === 'presente' || a.estado === 'tarde') ok += 1;
            });
            attendanceRates.push(Math.round((ok / asist.length) * 100));
        }

        if (s.estado === 'completada') {
            const mins = (s.bloquesEjecutados || []).reduce(
                (acc, b) => acc + (Number(b.duracionRealMinutos) || 0),
                0,
            );
            if (mins > 0) durationMinutes.push(mins);
            accumulateEnfoqueFromSession(s, porEnfoque);
        }
    }

    const total = sessions.length;
    const activas = total - canceladas;
    const enfoqueStats = buildEnfoqueChart(porEnfoque);

    return {
        totalSesiones: total,
        completadas,
        programadas,
        canceladas,
        promedioAsistenciaPct: averageRounded(attendanceRates),
        promedioMinutosReales: averageRounded(durationMinutes),
        tasaCompletadasPct: activas > 0 ? Math.round((completadas / activas) * 100) : null,
        sesionesConAsistencia: attendanceRates.length,
        sesionesConDuracion: durationMinutes.length,
        ...enfoqueStats,
    };
}

// @desc    Promedios de sesiones del cuerpo técnico (semana, mes, histórico)
// @route   GET /api/sessions/profe/stats
const getCoachSessionStats = asyncHandler(async (req, res) => {
    const { Session } = req.models;

    const { misCats, catIds, categoriaSeleccionada } = await resolveCoachCategoriesFilter(req, res);

    const empty = {
        semana: { etiqueta: 'Últimos 7 días', ...aggregateCoachSessionStats([]) },
        mes: { etiqueta: 'Mes en curso', ...aggregateCoachSessionStats([]) },
        historico: { etiqueta: 'Histórico', ...aggregateCoachSessionStats([]) },
    };

    if (catIds.length === 0) {
        return res.json({ categorias: misCats, categoriaSeleccionada: null, periodos: empty });
    }

    const baseQuery = {
        categoria: { $in: catIds },
        tipo: { $nin: ['alquiler', ...CONSULT_SESSION_TYPES] },
    };
    const end = utcEndOfToday();

    const loadFrom = (fechaGte) => {
        const fecha = { $lte: end };
        if (fechaGte) fecha.$gte = fechaGte;
        return Session.find({ ...baseQuery, fecha })
            .select('estado asistencia bloquesEjecutados planEntrenamiento fecha tipo')
            .populate('planEntrenamiento', 'bloques')
            .lean();
    };

    const [weekDocs, monthDocs, allDocs] = await Promise.all([
        loadFrom(utcStartDaysAgo(6)),
        loadFrom(utcStartOfCurrentMonth()),
        Session.find(baseQuery)
            .select('estado asistencia bloquesEjecutados planEntrenamiento fecha tipo')
            .populate('planEntrenamiento', 'bloques')
            .lean(),
    ]);

    res.json({
        categorias: misCats,
        categoriaSeleccionada,
        periodos: {
            semana: { etiqueta: 'Últimos 7 días', ...aggregateCoachSessionStats(weekDocs) },
            mes: { etiqueta: 'Mes en curso', ...aggregateCoachSessionStats(monthDocs) },
            historico: { etiqueta: 'Histórico', ...aggregateCoachSessionStats(allDocs) },
        },
    });
});

function asistenciaDetalleFromSession(session) {
    const asist = session.asistencia || [];
    let presente = 0;
    let tarde = 0;
    let ausente = 0;
    asist.forEach((a) => {
        if (a.estado === 'presente') presente += 1;
        else if (a.estado === 'tarde') tarde += 1;
        else ausente += 1;
    });
    return { presente, tarde, ausente, total: asist.length };
}

// @desc    Estadísticas de una sesión (asistencia y enfoque de esa sesión)
// @route   GET /api/sessions/:id/stats
const getSessionStatsById = asyncHandler(async (req, res) => {
    const { Session } = req.models;

    const session = await Session.findById(req.params.id)
        .select(
            'estado asistencia bloquesEjecutados planEntrenamiento fecha horaInicio horaFin tipo categoria',
        )
        .populate('planEntrenamiento', 'bloques')
        .populate('categoria', 'nombre');

    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    await assertStaffCanModifySession(req, session);

    const stats = aggregateCoachSessionStats([session.toObject()]);

    res.json({
        sesion: {
            _id: session._id,
            fecha: session.fecha,
            horaInicio: session.horaInicio,
            horaFin: session.horaFin,
            tipo: session.tipo,
            estado: session.estado,
            categoria: session.categoria,
        },
        ...stats,
        asistenciaDetalle: asistenciaDetalleFromSession(session),
    });
});

// @desc    Agenda del nutricionista (consultas individuales por categorías asignadas)
// @route   GET /api/sessions/nutricionista/agenda
const getNutricionistaAgenda = asyncHandler(async (req, res) => {
    const { Category, Session } = req.models;
    const { desde, hasta } = req.query;

    const misCats = await Category.find({ nutricionistas: req.user._id }).select('_id nombre');
    const catIds = misCats.map((c) => c._id);
    if (catIds.length === 0) {
        return res.json({ categorias: [], sesiones: [] });
    }

    const start = desde ? new Date(desde) : new Date();
    start.setUTCHours(0, 0, 0, 0);
    let end;
    if (hasta) {
        end = new Date(hasta);
        end.setUTCHours(23, 59, 59, 999);
    } else {
        end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 21);
        end.setUTCHours(23, 59, 59, 999);
    }

    const sesiones = await Session.find({
        tipo: 'consulta_nutricion',
        categoria: { $in: catIds },
        fecha: { $gte: start, $lte: end },
        estado: { $ne: 'cancelada' },
    })
        .populate('categoria', 'nombre')
        .populate('atletaIndividual', 'nombre apellido')
        .sort({ fecha: 1, horaInicio: 1 });

    res.json({ categorias: misCats, sesiones });
});

// @desc    Agenda del psicólogo (consultas individuales por categorías asignadas)
// @route   GET /api/sessions/psicologo/agenda
const getPsicologoAgenda = asyncHandler(async (req, res) => {
    const { Category, Session } = req.models;
    const { desde, hasta } = req.query;

    const misCats = await Category.find({ psicologos: req.user._id }).select('_id nombre');
    const catIds = misCats.map((c) => c._id);
    if (catIds.length === 0) {
        return res.json({ categorias: [], sesiones: [] });
    }

    const start = desde ? new Date(desde) : new Date();
    start.setUTCHours(0, 0, 0, 0);
    let end;
    if (hasta) {
        end = new Date(hasta);
        end.setUTCHours(23, 59, 59, 999);
    } else {
        end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 21);
        end.setUTCHours(23, 59, 59, 999);
    }

    const sesiones = await Session.find({
        tipo: 'consulta_psicologia',
        categoria: { $in: catIds },
        fecha: { $gte: start, $lte: end },
        estado: { $ne: 'cancelada' },
    })
        .populate('categoria', 'nombre')
        .populate('atletaIndividual', 'nombre apellido')
        .sort({ fecha: 1, horaInicio: 1 });

    res.json({ categorias: misCats, sesiones });
});

// @desc    Detalle de una sesión (asistencia, bloques, etc.)
// @route   GET /api/sessions/:id
const getSessionById = asyncHandler(async (req, res) => {
    const { Session, Category } = req.models;
    const session = await Session.findById(req.params.id)
        .populate({
            path: 'categoria',
            select: 'nombre profesores preparadoresFisicos nutricionistas psicologos disciplina',
            populate: { path: 'disciplina', select: 'nombre' },
        })
        .populate('espacio', 'nombre tipo estado')
        .populate('planEntrenamiento')
        .populate('atletaIndividual', 'nombre apellido fotoPerfil')
        .populate('asistencia.atleta', 'nombre apellido fotoPerfil');

    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    const rol = req.user.rol;
    if (['admin_club', 'administrativo'].includes(rol)) {
        return res.json(session);
    }
    if (!session.categoria?._id) {
        res.status(404);
        throw new Error('Sesión sin categoría válida');
    }
    if (rol === 'profe') {
        if (CONSULT_SESSION_TYPES.includes(session.tipo)) {
            res.status(403);
            throw new Error('No tenés acceso a consultas individuales.');
        }
        const ok = await esProfeDeCategoria(Category, session.categoria._id, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return res.json(session);
    }
    if (rol === 'preparador_fisico') {
        if (CONSULT_SESSION_TYPES.includes(session.tipo)) {
            res.status(403);
            throw new Error('No tenés acceso a consultas individuales.');
        }
        const ok = await esPreparadorDeCategoria(Category, session.categoria._id, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return res.json(session);
    }
    if (rol === 'nutricionista') {
        if (session.tipo !== 'consulta_nutricion') {
            res.status(403);
            throw new Error('No tenés acceso a este tipo de sesión.');
        }
        const ok = await esNutricionistaDeCategoria(Category, session.categoria._id, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return res.json(session);
    }
    if (rol === 'psicologo') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('No tenés acceso a este tipo de sesión.');
        }
        const ok = await esPsicologoDeCategoria(Category, session.categoria._id, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return res.json(session);
    }

    const { User, Enrollment } = req.models;

    if (rol === 'atleta') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('No autorizado');
        }
        const aid = sessionAtletaIndividualId(session);
        if (!aid || aid !== req.user._id.toString()) {
            res.status(403);
            throw new Error('No autorizado');
        }
        const enr = await Enrollment.findOne({
            atleta: req.user._id,
            categoria: session.categoria._id,
            estado: 'activo',
        });
        if (!enr) {
            res.status(403);
            throw new Error('No autorizado');
        }
        if (session.informeVisibleParaAtleta === false) session.informeSesion = '';
        return res.json(session);
    }

    if (rol === 'tutor') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('No autorizado');
        }
        const aid = sessionAtletaIndividualId(session);
        if (!aid) {
            res.status(403);
            throw new Error('No autorizado');
        }
        const hijo = await User.findById(aid).select('tutorPrincipal').lean();
        if (!hijo?.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            res.status(403);
            throw new Error('No autorizado');
        }
        const enr = await Enrollment.findOne({
            atleta: aid,
            categoria: session.categoria._id,
            estado: 'activo',
        });
        if (!enr) {
            res.status(403);
            throw new Error('No autorizado');
        }
        if (session.informeVisibleParaTutor === false) session.informeSesion = '';
        return res.json(session);
    }

    res.status(403);
    throw new Error('No autorizado');
});

const getSessionsByCategory = asyncHandler(async (req, res) => {
    const { Session, User } = req.models;

    let sessions = await Session.find({ categoria: req.params.categoryId })
        .sort({ fecha: -1 })
        .populate('asistencia.atleta', 'nombre apellido')
        .populate('categoria', 'nombre')
        .populate('atletaIndividual', 'nombre apellido')
        .populate('espacio', 'nombre tipo estado notasMantenimiento');

    const rol = req.user.rol;
    const uid = req.user._id.toString();

    if (rol === 'atleta') {
        sessions = sessions.filter((s) => {
            const ind = sessionAtletaIndividualId(s);
            if (!ind) return true;
            return ind === uid;
        });
    } else if (rol === 'tutor') {
        const hijos = await User.find({ tutorPrincipal: req.user._id, rol: 'atleta' }).select('_id').lean();
        const hijosSet = new Set(hijos.map((h) => String(h._id)));
        sessions = sessions.filter((s) => {
            const ind = sessionAtletaIndividualId(s);
            if (!ind) return true;
            return hijosSet.has(ind);
        });
    } else if (rol === 'profe' || rol === 'preparador_fisico') {
        sessions = sessions.filter((s) => !CONSULT_SESSION_TYPES.includes(s.tipo));
    } else if (rol === 'nutricionista') {
        sessions = sessions.filter((s) => s.tipo === 'consulta_nutricion');
    } else if (rol === 'psicologo') {
        sessions = sessions.filter((s) => s.tipo === 'consulta_psicologia');
    }

    if (rol === 'atleta' || rol === 'tutor') {
        await Promise.all(
            sessions.map((s) => redactPsychInformeOnSessionDocForViewer(s, rol, req.user._id, User)),
        );
    }

    res.json(sessions);
});

// @desc    Obtener sesiones de un espacio (Para ver ocupación de cancha)
// @route   GET /api/sessions/espacio/:spaceId
const getSessionsBySpace = asyncHandler(async (req, res) => {
    const { Session } = req.models;
    const { fechaInicio, fechaFin } = req.query;

    let query = {
        espacio: req.params.spaceId,
    };

    if (req.query.incluirCanceladas !== 'true') {
        query.estado = { $ne: 'cancelada' };
    }

    if (fechaInicio || fechaFin) {
        query.fecha = {};
        const ymdEnd = fechaFin || fechaInicio;
        const ymdStart = fechaInicio || fechaFin;
        if (ymdStart) {
            const inicioDia = new Date(ymdStart);
            inicioDia.setUTCHours(0, 0, 0, 0);
            query.fecha.$gte = inicioDia;
        }
        if (ymdEnd) {
            const finDia = new Date(ymdEnd);
            finDia.setUTCHours(23, 59, 59, 999);
            query.fecha.$lte = finDia;
        }
    }

    const sessions = await Session.find(query)
        .sort({ fecha: 1, horaInicio: 1 })
        .populate('categoria', 'nombre');
        
    res.json(sessions);
});

// @desc    Generar sesiones automáticamente basadas en la Grilla Fija (Schedule)
// @route   POST /api/sessions/generate
const generateSessionsFromSchedule = asyncHandler(async (req, res) => {
    const { fechaInicio, fechaFin } = req.body;
    const { detalles, errores, creadasCount } = await generateSessionsInDateRange(req.models, fechaInicio, fechaFin);

    res.status(201).json({
        message: `Proceso completado. Se crearon ${creadasCount} sesiones.`,
        detalles,
        errores,
    });
});


// @desc    Reprogramar una sesión (Cambiar horario, fecha o lugar)
// @route   PATCH /api/sessions/:id/reprogramar
const reprogramarSession = asyncHandler(async (req, res) => {
    const { nuevoEspacioId, lugarExterno, nuevaFecha, nuevaHoraInicio, nuevaHoraFin } = req.body;
    const { Session, Space, Category } = req.models;

    const session = await Session.findById(req.params.id);
    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'preparador_fisico') {
        if (session.tipo !== 'entrenamiento') {
            res.status(403);
            throw new Error('Solo podés reprogramar entrenamientos.');
        }
        const ok = await esPreparadorDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'nutricionista') {
        if (session.tipo !== 'consulta_nutricion') {
            res.status(403);
            throw new Error('Solo podés reprogramar consultas de nutrición.');
        }
        const ok = await esNutricionistaDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'psicologo') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('Solo podés reprogramar consultas de psicología.');
        }
        const ok = await esPsicologoDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    const puedeEditarCerrada = ['admin_club', 'administrativo'].includes(req.user.rol);

    const pideCambioAgendaConsultaPsico =
        session.tipo === 'consulta_psicologia' &&
        (Boolean(nuevaFecha || nuevaHoraInicio || nuevaHoraFin) || req.body.nuevoLugarLibre !== undefined);

    const psicologoSoloInformeConsultaCerrada =
        session.estado === 'completada' &&
        session.tipo === 'consulta_psicologia' &&
        req.user.rol === 'psicologo' &&
        !pideCambioAgendaConsultaPsico &&
        !nuevoEspacioId &&
        lugarExterno === undefined;

    if (session.estado === 'completada' && !puedeEditarCerrada && !psicologoSoloInformeConsultaCerrada) {
        res.status(400);
        throw new Error(
            'La sesión ya está cerrada. Reabrila desde la pantalla de detalle para corregir horarios o tiempos.'
        );
    }

    // 1. Preparamos los nuevos valores (si no mandan uno nuevo, mantenemos el viejo)
    const fechaAControlar = nuevaFecha ? new Date(nuevaFecha) : session.fecha;
    const horaInicioAControlar = nuevaHoraInicio || session.horaInicio;
    const horaFinAControlar = nuevaHoraFin || session.horaFin;
    const espacioAControlar = nuevoEspacioId || session.espacio;

    // Consultas individuales: lugar libre (texto), sin control de espacio físico
    if (
        (session.tipo === 'consulta_nutricion' || session.tipo === 'consulta_psicologia') &&
        req.body.nuevoLugarLibre !== undefined
    ) {
        session.lugarLibre = String(req.body.nuevoLugarLibre || '').trim();
    }

    if (session.tipo === 'consulta_psicologia') {
        if (req.body.informeSesion !== undefined) {
            session.informeSesion = String(req.body.informeSesion || '').trim();
        }
        if (req.body.informeVisibleParaAtleta !== undefined) {
            session.informeVisibleParaAtleta = parseInformeVisibilityBool(req.body.informeVisibleParaAtleta);
        }
        if (req.body.informeVisibleParaTutor !== undefined) {
            session.informeVisibleParaTutor = parseInformeVisibilityBool(req.body.informeVisibleParaTutor);
        }
    }

    // 2. Si hay un espacio interno involucrado, el Patovica tiene que revisar los nuevos horarios
    if (
        session.tipo !== 'consulta_nutricion' &&
        session.tipo !== 'consulta_psicologia' &&
        espacioAControlar &&
        !lugarExterno
    ) {
        const spaceInfo = await Space.findById(espacioAControlar);
        if (!spaceInfo) {
            res.status(404);
            throw new Error('El espacio no existe.');
        }

        if (isSpaceUnavailableForSessionDate(spaceInfo, fechaAControlar)) {
            res.status(400);
            throw new Error('El espacio no está disponible en esa fecha.');
        }

        if (!spaceInfo.admiteSubdivision) {
            const inicioDia = new Date(fechaAControlar);
            inicioDia.setUTCHours(0, 0, 0, 0);
            const finDia = new Date(fechaAControlar);
            finDia.setUTCHours(23, 59, 59, 999);

            const sesionesExistentes = await Session.find({
                espacio: espacioAControlar,
                fecha: { $gte: inicioDia, $lte: finDia },
                estado: { $ne: 'cancelada' },
                _id: { $ne: session._id } // Excluimos esta misma sesión del control
            });

            // import { hasTimeOverlap } from '../utils/timeHelper.js';
            const choque = sesionesExistentes.find(s => 
                hasTimeOverlap(horaInicioAControlar, horaFinAControlar, s.horaInicio, s.horaFin)
            );

            if (choque) {
                res.status(400);
                throw new Error(`Choque de horarios: El espacio está ocupado de ${choque.horaInicio} a ${choque.horaFin}`);
            }
        }
    }

    // 3. Si el Patovica dio el OK, aplicamos todos los cambios
    if (nuevaFecha) session.fecha = fechaAControlar;
    if (nuevaHoraInicio) session.horaInicio = horaInicioAControlar;
    if (nuevaHoraFin) session.horaFin = horaFinAControlar;

    if (session.tipo !== 'consulta_nutricion' && session.tipo !== 'consulta_psicologia') {
        if (nuevoEspacioId) {
            session.espacio = nuevoEspacioId;
            session.lugarExterno = null;
            clearSessionRelocation(session);
        } else if (lugarExterno) {
            session.espacio = null;
            session.lugarExterno = lugarExterno;
            clearSessionRelocation(session);
        }
    }

    // Si estaba cancelada, la "revivimos"
    if (session.estado === 'cancelada') {
        session.estado = 'programada';
        session.motivoCancelacion = '';
    }

    const updatedSession = await session.save();
    await populateSessionDetail(updatedSession);

    res.json(updatedSession);
});

async function applySessionRelocationLocation(session, models, { tipo, espacioId, lugarExterno }) {
    const { Session, Space } = models;

    if (session.tipo === 'consulta_nutricion' || session.tipo === 'consulta_psicologia') {
        const err = new Error('Las consultas no usan reubicación de espacio físico.');
        err.statusCode = 400;
        throw err;
    }

    if (tipo === 'externo') {
        const ext = String(lugarExterno || '').trim();
        if (ext.length < 3) {
            const err = new Error('Escribí la sede externa (mín. 3 caracteres).');
            err.statusCode = 400;
            throw err;
        }
        session.espacio = null;
        session.lugarExterno = ext;
        clearSessionRelocation(session);
        return session.save();
    }

    if (!espacioId) {
        const err = new Error('Elegí un espacio del club.');
        err.statusCode = 400;
        throw err;
    }

    const spaceInfo = await Space.findById(espacioId);
    if (!spaceInfo) {
        const err = new Error('El espacio no existe.');
        err.statusCode = 404;
        throw err;
    }
    if (isSpaceUnavailableForSessionDate(spaceInfo, session.fecha)) {
        const err = new Error('El espacio no está disponible en la fecha de esta sesión.');
        err.statusCode = 400;
        throw err;
    }

    if (!spaceInfo.admiteSubdivision) {
        const inicioDia = new Date(session.fecha);
        inicioDia.setUTCHours(0, 0, 0, 0);
        const finDia = new Date(session.fecha);
        finDia.setUTCHours(23, 59, 59, 999);

        const sesionesExistentes = await Session.find({
            espacio: espacioId,
            fecha: { $gte: inicioDia, $lte: finDia },
            estado: { $ne: 'cancelada' },
            _id: { $ne: session._id },
        });

        const choque = sesionesExistentes.find((s) =>
            hasTimeOverlap(session.horaInicio, session.horaFin, s.horaInicio, s.horaFin),
        );
        if (choque) {
            const err = new Error(`Choque de horario: ocupado ${choque.horaInicio}–${choque.horaFin}`);
            err.statusCode = 400;
            throw err;
        }
    }

    session.espacio = espacioId;
    session.lugarExterno = null;
    clearSessionRelocation(session);
    return session.save();
}

// @desc    Sesiones con reubicación pendiente (coach / preparador)
// @route   GET /api/sessions/reubicacion-pendiente
const getPendingRelocations = asyncHandler(async (req, res) => {
    const { Session, Space } = req.models;
    const { misCats, catIds } = await resolveCoachCategoriesFilter(req, res);
    if (!catIds.length) {
        return res.json({ sesiones: [] });
    }

    const sesionesRaw = await Session.find({
        categoria: { $in: catIds },
        reubicacionPendiente: true,
        estado: 'programada',
        ...TRAINING_SESSION_FILTER,
    })
        .populate('categoria', 'nombre')
        .populate('espacioSuspendido', 'nombre tipo')
        .sort({ fecha: 1, horaInicio: 1 });

    const sesiones = await attachFreeSpacesToSessions(Session, Space, sesionesRaw);

    res.json({ sesiones });
});

// @desc    Guardar nuevo lugar para varias sesiones con reubicación pendiente
// @route   PATCH /api/sessions/reubicacion/bulk
const bulkRelocateSessions = asyncHandler(async (req, res) => {
    const { assignments } = req.body;
    if (!Array.isArray(assignments) || !assignments.length) {
        res.status(400);
        throw new Error('Indicá al menos una sesión.');
    }

    const saved = [];
    const errors = [];

    for (const item of assignments) {
        const sessionId = item?.sessionId;
        try {
            const session = await req.models.Session.findById(sessionId);
            if (!session) {
                throw new Error('Sesión no encontrada.');
            }
            if (!session.reubicacionPendiente) {
                throw new Error('Esta sesión ya tiene lugar asignado.');
            }
            await assertStaffCanModifySession(req, session);

            await applySessionRelocationLocation(session, req.models, {
                tipo: item.tipo === 'externo' ? 'externo' : 'espacio',
                espacioId: item.espacioId,
                lugarExterno: item.lugarExterno,
            });

            await populateSessionDetail(session);
            saved.push({ sessionId: String(session._id), session });
        } catch (e) {
            errors.push({
                sessionId: sessionId ? String(sessionId) : '',
                message: e.message || 'No se pudo guardar.',
            });
        }
    }

    if (!saved.length && errors.length) {
        res.status(400);
        throw new Error(errors[0].message || 'No se pudo guardar ninguna sesión.');
    }

    res.json({
        savedCount: saved.length,
        errorCount: errors.length,
        saved,
        errors,
    });
});

// @desc    Sesiones que pueden volver a su espacio original (ya disponible)
// @route   GET /api/sessions/restauracion-disponible
const getRestorableSessions = asyncHandler(async (req, res) => {
    const { Session } = req.models;
    const { misCats, catIds } = await resolveCoachCategoriesFilter(req, res);
    if (!catIds.length) {
        return res.json({ sesiones: [] });
    }

    const sesiones = await findRestorableSessions(Session, catIds);
    res.json({ sesiones });
});

// @desc    Restaurar sesiones al espacio original del club
// @route   PATCH /api/sessions/restauracion/bulk
const bulkRestoreSessions = asyncHandler(async (req, res) => {
    const { sessionIds } = req.body;
    if (!Array.isArray(sessionIds) || !sessionIds.length) {
        res.status(400);
        throw new Error('Indicá al menos una sesión.');
    }

    const { Session, Space } = req.models;
    const saved = [];
    const errors = [];

    for (const sessionId of sessionIds) {
        try {
            const session = await Session.findById(sessionId);
            if (!session) {
                throw new Error('Sesión no encontrada.');
            }
            if (!session.espacioSuspendido) {
                throw new Error('Esta sesión no tiene espacio original.');
            }
            await assertStaffCanModifySession(req, session);
            await restoreSessionToHomeSpace({ Session, Space, sessionDoc: session });
            await populateSessionDetail(session);
            saved.push({ sessionId: String(session._id), session });
        } catch (e) {
            errors.push({
                sessionId: sessionId ? String(sessionId) : '',
                message: e.message || 'No se pudo restaurar.',
            });
        }
    }

    if (!saved.length && errors.length) {
        res.status(400);
        throw new Error(errors[0].message || 'No se pudo restaurar ninguna sesión.');
    }

    res.json({
        savedCount: saved.length,
        errorCount: errors.length,
        saved,
        errors,
    });
});

async function assertStaffCanModifySession(req, session) {
    const { Category } = req.models;

    if (['admin_club', 'administrativo'].includes(req.user.rol)) {
        return;
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return;
    }

    if (req.user.rol === 'preparador_fisico') {
        if (session.tipo !== 'entrenamiento' && session.tipo !== 'partido') {
            res.status(403);
            throw new Error('Solo podés modificar entrenamientos o partidos.');
        }
        const ok = await esPreparadorDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return;
    }

    if (req.user.rol === 'nutricionista') {
        if (session.tipo !== 'consulta_nutricion') {
            res.status(403);
            throw new Error('No autorizado.');
        }
        const ok = await esNutricionistaDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return;
    }

    if (req.user.rol === 'psicologo') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('No autorizado.');
        }
        const ok = await esPsicologoDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
        return;
    }

    res.status(403);
    throw new Error('No autorizado.');
}

const STAFF_CANCEL_REQUIRES_COMUNICADO = [
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
];

const NEWS_TIPOS = new Set(['general', 'urgente', 'deportivo', 'salud']);
const MOTIVO_MARKER = 'Motivo:\n';

function refId(value) {
    if (!value) return value;
    if (typeof value === 'object' && value._id != null) return value._id;
    return value;
}

function motivoCancelacionValido(contenido) {
    const c = String(contenido || '').trim();
    if (!c) return false;
    const idx = c.indexOf(MOTIVO_MARKER);
    const extra = idx >= 0 ? c.slice(idx + MOTIVO_MARKER.length).trim() : c;
    return extra.length >= 5;
}

async function createSessionCancellationNews(req, session, comunicado) {
    const { News } = req.models;

    const isConsultaIndividual =
        session.atletaIndividual &&
        ['consulta_nutricion', 'consulta_psicologia'].includes(session.tipo);

    const tipo = NEWS_TIPOS.has(comunicado.tipo) ? comunicado.tipo : 'urgente';
    const categoriaId = refId(session.categoria);
    const atletaId = refId(session.atletaIndividual);

    await News.create({
        titulo: comunicado.titulo.trim(),
        contenido: comunicado.contenido.trim(),
        autor: req.user._id,
        tipo,
        alcance: isConsultaIndividual ? 'usuario' : 'categoria',
        targetRoles: [],
        targetCategorias: isConsultaIndividual || !categoriaId ? [] : [categoriaId],
        targetUsuarios: isConsultaIndividual && atletaId ? [atletaId] : [],
    });
}

// @desc    Cancelar sesión programada (libera el espacio para alquileres) y avisar por novedades
// @route   PATCH /api/sessions/:id/cancel
const cancelSession = asyncHandler(async (req, res) => {
    const { motivoCancelacion, comunicado } = req.body;
    const { Session } = req.models;

    const session = await Session.findById(req.params.id);
    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (session.estado === 'cancelada') {
        res.status(400);
        throw new Error('Esta sesión ya está cancelada.');
    }

    if (session.estado === 'completada') {
        res.status(400);
        throw new Error(
            'No se puede cancelar una sesión ya completada. Reabrila primero si fue un error.'
        );
    }

    await assertStaffCanModifySession(req, session);

    const staffNeedsComunicado = STAFF_CANCEL_REQUIRES_COMUNICADO.includes(req.user.rol);
    const tituloComunicado = (comunicado?.titulo || '').trim();
    const contenidoComunicado = (comunicado?.contenido || '').trim();

    if (staffNeedsComunicado) {
        if (!tituloComunicado || !contenidoComunicado) {
            res.status(400);
            throw new Error(
                'Debés redactar un comunicado (título y mensaje) para avisar sobre la cancelación.'
            );
        }
        if (!motivoCancelacionValido(contenidoComunicado)) {
            res.status(400);
            throw new Error(
                'El comunicado debe incluir el motivo de la cancelación (texto después de “Motivo:”).'
            );
        }
    }

    if (tituloComunicado && contenidoComunicado) {
        await createSessionCancellationNews(req, session, {
            titulo: tituloComunicado,
            contenido: contenidoComunicado,
            tipo: comunicado?.tipo,
        });
    }

    session.estado = 'cancelada';
    session.motivoCancelacion =
        (motivoCancelacion || '').trim() ||
        contenidoComunicado ||
        'Cancelada por el cuerpo técnico';

    const updatedSession = await session.save();

    await populateSessionDetail(updatedSession);

    res.json(updatedSession);
});

// @desc    Reabrir sesión cerrada (vuelve a programada y borra tiempos ejecutados; mantiene plan y asistencia)
// @route   PATCH /api/sessions/:id/reopen
const reopenSession = asyncHandler(async (req, res) => {
    const { Session, Category } = req.models;

    const session = await Session.findById(req.params.id);
    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (session.estado !== 'completada') {
        res.status(400);
        throw new Error('Solo se pueden reabrir sesiones ya completadas.');
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'preparador_fisico') {
        const ok = await esPreparadorDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'nutricionista') {
        if (session.tipo !== 'consulta_nutricion') {
            res.status(403);
            throw new Error('No autorizado.');
        }
        const ok = await esNutricionistaDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'psicologo') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('No autorizado.');
        }
        const ok = await esPsicologoDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    session.estado = 'programada';
    session.bloquesEjecutados = [];

    const updatedSession = await session.save();
    await populateSessionDetail(updatedSession);

    res.json(updatedSession);
});

// @desc    Asociar un plan de entrenamiento (bloques planificados) a la sesión
// @route   PATCH /api/sessions/:id/plan
const attachTrainingPlanToSession = asyncHandler(async (req, res) => {
    const { Session, Category, TrainingPlan } = req.models;
    const { planEntrenamiento } = req.body;

    if (!planEntrenamiento) {
        res.status(400);
        throw new Error('Indicá el plan de entrenamiento (planEntrenamiento).');
    }

    const session = await Session.findById(req.params.id);
    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (session.tipo === 'consulta_nutricion' || session.tipo === 'consulta_psicologia') {
        res.status(400);
        throw new Error('Las consultas individuales no usan plan de entrenamiento.');
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'preparador_fisico') {
        const ok = await esPreparadorDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (session.estado === 'completada') {
        res.status(400);
        throw new Error('No se puede cambiar el plan de una sesión ya completada.');
    }

    const plan = await TrainingPlan.findById(planEntrenamiento);
    if (!plan) {
        res.status(404);
        throw new Error('Plan de entrenamiento no encontrado');
    }

    session.planEntrenamiento = planEntrenamiento;
    session.bloquesEjecutados = [];

    const updatedSession = await session.save();
    await populateSessionDetail(updatedSession);

    res.json(updatedSession);
});

// @desc    Finalizar sesión y guardar los tiempos reales ejecutados
// @route   PATCH /api/sessions/:id/finish
const finishSession = asyncHandler(async (req, res) => {
    const { Session, Category } = req.models;
    const { bloquesEjecutados } = req.body; // El frontend manda el array con los tiempos del cronómetro

    const session = await Session.findById(req.params.id);
    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (req.user.rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'preparador_fisico') {
        const ok = await esPreparadorDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'nutricionista') {
        if (session.tipo !== 'consulta_nutricion') {
            res.status(403);
            throw new Error('No autorizado.');
        }
        const ok = await esNutricionistaDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    if (req.user.rol === 'psicologo') {
        if (session.tipo !== 'consulta_psicologia') {
            res.status(403);
            throw new Error('No autorizado.');
        }
        const ok = await esPsicologoDeCategoria(Category, session.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta sesión');
        }
    }

    // 1. Calculamos el tiempo total real que se entrenó
    let tiempoTotalReal = 0;
    const bloquesPayload =
        session.tipo === 'consulta_nutricion' || session.tipo === 'consulta_psicologia'
            ? []
            : bloquesEjecutados || [];

    if (session.tipo === 'consulta_psicologia') {
        if (req.body.informeSesion !== undefined) {
            session.informeSesion = String(req.body.informeSesion || '').trim();
        }
        if (req.body.informeVisibleParaAtleta !== undefined) {
            session.informeVisibleParaAtleta = parseInformeVisibilityBool(req.body.informeVisibleParaAtleta);
        }
        if (req.body.informeVisibleParaTutor !== undefined) {
            session.informeVisibleParaTutor = parseInformeVisibilityBool(req.body.informeVisibleParaTutor);
        }
    }
    if (bloquesPayload.length > 0) {
        bloquesPayload.forEach((b) => {
            tiempoTotalReal += (b.duracionRealMinutos || 0);
        });
    }

    // 2. Guardamos el reporte
    session.bloquesEjecutados = bloquesPayload;
    session.estado = 'completada';
    
    // Si ya le habían tomado el RPE (Esfuerzo del 1 al 10), calculamos la carga (RPE x Minutos)
    // Asumiendo que tenés un campo RPE promedio o lo calculás después con el módulo Wellness
    
    const updatedSession = await session.save();

    res.json({
        message: 'Entrenamiento finalizado y tiempos guardados.',
        tiempoTotalReal,
        session: updatedSession
    });
});

// @desc    Confirmar o rechazar asistencia a consulta individual (atleta / tutor)
// @route   PATCH /api/sessions/:id/confirmar-asistencia
const confirmConsultAttendance = asyncHandler(async (req, res) => {
    const { accion, motivoRechazo, atletaId: atletaIdBody } = req.body;
    const { Session, User } = req.models;

    const session = await Session.findById(req.params.id)
        .populate('atletaIndividual', 'nombre apellido tutorPrincipal')
        .populate('categoria', 'nombre');

    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (!['consulta_nutricion', 'consulta_psicologia'].includes(session.tipo)) {
        res.status(400);
        throw new Error('Solo las consultas individuales requieren confirmación de asistencia.');
    }

    if (session.estado === 'cancelada') {
        res.status(400);
        throw new Error('Esta consulta fue cancelada.');
    }

    const estadoActual = session.confirmacionAtleta?.estado;
    if (estadoActual && estadoActual !== 'pendiente') {
        res.status(400);
        throw new Error('Esta consulta ya fue respondida.');
    }

    const atletaIdStr = String(refId(session.atletaIndividual));
    const rol = req.user.rol;

    if (rol === 'atleta') {
        if (String(req.user._id) !== atletaIdStr) {
            res.status(403);
            throw new Error('No autorizado.');
        }
    } else if (rol === 'tutor') {
        const aid = atletaIdBody ? String(atletaIdBody) : atletaIdStr;
        const hijo = await User.findById(aid).select('tutorPrincipal rol').lean();
        if (!hijo || hijo.rol !== 'atleta') {
            res.status(400);
            throw new Error('Atleta no válido.');
        }
        if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            res.status(403);
            throw new Error('No autorizado.');
        }
        if (aid !== atletaIdStr) {
            res.status(400);
            throw new Error('El atleta no coincide con esta consulta.');
        }
    } else {
        res.status(403);
        throw new Error('Solo el atleta o su tutor pueden confirmar la asistencia.');
    }

    const rechazar = accion === 'rechazar';
    const motivoTxt = typeof motivoRechazo === 'string' ? motivoRechazo.trim() : '';
    if (rechazar && motivoTxt.length < 3) {
        res.status(400);
        throw new Error('Indicá un motivo breve si no podés asistir.');
    }

    session.confirmacionAtleta = {
        estado: rechazar ? 'rechazada' : 'confirmada',
        respondidaEn: new Date(),
        respondidaPor: req.user._id,
        motivoRechazo: rechazar ? motivoTxt : '',
    };
    session.markModified('confirmacionAtleta');
    await session.save();

    try {
        await notifyConsultSessionResponded(req.models, session, req.user);
    } catch (e) {
        console.warn('[consult] notify responded:', e.message);
    }

    res.json(session);
});

// @desc    Cambiar atleta de una consulta individual y volver a pedir confirmación
// @route   PATCH /api/sessions/:id/cambiar-atleta
const cambiarAtletaConsulta = asyncHandler(async (req, res) => {
    const { nuevoAtletaId } = req.body;
    const { Session, Enrollment, User } = req.models;

    const session = await Session.findById(req.params.id);
    if (!session) {
        res.status(404);
        throw new Error('Sesión no encontrada');
    }

    if (!['consulta_nutricion', 'consulta_psicologia'].includes(session.tipo)) {
        res.status(400);
        throw new Error('Solo podés cambiar el atleta en consultas individuales.');
    }

    if (session.estado === 'completada' || session.estado === 'cancelada') {
        res.status(400);
        throw new Error('No podés cambiar el atleta de una consulta cerrada o cancelada.');
    }

    await assertStaffCanModifySession(req, session);

    if (!nuevoAtletaId) {
        res.status(400);
        throw new Error('Indicá el nuevo atleta.');
    }

    const enr = await Enrollment.findOne({
        atleta: nuevoAtletaId,
        categoria: session.categoria,
        estado: 'activo',
    });
    if (!enr) {
        res.status(400);
        throw new Error('El atleta no está inscripto activo en esa categoría.');
    }

    session.atletaIndividual = nuevoAtletaId;
    session.set('confirmacionAtleta', {
        estado: 'pendiente',
        motivoRechazo: '',
    });
    await session.save();

    await session.populate([
        { path: 'atletaIndividual', select: 'nombre apellido fotoPerfil' },
        { path: 'categoria', select: 'nombre' },
    ]);

    try {
        const staffUser = await User.findById(req.user._id).select('nombre apellido').lean();
        await notifyConsultSessionCreated(req.models, session, staffUser || req.user);
    } catch (e) {
        console.warn('[consult] notify cambiar atleta:', e.message);
    }

    res.json(session);
});

export {
    createSession,
    takeAttendance,
    getSessionsByCategory,
    getSessionsBySpace,
    generateSessionsFromSchedule,
    reprogramarSession,
    cancelSession,
    reopenSession,
    attachTrainingPlanToSession,
    finishSession,
    getCoachAgenda,
    getCoachSessionStats,
    getPendingRelocations,
    bulkRelocateSessions,
    getRestorableSessions,
    bulkRestoreSessions,
    getSessionStatsById,
    getNutricionistaAgenda,
    getPsicologoAgenda,
    getSessionById,
    confirmConsultAttendance,
    cambiarAtletaConsulta,
};