import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { COURT_DEPORTES } from '../models/courtMetric.model.js';
import { courtNow, idOf } from '../services/matchDerive.js';
import { buildInforme, manualValue, notifyMatchReport } from '../services/matchReport.service.js';

const ICONOS = ['circulo', 'x', 'cuadrado', 'triangulo', 'diamante'];
const TIPOS = ['numero', 'texto', 'si_no', 'porcentaje', 'total'];

function fail(res, status, message) {
    res.status(status);
    throw new Error(message);
}

function clampInt(value, min, max, fallback) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function normalizeSheet(body) {
    const nombre = String(body?.nombre || '').trim();
    if (!nombre) {
        const err = new Error('La planilla necesita un nombre.');
        err.statusCode = 400;
        throw err;
    }
    const deporteRaw = String(body?.cancha?.deporte || body?.deporte || 'basquet').trim();
    const deporte = COURT_DEPORTES.includes(deporteRaw) ? deporteRaw : 'basquet';
    const imagenUrl = String(body?.cancha?.imagenUrl || body?.imagenUrl || '').trim() || `preset:${deporte}`;
    const relojIn = body?.reloj || {};
    const reloj = {
        activo: relojIn.activo !== false,
        periodos: clampInt(relojIn.periodos, 1, 12, 4),
        minutosPorPeriodo: clampInt(relojIn.minutosPorPeriodo, 1, 60, 10),
        jugadoresEnCancha: clampInt(relojIn.jugadoresEnCancha, 1, 30, 5),
    };

    const rawCampos = Array.isArray(body?.campos) ? body.campos : [];
    if (!rawCampos.length) {
        const err = new Error('Agregá al menos un dato a la planilla.');
        err.statusCode = 400;
        throw err;
    }
    const idMap = new Map();
    const campos = rawCampos.map((campo) => {
        const prev = String(campo?.id || campo?._id || '');
        const _id = mongoose.isValidObjectId(prev) ? new mongoose.Types.ObjectId(prev) : new mongoose.Types.ObjectId();
        if (prev) idMap.set(prev, String(_id));
        const tipo = TIPOS.includes(campo?.tipo) ? campo.tipo : 'numero';
        const alcance = campo?.alcance === 'partido' ? 'partido' : 'persona';
        return {
            _id,
            etiqueta: String(campo?.etiqueta || '').trim().slice(0, 80) || 'Dato',
            alcance,
            tipo,
            iconoAnoto: ICONOS.includes(campo?.iconoAnoto) ? campo.iconoAnoto : 'circulo',
            iconoErro: ICONOS.includes(campo?.iconoErro) ? campo.iconoErro : 'x',
            camposTotal: Array.isArray(campo?.camposTotal) ? campo.camposTotal.map(String) : [],
        };
    });
    const summableIds = new Set(
        campos
            .filter((campo) => campo.tipo === 'porcentaje' || campo.tipo === 'total')
            .map((campo) => String(campo._id)),
    );
    for (const campo of campos) {
        if (campo.tipo !== 'total') {
            campo.camposTotal = [];
            continue;
        }
        campo.camposTotal = [...new Set(
            campo.camposTotal
                .map((id) => idMap.get(id) || id)
                .map(String)
                .filter((id) => summableIds.has(id) && id !== String(campo._id)),
        )];
    }
    const byId = new Map(campos.map((campo) => [String(campo._id), campo]));
    const visitState = new Map();
    const visit = (id) => {
        const mark = visitState.get(id) || 0;
        if (mark === 1) return true;
        if (mark === 2) return false;
        visitState.set(id, 1);
        const campo = byId.get(id);
        if (campo?.tipo === 'total') {
            const kept = [];
            for (const child of campo.camposTotal) {
                if (visit(child)) continue;
                kept.push(child);
            }
            campo.camposTotal = kept;
        }
        visitState.set(id, 2);
        return false;
    };
    for (const campo of campos) visit(String(campo._id));
    return { nombre, cancha: { deporte, imagenUrl }, reloj, campos };
}

async function loadPartido(req, res) {
    const session = await req.models.Session.findById(req.params.id);
    if (!session) fail(res, 404, 'Sesión no encontrada');
    if (session.tipo !== 'partido') fail(res, 400, 'Esto es solo para partidos.');
    if (session.estado === 'cancelada') fail(res, 400, 'El partido está cancelado.');
    const rol = req.user.rol;
    if (rol === 'admin_club') return session;
    if (rol === 'profe') {
        const ok = await req.models.Category.findOne({ _id: session.categoria, profesores: req.user._id });
        if (!ok) fail(res, 403, 'No sos profesor de esta categoría.');
        return session;
    }
    fail(res, 403, 'Los partidos los gestiona el cuerpo técnico principal.');
    return session;
}

