import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { hasTimeOverlap } from '../utils/timeHelper.js';
import { createAppNotificationsMany } from '../services/appNotification.service.js';

async function esProfeDeCategoria(Category, categoriaId, userId) {
    const cat = await Category.findById(categoriaId).select('profesores');
    if (!cat) return false;
    return (cat.profesores || []).some((p) => p.equals(userId));
}

function startOfUtcDay(d) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x.getTime();
}

async function findTimeConflict(models, { espacio, fecha, horaInicio, horaFin, excludeSessionIds }) {
    const { Session } = models;
    if (!espacio) return null;
    const inicioDia = new Date(fecha);
    inicioDia.setUTCHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setUTCHours(23, 59, 59, 999);
    const q = {
        espacio,
        fecha: { $gte: inicioDia, $lte: finDia },
        estado: { $ne: 'cancelada' },
    };
    if (excludeSessionIds?.length) q._id = { $nin: excludeSessionIds };
    const sesiones = await Session.find(q);
    return sesiones.find((s) => hasTimeOverlap(horaInicio, horaFin, s.horaInicio, s.horaFin)) || null;
}

async function notifyMany(models, usuarios, payload) {
    await createAppNotificationsMany(models, usuarios, payload);
}

// @route POST /api/session-swaps
const proposeSpaceSwap = asyncHandler(async (req, res) => {
    const { sesionOrigen, sesionDestino, mensaje } = req.body;
    const { SwapRequest, Session, Category, Notification } = req.models;

    if (!sesionOrigen || !sesionDestino) {
        res.status(400);
        throw new Error('Enviá sesionOrigen y sesionDestino.');
    }
    if (String(sesionOrigen) === String(sesionDestino)) {
        res.status(400);
        throw new Error('Las dos sesiones tienen que ser distintas.');
    }

    const sO = await Session.findById(sesionOrigen).populate('categoria', 'nombre profesores');
    const sD = await Session.findById(sesionDestino).populate('categoria', 'nombre profesores');
    if (!sO || !sD) {
        res.status(404);
        throw new Error('Sesión no encontrada.');
    }

    const rol = req.user.rol;
    const adminLike = ['admin_club', 'administrativo'].includes(rol);
    if (rol === 'profe') {
        const ok = await esProfeDeCategoria(Category, sO.categoria?._id || sO.categoria, req.user._id);
        if (!ok) {
            res.status(403);
            throw new Error('Solo podés proponer intercambios para sesiones de tus categorías.');
        }
    } else if (!adminLike) {
        res.status(403);
        throw new Error('No autorizado.');
    }

    if (sO.estado !== 'programada' || sD.estado !== 'programada') {
        res.status(400);
        throw new Error('Solo se pueden intercambiar espacios entre sesiones programadas.');
    }

    if (startOfUtcDay(sO.fecha) !== startOfUtcDay(sD.fecha)) {
        res.status(400);
        throw new Error('Las sesiones tienen que ser el mismo día.');
    }
    if (sO.horaInicio !== sD.horaInicio || sO.horaFin !== sD.horaFin) {
        res.status(400);
        throw new Error('Las sesiones tienen que tener el mismo horario (inicio y fin).');
    }
    if (String(sO.espacio || '') === String(sD.espacio || '')) {
        res.status(400);
        throw new Error('Las sesiones ya usan el mismo espacio.');
    }

    const catO = sO.categoria?._id || sO.categoria;
    const catD = sD.categoria?._id || sD.categoria;
    if (String(catO) === String(catD)) {
        res.status(400);
        throw new Error('El intercambio entre categorías distintas requiere sesiones de categorías diferentes.');
    }

    const dup = await SwapRequest.findOne({
        sesionOrigen,
        sesionDestino,
        estado: 'pendiente',
    });
    if (dup) {
        res.status(400);
        throw new Error('Ya hay una solicitud pendiente para este par de sesiones.');
    }

    const destinatariosPrev = (sD.categoria?.profesores || [])
        .filter((p) => !p.equals(req.user._id))
        .map((p) => p.toString());
    if (!destinatariosPrev.length && rol === 'profe') {
        res.status(400);
        throw new Error('La otra categoría no tiene otros profesores asignados para recibir la solicitud. Pedile al admin que asigne un profe o que haga el cambio.');
    }

    const nota = (mensaje || '').trim().slice(0, 500);
    const swap = await SwapRequest.create({
        solicitante: req.user._id,
        sesionOrigen: sO._id,
        sesionDestino: sD._id,
        mensaje: nota,
    });

    const destinatarios = destinatariosPrev;
    const nombreOrigen = sO.categoria?.nombre || 'Categoría';
    const nombreDestino = sD.categoria?.nombre || 'Categoría';

    await notifyMany(req.models, destinatarios, {
        tipo: 'intercambio_espacio',
        titulo: 'Intercambio de espacio',
        mensaje: `${nombreOrigen} quiere intercambiar espacio con ${nombreDestino} el mismo turno.${nota ? ` Nota: ${nota}` : ''} Revisá GET /session-swaps y aceptá o rechazá.`,
        referencia: swap._id,
    });

    res.status(201).json({
        message: 'Solicitud enviada a los profes de la otra categoría.',
        swap,
    });
});