function assertEditable(session, res) {
    if (session.informeEnviadoEn) {
        fail(res, 400, 'El informe ya se envió. Corregilo para volver a editar.');
    }
}

function listaJugadores(session) {
    return (session.listaBuenaFe || [])
        .filter((row) => row.tipoPersona !== 'staff')
        .map((row) => idOf(row.usuario));
}

function assertPlayerOnLista(session, usuario, res) {
    if (!listaJugadores(session).includes(String(usuario))) {
        fail(res, 400, 'Ese jugador no está en la lista de buena fe.');
    }
}

async function present(session) {
    await session.populate('listaBuenaFe.usuario', 'nombre apellido fotoPerfil');
    return session;
}

export const listMatchSheets = asyncHandler(async (req, res) => {
    const sheets = await req.models.MatchSheet.find().sort({ nombre: 1 }).lean();
    res.json(sheets);
});

export const createMatchSheet = asyncHandler(async (req, res) => {
    let data;
    try {
        data = normalizeSheet(req.body);
    } catch (err) {
        fail(res, err.statusCode || 400, err.message);
    }
    const sheet = await req.models.MatchSheet.create({ ...data, creadoPor: req.user._id });
    res.status(201).json(sheet);
});

export const updateMatchSheet = asyncHandler(async (req, res) => {
    const sheet = await req.models.MatchSheet.findById(req.params.sheetId);
    if (!sheet) fail(res, 404, 'Planilla no encontrada.');
    let data;
    try {
        data = normalizeSheet(req.body);
    } catch (err) {
        fail(res, err.statusCode || 400, err.message);
    }
    Object.assign(sheet, data);
    await sheet.save();
    const saved = sheet.toObject();
    await req.models.Session.updateMany(
        { tipo: 'partido', 'planilla.sheetId': sheet._id, informeEnviadoEn: null },
        {
            $set: {
                'planilla.nombre': saved.nombre,
                'planilla.cancha': saved.cancha,
                'planilla.reloj': saved.reloj,
                'planilla.campos': saved.campos,
            },
        },
    );
    res.json(sheet);
});

export const deleteMatchSheet = asyncHandler(async (req, res) => {
    const sheet = await req.models.MatchSheet.findById(req.params.sheetId);
    if (!sheet) fail(res, 404, 'Planilla no encontrada.');
    await sheet.deleteOne();
    res.json({ ok: true });
});

export function normalizeLista(rows) {
    const seen = new Set();
    const lista = [];
    for (const row of Array.isArray(rows) ? rows : []) {
        const usuario = idOf(row?.usuario);
        if (!mongoose.isValidObjectId(usuario) || seen.has(usuario)) continue;
        seen.add(usuario);
        lista.push({
            usuario,
            tipoPersona: row?.tipoPersona === 'staff' ? 'staff' : 'jugador',
            dorsal: String(row?.dorsal || '').trim().slice(0, 4),
        });
    }
    return lista;
}

export const saveLista = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const lista = normalizeLista(req.body?.lista);
    if (!lista.some((row) => row.tipoPersona === 'jugador')) {
        fail(res, 400, 'La lista necesita al menos un jugador.');
    }
    session.listaBuenaFe = lista;
    const allowed = new Set(listaJugadores(session));
    session.jugadas = (session.jugadas || []).filter((play) => allowed.has(idOf(play.usuario)));
    await session.save();
    res.json(await present(session));
});

export const applyPlanilla = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const sheet = await req.models.MatchSheet.findById(req.body?.planillaId);
    if (!sheet) fail(res, 404, 'Planilla no encontrada.');
    const same = String(session.planilla?.sheetId || '') === String(sheet._id);
    session.planilla = {
        sheetId: sheet._id,
        nombre: sheet.nombre,
        cancha: sheet.cancha,
        reloj: sheet.reloj,
        campos: sheet.campos.map((campo) => (campo.toObject ? campo.toObject() : campo)),
    };
    if (!same) {
        session.jugadas = [];
        session.posesiones = [];
        session.relojEventos = [];
        session.planillaValores = { partido: {}, personas: [] };
    }
    await session.save();
    res.json(await present(session));
});