// @route GET /api/session-swaps
const listMySwapRequests = asyncHandler(async (req, res) => {
    const { SwapRequest, Session, Category } = req.models;
    const pend = await SwapRequest.find({ estado: 'pendiente' })
        .populate({
            path: 'sesionOrigen',
            select: 'fecha horaInicio horaFin espacio categoria',
            populate: { path: 'categoria', select: 'profesores nombre' },
        })
        .populate({
            path: 'sesionDestino',
            select: 'fecha horaInicio horaFin espacio categoria',
            populate: { path: 'categoria', select: 'profesores nombre' },
        })
        .populate('solicitante', 'nombre apellido')
        .sort({ createdAt: -1 })
        .limit(80);

    const salientes = [];
    const entrantes = [];
    for (const sw of pend) {
        if (String(sw.solicitante) === String(req.user._id)) {
            salientes.push(sw);
            continue;
        }
        const catId = sw.sesionDestino?.categoria?._id || sw.sesionDestino?.categoria;
        if (catId && (await esProfeDeCategoria(Category, catId, req.user._id))) {
            entrantes.push(sw);
        }
    }

    res.json({ salientes, entrantes });
});

// @route PATCH /api/session-swaps/:id/accept
const acceptSpaceSwap = asyncHandler(async (req, res) => {
    const { SwapRequest, Session, Category, Space, Notification } = req.models;
    const swap = await SwapRequest.findById(req.params.id)
        .populate('sesionOrigen')
        .populate('sesionDestino');

    if (!swap || swap.estado !== 'pendiente') {
        res.status(404);
        throw new Error('Solicitud no encontrada o ya procesada.');
    }

    const idO = swap.sesionOrigen?._id || swap.sesionOrigen;
    const idD = swap.sesionDestino?._id || swap.sesionDestino;
    const sO = await Session.findById(idO);
    const sD = await Session.findById(idD);
    if (!sO || !sD) {
        res.status(400);
        throw new Error('Sesiones ya no existen.');
    }

    const rol = req.user.rol;
    const adminLike = ['admin_club', 'administrativo'].includes(rol);
    let puede = adminLike;
    if (rol === 'profe') {
        puede = await esProfeDeCategoria(Category, sD.categoria, req.user._id);
    }
    if (!puede) {
        res.status(403);
        throw new Error('Solo un profesor de la categoría de la sesión destino (o admin) puede aceptar.');
    }

    if (sO.estado !== 'programada' || sD.estado !== 'programada') {
        res.status(400);
        throw new Error('Las sesiones ya no están programadas.');
    }
    if (startOfUtcDay(sO.fecha) !== startOfUtcDay(sD.fecha) || sO.horaInicio !== sD.horaInicio || sO.horaFin !== sD.horaFin) {
        res.status(400);
        throw new Error('Las sesiones dejaron de coincidir en día u horario.');
    }
    if (String(sO.espacio || '') === String(sD.espacio || '')) {
        res.status(400);
        throw new Error('Las sesiones ya comparten el mismo espacio.');
    }

    const espacioA = sO.espacio;
    const espacioB = sD.espacio;
    const spaceA = espacioA ? await Space.findById(espacioA) : null;
    const spaceB = espacioB ? await Space.findById(espacioB) : null;

    if (spaceA && spaceA.estado !== 'disponible') {
        res.status(400);
        throw new Error('El espacio de la sesión origen no está disponible.');
    }
    if (spaceB && spaceB.estado !== 'disponible') {
        res.status(400);
        throw new Error('El espacio de la sesión destino no está disponible.');
    }

    if (spaceA && !spaceA.admiteSubdivision) {
        const ch = await findTimeConflict(req.models, {
            espacio: espacioB,
            fecha: sO.fecha,
            horaInicio: sO.horaInicio,
            horaFin: sO.horaFin,
            excludeSessionIds: [sD._id],
        });
        if (ch) {
            res.status(400);
            throw new Error(`No se puede mover: el espacio destino choca con otra sesión (${ch.horaInicio}–${ch.horaFin}).`);
        }
    }
    if (spaceB && !spaceB.admiteSubdivision) {
        const ch = await findTimeConflict(req.models, {
            espacio: espacioA,
            fecha: sD.fecha,
            horaInicio: sD.horaInicio,
            horaFin: sD.horaFin,
            excludeSessionIds: [sO._id],
        });
        if (ch) {
            res.status(400);
            throw new Error(`No se puede mover: el espacio origen choca con otra sesión (${ch.horaInicio}–${ch.horaFin}).`);
        }
    }

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    try {
        sO.espacio = espacioB;
        sD.espacio = espacioA;
        await sO.save({ session: dbSession });
        await sD.save({ session: dbSession });
        swap.estado = 'aceptada';
        await swap.save({ session: dbSession });
        await dbSession.commitTransaction();
    } catch (e) {
        await dbSession.abortTransaction();
        throw e;
    } finally {
        dbSession.endSession();
    }

    await notifyMany(req.models, [swap.solicitante], {
        tipo: 'general',
        titulo: 'Intercambio aceptado',
        mensaje: 'El otro equipo aceptó intercambiar espacios. Las sesiones ya están actualizadas.',
        referencia: swap._id,
    });

    res.json({ message: 'Intercambio realizado.', sesionOrigen: sO, sesionDestino: sD });
});