export const savePlanillaValores = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const campos = session.planilla?.campos || [];
    const byId = new Map(campos.map((campo) => [String(campo._id), campo]));
    const partido = {};
    const rawPartido = req.body?.partido || {};
    for (const [key, value] of Object.entries(rawPartido)) {
        const campo = byId.get(String(key));
        if (!campo || campo.alcance !== 'partido' || campo.tipo === 'porcentaje' || campo.tipo === 'total') continue;
        const parsed = manualValue(campo, value);
        if (parsed !== undefined && parsed !== null) partido[String(campo._id)] = parsed;
    }
    const personas = [];
    for (const row of Array.isArray(req.body?.personas) ? req.body.personas : []) {
        const usuario = idOf(row?.usuario);
        if (!mongoose.isValidObjectId(usuario)) continue;
        const valores = {};
        for (const [key, value] of Object.entries(row?.valores || {})) {
            const campo = byId.get(String(key));
            if (!campo || campo.alcance !== 'persona' || campo.tipo === 'porcentaje' || campo.tipo === 'total') continue;
            const parsed = manualValue(campo, value);
            if (parsed !== undefined && parsed !== null) valores[String(campo._id)] = parsed;
        }
        personas.push({ usuario, valores });
    }
    session.planillaValores = { partido, personas };
    session.markModified('planillaValores');
    await session.save();
    res.json(await present(session));
});

export const addRelojEvento = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    if (!session.planilla?.reloj?.activo) fail(res, 400, 'Esta planilla no usa reloj.');
    const tipo = String(req.body?.tipo || '');
    const allowed = ['inicio', 'pausa', 'fin_periodo', 'quinteto', 'cambio'];
    if (!allowed.includes(tipo)) fail(res, 400, 'Acción de reloj inválida.');
    const max = session.planilla.reloj.jugadoresEnCancha || 5;
    const jugadores = new Set(listaJugadores(session));
    const evento = {
        tipo,
        periodo: clampInt(req.body?.periodo, 1, 12, 1),
        relojMs: Math.max(0, Math.floor(Number(req.body?.relojMs) || 0)),
        marcaEn: new Date(),
    };
    if (tipo === 'quinteto') {
        const enCancha = [...new Set((req.body?.enCancha || []).map(idOf))].filter((id) => jugadores.has(id));
        if (!enCancha.length || enCancha.length > max) {
            fail(res, 400, `Elegí hasta ${max} jugadores de la lista.`);
        }
        evento.enCancha = enCancha;
    }
    if (tipo === 'cambio') {
        const on = courtNow(session.relojEventos);
        const sale = idOf(req.body?.sale);
        const entra = idOf(req.body?.entra);
        if (!on.includes(sale)) fail(res, 400, 'El jugador que sale no está en cancha.');
        if (!jugadores.has(entra) || on.includes(entra)) fail(res, 400, 'Elegí un suplente de la lista.');
        evento.sale = sale;
        evento.entra = entra;
    }
    if (tipo === 'inicio' && !courtNow(session.relojEventos).length && tipo !== 'quinteto') {
        const hasLineup = (session.relojEventos || []).some((ev) => ev.tipo === 'quinteto');
        if (!hasLineup) fail(res, 400, 'Primero elegí quiénes entran a la cancha.');
    }
    session.relojEventos.push(evento);
    await session.save();
    res.status(201).json(await present(session));
});

export const addJugada = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const campo = (session.planilla?.campos || []).find((item) => String(item._id) === String(req.body?.campoId));
    if (!campo || campo.tipo !== 'porcentaje') fail(res, 400, 'Elegí una estadística de la planilla.');
    const resultado = req.body?.resultado === 'anoto' ? 'anoto' : req.body?.resultado === 'erro' ? 'erro' : '';
    if (!resultado) fail(res, 400, 'Marcá si anotó o erró.');
    const usuario = idOf(req.body?.usuario);
    assertPlayerOnLista(session, usuario, res);
    const on = courtNow(session.relojEventos);
    if (on.length && !on.includes(usuario)) fail(res, 400, 'Ese jugador no está en cancha.');
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        fail(res, 400, 'Tocá un punto de la cancha.');
    }
    session.jugadas.push({
        x,
        y,
        campoId: String(campo._id),
        resultado,
        usuario,
        periodo: clampInt(req.body?.periodo, 1, 12, 1),
        relojMs: Math.max(0, Math.floor(Number(req.body?.relojMs) || 0)),
    });
    await session.save();
    res.status(201).json(await present(session));
});

export const updateJugada = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const play = session.jugadas.id(req.params.jugadaId);
    if (!play) fail(res, 404, 'Jugada no encontrada.');
    if (req.body?.campoId) {
        const campo = (session.planilla?.campos || []).find((item) => String(item._id) === String(req.body.campoId));
        if (!campo || campo.tipo !== 'porcentaje') fail(res, 400, 'Elegí una estadística de la planilla.');
        play.campoId = String(campo._id);
    }
    if (req.body?.resultado) {
        if (!['anoto', 'erro'].includes(req.body.resultado)) fail(res, 400, 'Marcá si anotó o erró.');
        play.resultado = req.body.resultado;
    }
    if (req.body?.usuario) {
        const usuario = idOf(req.body.usuario);
        assertPlayerOnLista(session, usuario, res);
        play.usuario = usuario;
    }
    await session.save();
    res.json(await present(session));
});

export const deleteJugada = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const play = session.jugadas.id(req.params.jugadaId);
    if (!play) fail(res, 404, 'Jugada no encontrada.');
    play.deleteOne();
    await session.save();
    res.json(await present(session));
});

export const addPosesion = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const equipo = req.body?.equipo === 'rival' ? 'rival' : req.body?.equipo === 'nosotros' ? 'nosotros' : '';
    if (!equipo) fail(res, 400, 'Elegí qué equipo tiene la pelota.');
    session.posesiones.push({
        equipo,
        periodo: clampInt(req.body?.periodo, 1, 12, 1),
        relojMs: Math.max(0, Math.floor(Number(req.body?.relojMs) || 0)),
    });
    await session.save();
    res.status(201).json(await present(session));
});

export const updatePosesion = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const row = session.posesiones.id(req.params.posesionId);
    if (!row) fail(res, 404, 'Posesión no encontrada.');
    if (req.body?.equipo) {
        if (!['nosotros', 'rival'].includes(req.body.equipo)) fail(res, 400, 'Elegí un equipo.');
        row.equipo = req.body.equipo;
    }
    await session.save();
    res.json(await present(session));
});

export const deletePosesion = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    assertEditable(session, res);
    const row = session.posesiones.id(req.params.posesionId);
    if (!row) fail(res, 404, 'Posesión no encontrada.');
    row.deleteOne();
    await session.save();
    res.json(await present(session));
});

async function readSessionForInforme(req, res) {
    const session = await req.models.Session.findById(req.params.id)
        .populate('listaBuenaFe.usuario', 'nombre apellido');
    if (!session || session.tipo !== 'partido') fail(res, 404, 'Partido no encontrado.');
    const rol = req.user.rol;
    const uid = String(req.user._id);
    if (rol === 'admin_club' || rol === 'dirigente') return { session, full: true };
    if (rol === 'profe') {
        const ok = await req.models.Category.findOne({ _id: session.categoria, profesores: req.user._id });
        if (ok) return { session, full: true };
    }
    const listed = (session.listaBuenaFe || []).some((row) => idOf(row.usuario) === uid);
    if (!listed) fail(res, 403, 'Este informe es para quien jugó o estuvo en el partido.');
    if (!session.informeEnviadoEn && rol !== 'profe') fail(res, 403, 'El informe todavía no se envió.');
    return { session, full: false, userId: uid };
}

export const getInforme = asyncHandler(async (req, res) => {
    const access = await readSessionForInforme(req, res);
    res.json(buildInforme(access.session, { full: access.full, userId: access.userId || req.user._id }));
});

export const enviarInforme = asyncHandler(async (req, res) => {
    const session = await loadPartido(req, res);
    const accion = req.body?.accion === 'corregir' ? 'corregir' : 'enviar';
    if (accion === 'corregir') {
        session.informeEnviadoEn = null;
        if (session.estado === 'completada') session.estado = 'programada';
        await session.save();
        res.json(await present(session));
        return;
    }
    assertEditable(session, res);
    if (!listaJugadores(session).length) fail(res, 400, 'La lista de buena fe necesita al menos un jugador.');
    if (!session.planilla?.campos?.length) fail(res, 400, 'Elegí una planilla para el partido.');
    const live = req.body?.relojAhora;
    if (live?.corriendo) {
        session.relojEventos.push({
            tipo: 'pausa',
            periodo: clampInt(live.periodo, 1, 12, 1),
            relojMs: Math.max(0, Math.floor(Number(live.relojMs) || 0)),
        });
    }
    session.informeEnviadoEn = new Date();
    session.estado = 'completada';
    await session.save();
    try {
        await notifyMatchReport(req.models, session);
    } catch (err) {
        console.warn('[partido] notify:', err.message);
    }
    res.json(await present(session));
});