// @route PATCH /api/session-swaps/:id/reject
const rejectSpaceSwap = asyncHandler(async (req, res) => {
    const { SwapRequest, Session, Category, Notification } = req.models;
    const swap = await SwapRequest.findById(req.params.id);

    if (!swap || swap.estado !== 'pendiente') {
        res.status(404);
        throw new Error('Solicitud no encontrada o ya procesada.');
    }

    const sD = await Session.findById(swap.sesionDestino).populate('categoria', 'profesores');
    const rol = req.user.rol;
    const adminLike = ['admin_club', 'administrativo'].includes(rol);
    let puede = adminLike;
    if (rol === 'profe' && sD) {
        puede = await esProfeDeCategoria(Category, sD.categoria, req.user._id);
    }
    if (!puede) {
        res.status(403);
        throw new Error('Solo un profesor de la categoría destino (o admin) puede rechazar.');
    }

    swap.estado = 'rechazada';
    await swap.save();

    await notifyMany(req.models, [swap.solicitante], {
        tipo: 'general',
        titulo: 'Intercambio rechazado',
        mensaje: 'El otro equipo rechazó la solicitud de intercambio de espacio.',
        referencia: swap._id,
    });

    res.json({ message: 'Solicitud rechazada.' });
});

// @route PATCH /api/session-swaps/:id/cancel
const cancelSpaceSwap = asyncHandler(async (req, res) => {
    const { SwapRequest } = req.models;
    const swap = await SwapRequest.findById(req.params.id);

    if (!swap || swap.estado !== 'pendiente') {
        res.status(404);
        throw new Error('Solicitud no encontrada o ya procesada.');
    }
    if (String(swap.solicitante) !== String(req.user._id)) {
        res.status(403);
        throw new Error('Solo quien envió la solicitud puede cancelarla.');
    }

    swap.estado = 'cancelada';
    await swap.save();
    res.json({ message: 'Solicitud cancelada.' });
});

export { proposeSpaceSwap, listMySwapRequests, acceptSpaceSwap, rejectSpaceSwap, cancelSpaceSwap };
