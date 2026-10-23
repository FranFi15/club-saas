import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import {
    resolveDiscountPeople,
    quoteEventTickets,
} from '../services/eventPricing.service.js';
import {
    issueTicketsForOrder,
    ticketsWithQr,
    expireStaleHolds,
    releaseOrderHold,
    normalizeAsistentes,
    bindHolderSeats,
    listOccupiedSeats,
} from '../services/eventTicketIssue.service.js';
import { parseEventTicketToken } from '../services/eventTicketToken.service.js';
import { createEventOrderMpPreference } from '../services/eventMp.service.js';
import { calendarPartsInTz, DEFAULT_CLUB_TIMEZONE, todayYmdClub, zonedWallTimeToDate } from '../utils/timeHelper.js';

const HOLD_MS = 15 * 60 * 1000;
const ADMIN_WRITE = ['admin_club', 'administrativo'];
const EVENT_MANAGE = ['admin_club'];
const ADMIN_READ = ['admin_club', 'dirigente', 'administrativo'];
const SCAN_ROLES = ['admin_club', 'administrativo', 'control_ingreso'];
const MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

function priceHolders(holders, quote) {
    return (holders || []).map((holder, index) => ({
        ...holder,
        precio: quote.lineas?.[index]?.precio ?? quote.precioLista,
        conDescuento: !!quote.lineas?.[index]?.conDescuento,
    }));
}

function slugify(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || `evento-${Date.now().toString(36)}`;
}

async function uniqueSlug(ClubEvent, base, excludeId) {
    let slug = slugify(base);
    let n = 0;
    for (;;) {
        const candidate = n === 0 ? slug : `${slug}-${n}`;
        const q = { slug: candidate };
        if (excludeId) q._id = { $ne: excludeId };
        const exists = await ClubEvent.exists(q);
        if (!exists) return candidate;
        n += 1;
    }
}

function publicEventCard(ev) {
    return {
        _id: ev._id,
        titulo: ev.titulo,
        descripcion: ev.descripcion,
        imagenUrl: ev.imagenUrl,
        mapaEstadioUrl: ev.mapaEstadioUrl || '',
        secciones: (ev.secciones || []).map((section) => ({
            _id: section._id,
            nombre: section.nombre,
            filas: section.filas,
            asientosPorFila: section.asientosPorFila,
            tipoEntrada: section.tipoEntrada,
            x: section.x,
            y: section.y,
            w: section.w || 0,
            h: section.h || 0,
        })),
        lugar: ev.lugar,
        fechaInicio: ev.fechaInicio,
        fechaFin: ev.fechaFin,
        slug: ev.slug,
        tiposEntrada: (ev.tiposEntrada || [])
            .filter((t) => t.activo)
            .map((t) => ({
                _id: t._id,
                nombre: t.nombre,
                precio: t.precio,
                cupo: t.cupo,
                disponibles: Math.max(0, Number(t.cupo) - Number(t.vendidas || 0)),
            })),
    };
}

function normalizeSecciones(raw, tipos) {
    const list = Array.isArray(raw) ? raw : [];
    const tipoIds = new Set((tipos || []).map((tipo) => String(tipo._id)));
    const out = [];
    for (const section of list) {
        let tipoId = section?.tipoEntrada ? String(section.tipoEntrada) : '';
        const tipoIndex = Number(section?.tipoIndex);
        if (!tipoIds.has(tipoId) && Number.isInteger(tipoIndex) && tipos[tipoIndex]) {
            tipoId = String(tipos[tipoIndex]._id);
        }
        if (!tipoIds.has(tipoId)) continue;
        out.push({
            ...(section._id && mongoose.Types.ObjectId.isValid(String(section._id))
                ? { _id: section._id }
                : {}),
            nombre: String(section.nombre || '').trim() || 'Sección',
            filas: Math.max(1, Math.min(40, Math.floor(Number(section.filas) || 1))),
            asientosPorFila: Math.max(1, Math.min(80, Math.floor(Number(section.asientosPorFila) || 1))),
            tipoEntrada: tipoId,
            x: Math.max(0, Math.min(100, Number(section.x) || 50)),
            y: Math.max(0, Math.min(100, Number(section.y) || 50)),
            w: Math.max(0, Math.min(100, Number(section.w) || 0)),
            h: Math.max(0, Math.min(100, Number(section.h) || 0)),
        });
    }
    return out;
}

function applySectionCupos(tipos, secciones) {
    const sums = {};
    for (const section of secciones || []) {
        const id = String(section.tipoEntrada);
        sums[id] = (sums[id] || 0) + section.filas * section.asientosPorFila;
    }
    for (const tipo of tipos || []) {
        const seats = sums[String(tipo._id)];
        if (!seats) continue;
        tipo.cupo = Math.max(Number(tipo.vendidas) || 0, seats);
    }
}

function normalizeTipos(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((t) => ({
        ...(t._id ? { _id: t._id } : {}),
        nombre: String(t.nombre || '').trim(),
        precio: Math.max(0, Number(t.precio) || 0),
        cupo: Math.max(0, Math.floor(Number(t.cupo) || 0)),
        vendidas: Math.max(0, Math.floor(Number(t.vendidas) || 0)),
        activo: t.activo !== false,
    }));
}

function normalizeReglas(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((r) => ({
        ...(r._id ? { _id: r._id } : {}),
        nombre: String(r.nombre || '').trim() || 'Descuento',
        roles: Array.isArray(r.roles) ? r.roles.filter((x) => MEMBER_ROLES.includes(x)) : [],
        cuotasSociales: Array.isArray(r.cuotasSociales) ? r.cuotasSociales : [],
        planes: Array.isArray(r.planes) ? r.planes : [],
        modo: ['porcentaje', 'precio_fijo', 'gratis'].includes(r.modo) ? r.modo : 'porcentaje',
        valor: Math.max(0, Number(r.valor) || 0),
        maxEntradasConDescuento: Math.max(1, Math.floor(Number(r.maxEntradasConDescuento) || 1)),
        activo: r.activo !== false,
    }));
}

async function reserveCupo(event, tipoEntradaId, cantidad) {
    const tipo = event.tiposEntrada.id(tipoEntradaId);
    if (!tipo || !tipo.activo) {
        const err = new Error('Tipo de entrada no disponible.');
        err.statusCode = 400;
        throw err;
    }
    const disponibles = Math.max(0, Number(tipo.cupo) - Number(tipo.vendidas || 0));
    if (cantidad > disponibles) {
        const err = new Error(
            disponibles <= 0
                ? 'No quedan entradas de este tipo.'
                : `Solo quedan ${disponibles} entrada(s) de este tipo.`,
        );
        err.statusCode = 400;
        throw err;
    }
    tipo.vendidas = Number(tipo.vendidas || 0) + cantidad;
    await event.save();
    return tipo;
}

async function buildCheckoutResponse(models, clubIdentifier, order, event) {
    if (order.montoTotal <= 0) {
        order.estado = 'gratis';
        await order.save();
        const tickets = await issueTicketsForOrder(models, order, {
            clubIdentifier,
            event,
        });
        const withQr = ticketsWithQr(tickets, clubIdentifier, event);
        return {
            orderId: String(order._id),
            estado: order.estado,
            montoTotal: order.montoTotal,
            tickets: withQr,
            linkDePago: null,
        };
    }

    const tipo = (event.tiposEntrada || []).find(
        (t) => String(t._id) === String(order.tipoEntrada),
    );
    const pref = await createEventOrderMpPreference(models, clubIdentifier, order, {
        eventTitle: event.titulo,
        tipoNombre: tipo?.nombre,
    });
    order.mpPreferenceId = pref.idPreferencia || '';
    order.estado = 'pendiente_pago';
    order.holdUntil = new Date(Date.now() + HOLD_MS);
    await order.save();
    return {
        orderId: String(order._id),
        estado: order.estado,
        montoTotal: order.montoTotal,
        holdUntil: order.holdUntil,
        linkDePago: pref.linkDePago,
        idPreferencia: pref.idPreferencia,
        tickets: [],
    };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

function normalizeDoorIds(raw) {
    if (!Array.isArray(raw)) return [];
    const ids = [];
    const seen = new Set();
    for (const item of raw) {
        const id = String(item?._id || item || '').trim();
        if (!mongoose.Types.ObjectId.isValid(id) || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= 40) break;
    }
    return ids;
}

async function resolveDoorUsers(User, raw) {
    const ids = normalizeDoorIds(raw);
    if (!ids.length) return [];
    const users = await User.find({ _id: { $in: ids }, estado: { $ne: 'inactivo' } }).select('_id');
    const ok = new Set(users.map((u) => String(u._id)));
    return ids.filter((id) => ok.has(id));
}

function isClubOwnerUser(user) {
    return user?.rol === 'admin_club' || (user?.roles || []).includes('admin_club');
}

function userCanScanEvent(user, event) {
    if (!event || event.estado !== 'publicado') return false;
    if (isClubOwnerUser(user)) return true;
    return (event.controlIngreso || []).some((id) => String(id?._id || id) === String(user?._id));
}

export const listAdminEvents = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const events = await ClubEvent.find()
        .sort({ fechaInicio: -1 })
        .populate('controlIngreso', 'nombre apellido rol')
        .lean();
    res.json(events);
});

export const getAdminEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const event = await ClubEvent.findById(req.params.id)
        .populate('controlIngreso', 'nombre apellido rol')
        .lean();
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    res.json(event);
});

export const createEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const {
        titulo,
        descripcion,
        imagenUrl,
        mapaEstadioUrl,
        estadioId,
        lugar,
        fechaInicio,
        fechaFin,
        tiposEntrada,
        secciones,
        reglasDescuento,
        controlIngreso,
        estado,
        slug: slugIn,
    } = req.body || {};

    if (!titulo?.trim() || !fechaInicio) {
        res.status(400);
        throw new Error('Título y fecha de inicio son obligatorios.');
    }

    const slug = await uniqueSlug(ClubEvent, slugIn || titulo);
    const event = new ClubEvent({
        titulo: titulo.trim(),
        descripcion: descripcion || '',
        imagenUrl: imagenUrl || '',
        mapaEstadioUrl: mapaEstadioUrl || '',
        estadioId: mongoose.Types.ObjectId.isValid(String(estadioId || '')) ? estadioId : null,
        lugar: lugar || '',
        fechaInicio: new Date(fechaInicio),
        fechaFin: fechaFin ? new Date(fechaFin) : undefined,
        slug,
        tiposEntrada: normalizeTipos(tiposEntrada),
        reglasDescuento: normalizeReglas(reglasDescuento),
        controlIngreso: await resolveDoorUsers(req.models.User, controlIngreso),
        estado: ['borrador', 'publicado'].includes(estado) ? estado : 'borrador',
        creadoPor: req.user._id,
    });
    event.secciones = normalizeSecciones(secciones, event.tiposEntrada);
    applySectionCupos(event.tiposEntrada, event.secciones);
    await event.save();
    res.status(201).json(event);
});

export const updateEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const event = await ClubEvent.findById(req.params.id);
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }

    const b = req.body || {};
    if (b.titulo != null) event.titulo = String(b.titulo).trim();
    if (b.descripcion != null) event.descripcion = String(b.descripcion);
    if (b.imagenUrl != null) event.imagenUrl = String(b.imagenUrl);
    if (b.mapaEstadioUrl != null) event.mapaEstadioUrl = String(b.mapaEstadioUrl);
    if (b.estadioId !== undefined) {
        event.estadioId = mongoose.Types.ObjectId.isValid(String(b.estadioId || '')) ? b.estadioId : null;
    }
    if (b.lugar != null) event.lugar = String(b.lugar);
    if (b.fechaInicio != null) event.fechaInicio = new Date(b.fechaInicio);
    if (b.fechaFin !== undefined) {
        event.fechaFin = b.fechaFin ? new Date(b.fechaFin) : undefined;
    }
    if (b.estado && ['borrador', 'publicado', 'cancelado', 'finalizado'].includes(b.estado)) {
        event.estado = b.estado;
    }
    if (b.tiposEntrada != null) {
        const next = normalizeTipos(b.tiposEntrada);
        // Preserve vendidas from existing tipos when same _id
        for (const t of next) {
            if (!t._id) continue;
            const prev = event.tiposEntrada.id(t._id);
            if (prev) t.vendidas = prev.vendidas;
        }
        event.tiposEntrada = next;
    }
    if (b.secciones != null) {
        event.secciones = normalizeSecciones(b.secciones, event.tiposEntrada);
        applySectionCupos(event.tiposEntrada, event.secciones);
    }
    if (b.reglasDescuento != null) {
        event.reglasDescuento = normalizeReglas(b.reglasDescuento);
    }
    if (b.controlIngreso != null) {
        event.controlIngreso = await resolveDoorUsers(req.models.User, b.controlIngreso);
    }
    if (b.slug != null && String(b.slug).trim()) {
        event.slug = await uniqueSlug(ClubEvent, b.slug, event._id);
    }

    await event.save();
    res.json(event);
});

export const deleteEvent = asyncHandler(async (req, res) => {
    const { ClubEvent, EventTicketOrder } = req.models;
    const event = await ClubEvent.findById(req.params.id);
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    const orders = await EventTicketOrder.countDocuments({
        evento: event._id,
        estado: { $in: ['pagada', 'gratis', 'pendiente_pago'] },
    });
    if (orders > 0) {
        event.estado = 'cancelado';
        await event.save();
        return res.json({ ok: true, soft: true, message: 'Evento cancelado (tenía órdenes).' });
    }
    await event.deleteOne();
    res.json({ ok: true, deleted: true });
});

export const publishEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const event = await ClubEvent.findById(req.params.id);
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    if (!(event.tiposEntrada || []).some((t) => t.activo)) {
        res.status(400);
        throw new Error('Agregá al menos un tipo de entrada activo antes de publicar.');
    }
    event.estado = 'publicado';
    await event.save();
    res.json(event);
});

export const cancelEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const event = await ClubEvent.findById(req.params.id);
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    event.estado = 'cancelado';
    await event.save();
    res.json(event);
});

export const listEventOrders = asyncHandler(async (req, res) => {
    const { EventTicketOrder } = req.models;
    const orders = await EventTicketOrder.find({ evento: req.params.id })
        .populate('comprador.user', 'rol nombre apellido')
        .sort({ createdAt: -1 })
        .lean();
    res.json(orders);
});

export const listPricingPickers = asyncHandler(async (req, res) => {
    const { SocialFee, Plan } = req.models;
    const [cuotasSociales, planes] = await Promise.all([
        SocialFee.find().select('nombre monto activo').sort({ nombre: 1 }).lean(),
        Plan.find().select('nombre monto activo').sort({ nombre: 1 }).lean(),
    ]);
    res.json({ cuotasSociales, planes, roles: MEMBER_ROLES });
});

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const searchEventBuyers = asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const { User } = req.models;
    const tokens = q.split(/\s+/).filter(Boolean);
    const users = await User.find({
        estado: { $ne: 'inactivo' },
        $and: tokens.map((token) => {
            const rx = new RegExp(escapeRegex(token), 'i');
            const digits = token.replace(/\D/g, '');
            const ors = [{ nombre: rx }, { apellido: rx }, { email: rx }, { dni: rx }];
            if (digits.length >= 2 && digits !== token) {
                ors.push({ dni: new RegExp(escapeRegex(digits)) });
            }
            return { $or: ors };
        }),
    })
        .select('nombre apellido email dni rol')
        .limit(12)
        .lean();
    res.json(users);
});

async function buyerForCashSale(req) {
    const { User } = req.models;
    const { userId, nombre, apellido, email, dni } = req.body || {};
    if (userId) {
        const user = await User.findById(userId).select(
            'nombre apellido email dni rol cuotaSocialAsignada estado',
        );
        if (!user || user.estado === 'inactivo') {
            const err = new Error('Usuario no encontrado.');
            err.statusCode = 404;
            throw err;
        }
        return {
            user,
            comprador: {
                nombre: user.nombre || 'Socio',
                apellido: user.apellido || '',
                email: String(user.email || `${user._id}@miembro.local`).toLowerCase(),
                dni: user.dni || '',
                user: user._id,
            },
        };
    }
    if (!nombre?.trim() || !apellido?.trim() || !email?.trim()) {
        const err = new Error('Nombre, apellido y email son obligatorios.');
        err.statusCode = 400;
        throw err;
    }
    return {
        user: null,
        comprador: {
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            email: email.trim().toLowerCase(),
            dni: dni ? String(dni).replace(/\D/g, '') : '',
            user: null,
        },
    };
}

function ymdKeyInTz(date, tz) {
    const { year, month, day } = calendarPartsInTz(date, tz || DEFAULT_CLUB_TIMEZONE);
    return year * 10000 + month * 100 + day;
}

function eventDayHasPassed(event, tz) {
    if (!event?.fechaInicio) return false;
    const start = new Date(event.fechaInicio);
    if (Number.isNaN(start.getTime())) return false;
    return ymdKeyInTz(start, tz) < ymdKeyInTz(new Date(), tz);
}

async function quoteCashSale(req) {
    const { ClubEvent } = req.models;
    const event = await ClubEvent.findById(req.params.id);
    if (!event) {
        const err = new Error('Evento no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (event.estado === 'cancelado' || event.estado === 'finalizado') {
        const err = new Error('Este evento no admite nuevas entradas.');
        err.statusCode = 400;
        throw err;
    }
    if (event.estado !== 'publicado') {
        const err = new Error('Publicá el evento antes de cargar una venta en efectivo.');
        err.statusCode = 400;
        throw err;
    }
    if (eventDayHasPassed(event, req.clubTimezone)) {
        const err = new Error('Este evento ya pasó. No se pueden vender más entradas.');
        err.statusCode = 400;
        throw err;
    }
    let user = null;
    if (req.body?.userId) {
        const loaded = await buyerForCashSale(req);
        user = loaded.user;
    }
    const eligible = user ? await resolveDiscountPeople(req.models, user) : [];
    const quote = quoteEventTickets({
        event,
        tipoEntradaId: req.body?.tipoEntradaId,
        cantidad: req.body?.cantidad,
        holders: req.body?.asistentes,
        eligible,
    });
    return { event, quote };
}

export const adminCashQuote = asyncHandler(async (req, res) => {
    const { event, quote } = await quoteCashSale(req);
    const ocupados = await listOccupiedSeats(req.models, event._id);
    res.json({ ...quote, ocupados });
});

export const adminCashSale = asyncHandler(async (req, res) => {
    const { EventTicketOrder } = req.models;
    const { event, quote } = await quoteCashSale(req);
    const { comprador } = await buyerForCashSale(req);
    const holders = await bindHolderSeats(
        req.models,
        event,
        quote.tipoEntradaId,
        normalizeAsistentes(req.body?.asistentes, quote.cantidad),
        req.body?.asistentes,
    );

    await reserveCupo(event, quote.tipoEntradaId, quote.cantidad);
    const order = await EventTicketOrder.create({
        evento: event._id,
        tipoEntrada: quote.tipoEntradaId,
        cantidad: quote.cantidad,
        comprador,
        asistentes: priceHolders(holders, quote),
        precioLista: quote.precioLista,
        precioConDescuento: quote.precioConDescuento,
        cantidadConDescuento: quote.cantidadConDescuento,
        cantidadPrecioLleno: quote.cantidadPrecioLleno,
        reglaAplicada: quote.reglaAplicada
            ? { id: quote.reglaAplicada.id, nombre: quote.reglaAplicada.nombre }
            : { id: null, nombre: null },
        descuentoBloqueadoPorDeuda: quote.descuentoBloqueadoPorDeuda,
        montoTotal: quote.montoTotal,
        estado: quote.montoTotal > 0 ? 'pagada' : 'gratis',
        medioPago: quote.montoTotal > 0 ? 'efectivo' : '',
        registradoPor: req.user._id,
    });

    try {
        const tickets = await issueTicketsForOrder(req.models, order, {
            clubIdentifier: req.clubIdentifier,
            event,
        });
        res.status(201).json({
            orderId: String(order._id),
            estado: order.estado,
            montoTotal: order.montoTotal,
            medioPago: order.medioPago,
            tickets: ticketsWithQr(tickets, req.clubIdentifier, event),
        });
    } catch (e) {
        const tipo = event.tiposEntrada.id(quote.tipoEntradaId);
        if (tipo) {
            tipo.vendidas = Math.max(0, Number(tipo.vendidas || 0) - quote.cantidad);
            await event.save();
        }
        await EventTicketOrder.findByIdAndUpdate(order._id, { estado: 'cancelada' });
        throw e;
    }
});

// ─── Public ──────────────────────────────────────────────────────────────────

function openEventsQuery() {
    const startOfToday = zonedWallTimeToDate(todayYmdClub(), '00:00', DEFAULT_CLUB_TIMEZONE);
    return {
        estado: 'publicado',
        fechaInicio: { $gte: startOfToday },
    };
}

export const listPublicEvents = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    await expireStaleHolds(req.models);
    const events = await ClubEvent.find(openEventsQuery())
        .sort({ fechaInicio: 1 })
        .lean();
    res.json(events.map(publicEventCard));
});

export const getPublicEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    await expireStaleHolds(req.models);
    const event = await ClubEvent.findOne({
        slug: String(req.params.slug || '').toLowerCase(),
        estado: 'publicado',
    }).lean();
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    const ocupados = await listOccupiedSeats(req.models, event._id);
    res.json({ ...publicEventCard(event), ocupados });
});

export const publicCheckout = asyncHandler(async (req, res) => {
    const { ClubEvent, EventTicketOrder } = req.models;
    await expireStaleHolds(req.models);

    const event = await ClubEvent.findOne({
        slug: String(req.params.slug || '').toLowerCase(),
        estado: 'publicado',
    });
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }

    const { tipoEntradaId, cantidad, nombre, apellido, email, dni, asistentes } = req.body || {};
    if (!nombre?.trim() || !apellido?.trim() || !email?.trim()) {
        res.status(400);
        throw new Error('Nombre, apellido y email son obligatorios.');
    }

    const quote = quoteEventTickets({
        event,
        tipoEntradaId,
        cantidad,
        holders: asistentes,
        eligible: [],
    });
    const holders = await bindHolderSeats(
        req.models,
        event,
        quote.tipoEntradaId,
        normalizeAsistentes(asistentes, quote.cantidad),
        asistentes,
    );

    await reserveCupo(event, quote.tipoEntradaId, quote.cantidad);

    const order = await EventTicketOrder.create({
        evento: event._id,
        tipoEntrada: quote.tipoEntradaId,
        cantidad: quote.cantidad,
        comprador: {
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            email: email.trim().toLowerCase(),
            dni: dni ? String(dni).trim() : '',
            user: null,
        },
        asistentes: priceHolders(holders, quote),
        precioLista: quote.precioLista,
        precioConDescuento: quote.precioConDescuento,
        cantidadConDescuento: quote.cantidadConDescuento,
        cantidadPrecioLleno: quote.cantidadPrecioLleno,
        reglaAplicada: quote.reglaAplicada
            ? { id: quote.reglaAplicada.id, nombre: quote.reglaAplicada.nombre }
            : { id: null, nombre: null },
        descuentoBloqueadoPorDeuda: false,
        montoTotal: quote.montoTotal,
        estado: quote.montoTotal > 0 ? 'pendiente_pago' : 'gratis',
        holdUntil: quote.montoTotal > 0 ? new Date(Date.now() + HOLD_MS) : undefined,
    });

    try {
        const result = await buildCheckoutResponse(
            req.models,
            req.clubIdentifier,
            order,
            event,
        );
        res.status(201).json({ ...result, quote });
    } catch (e) {
        await releaseOrderHold(req.models, order);
        throw e;
    }
});

// ─── Member ──────────────────────────────────────────────────────────────────

export const listMemberEvents = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    await expireStaleHolds(req.models);
    const events = await ClubEvent.find(openEventsQuery())
        .sort({ fechaInicio: 1 })
        .lean();
    res.json(events.map(publicEventCard));
});

export const quoteMemberEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    await expireStaleHolds(req.models);
    const event = await ClubEvent.findOne({ _id: req.params.id, estado: 'publicado' });
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    const eligible = await resolveDiscountPeople(req.models, req.user);
    const quote = quoteEventTickets({
        event,
        tipoEntradaId: req.body?.tipoEntradaId,
        cantidad: req.body?.cantidad,
        holders: req.body?.asistentes,
        eligible,
    });
    const ocupados = await listOccupiedSeats(req.models, event._id);
    res.json({ ...quote, ocupados });
});

export const memberCheckout = asyncHandler(async (req, res) => {
    const { ClubEvent, EventTicketOrder } = req.models;
    await expireStaleHolds(req.models);

    const event = await ClubEvent.findOne({ _id: req.params.id, estado: 'publicado' });
    if (!event) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }

    const { tipoEntradaId, cantidad, asistentes } = req.body || {};
    const normalized = normalizeAsistentes(asistentes, cantidad);
    const eligible = await resolveDiscountPeople(req.models, req.user);
    const quote = quoteEventTickets({
        event,
        tipoEntradaId,
        cantidad: normalized.length,
        holders: normalized,
        eligible,
    });
    const holders = priceHolders(
        await bindHolderSeats(
            req.models,
            event,
            quote.tipoEntradaId,
            normalized,
            asistentes,
        ),
        quote,
    );

    await reserveCupo(event, quote.tipoEntradaId, quote.cantidad);

    const order = await EventTicketOrder.create({
        evento: event._id,
        tipoEntrada: quote.tipoEntradaId,
        cantidad: quote.cantidad,
        comprador: {
            nombre: req.user.nombre || 'Socio',
            apellido: req.user.apellido || '',
            email: String(req.user.email || `${req.user._id}@miembro.local`).toLowerCase(),
            dni: req.user.dni || '',
            user: req.user._id,
        },
        asistentes: holders,
        precioLista: quote.precioLista,
        precioConDescuento: quote.precioConDescuento,
        cantidadConDescuento: quote.cantidadConDescuento,
        cantidadPrecioLleno: quote.cantidadPrecioLleno,
        reglaAplicada: quote.reglaAplicada
            ? { id: quote.reglaAplicada.id, nombre: quote.reglaAplicada.nombre }
            : { id: null, nombre: null },
        descuentoBloqueadoPorDeuda: quote.descuentoBloqueadoPorDeuda,
        montoTotal: quote.montoTotal,
        estado: quote.montoTotal > 0 ? 'pendiente_pago' : 'gratis',
        holdUntil: quote.montoTotal > 0 ? new Date(Date.now() + HOLD_MS) : undefined,
    });

    try {
        const result = await buildCheckoutResponse(
            req.models,
            req.clubIdentifier,
            order,
            event,
        );
        res.status(201).json({ ...result, quote });
    } catch (e) {
        await releaseOrderHold(req.models, order);
        throw e;
    }
});

export const myTickets = asyncHandler(async (req, res) => {
    const { EventTicket, ClubEvent, EventTicketOrder } = req.models;
    const orders = await EventTicketOrder.find({
        'comprador.user': req.user._id,
        estado: { $in: ['pagada', 'gratis'] },
    })
        .select('_id')
        .lean();
    const orderIds = orders.map((o) => o._id);
    const tickets = await EventTicket.find({
        orden: { $in: orderIds },
        estado: { $ne: 'anulada' },
    })
        .sort({ createdAt: -1 })
        .lean();

    const eventIds = [...new Set(tickets.map((t) => String(t.evento)))];
    const events = await ClubEvent.find({ _id: { $in: eventIds } }).lean();
    const byId = Object.fromEntries(events.map((e) => [String(e._id), e]));

    const club = req.clubIdentifier;
    const result = tickets.map((t) => {
        const ev = byId[String(t.evento)];
        const withQr = ticketsWithQr([t], club, ev)[0];
        return {
            ...withQr,
            eventoTitulo: ev?.titulo || '',
            eventoFechaInicio: ev?.fechaInicio,
            eventoLugar: ev?.lugar || '',
            eventoImagenUrl: ev?.imagenUrl || '',
        };
    });
    res.json(result);
});

export const getPublicOrderTickets = asyncHandler(async (req, res) => {
    const { EventTicketOrder, EventTicket, ClubEvent } = req.models;
    const order = await EventTicketOrder.findById(req.params.orderId);
    if (!order) {
        res.status(404);
        throw new Error('Orden no encontrada.');
    }
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email || email !== order.comprador?.email) {
        res.status(403);
        throw new Error('No podés ver esta orden.');
    }
    if (!['pagada', 'gratis'].includes(order.estado)) {
        return res.json({
            orderId: String(order._id),
            estado: order.estado,
            montoTotal: order.montoTotal,
            tickets: [],
        });
    }
    const event = await ClubEvent.findById(order.evento).lean();
    let tickets = await EventTicket.find({ orden: order._id }).lean();
    if (!tickets.length) {
        tickets = await issueTicketsForOrder(req.models, order, {
            clubIdentifier: req.clubIdentifier,
            event,
        });
    }
    res.json({
        orderId: String(order._id),
        estado: order.estado,
        montoTotal: order.montoTotal,
        tickets: ticketsWithQr(tickets, req.clubIdentifier, event),
        evento: event ? publicEventCard(event) : null,
    });
});

// ─── Scan ────────────────────────────────────────────────────────────────────

export const listScanTargets = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 18 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
    const filter = {
        estado: 'publicado',
        fechaInicio: { $gte: windowStart, $lte: windowEnd },
    };
    if (!isClubOwnerUser(req.user)) {
        filter.controlIngreso = req.user._id;
    }
    const events = await ClubEvent.find(filter)
        .select('titulo fechaInicio lugar')
        .sort({ fechaInicio: 1 })
        .lean();
    res.json(events);
});

function ticketHolder(ticket) {
    if (ticket?.titular?.dni || ticket?.titular?.nombre) return ticket.titular;
    return {
        nombre: ticket?.compradorSnapshot?.nombre || '',
        apellido: ticket?.compradorSnapshot?.apellido || '',
        dni: ticket?.compradorSnapshot?.dni || '',
    };
}

function ticketScanBody(ticket, event, extras = {}) {
    return {
        ok: true,
        entryType: 'event',
        ticket: {
            _id: ticket._id,
            codigo: ticket.codigo,
            tipoEntradaNombre: ticket.tipoEntradaNombre,
            titular: ticketHolder(ticket),
            comprador: ticket.compradorSnapshot,
            usadoEn: ticket.usadoEn || null,
            estado: ticket.estado,
        },
        evento: {
            _id: event?._id,
            titulo: event?.titulo,
            fechaInicio: event?.fechaInicio,
            lugar: event?.lugar,
        },
        ...extras,
    };
}

async function loadTicketForDoor(req) {
    const { EventTicket, ClubEvent } = req.models;
    const { token, eventoId } = req.body || {};
    if (!eventoId) {
        const err = new Error('Seleccioná el evento de la puerta.');
        err.statusCode = 400;
        throw err;
    }
    if (!token) {
        const err = new Error('Falta el código QR.');
        err.statusCode = 400;
        throw err;
    }

    const doorEvent = await ClubEvent.findById(eventoId).select('estado controlIngreso titulo fechaInicio lugar');
    if (!doorEvent || doorEvent.estado !== 'publicado') {
        const err = new Error('Evento no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (!userCanScanEvent(req.user, doorEvent)) {
        const err = new Error('No tenés acceso al control de ingreso de este evento.');
        err.statusCode = 403;
        throw err;
    }

    let parsed;
    try {
        parsed = parseEventTicketToken(token, req.clubIdentifier);
    } catch (e) {
        const err = new Error(e.message || 'QR inválido.');
        err.statusCode = 400;
        throw err;
    }
    if (String(parsed.eventId) !== String(eventoId)) {
        const err = new Error('Esta entrada es de otro evento. Revisá el evento seleccionado.');
        err.statusCode = 400;
        throw err;
    }

    const ticket = await EventTicket.findById(parsed.ticketId);
    if (!ticket) {
        const err = new Error('Entrada no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (String(ticket.evento) !== String(eventoId)) {
        const err = new Error('Esta entrada es de otro evento.');
        err.statusCode = 400;
        throw err;
    }
    if (ticket.tokenNonce && ticket.tokenNonce !== parsed.nonce) {
        const err = new Error('Código QR no válido para esta entrada.');
        err.statusCode = 400;
        throw err;
    }
    return { ticket, event: doorEvent };
}

async function writeDoorLog(req, ticket, event, decision) {
    const { EventDoorLog } = req.models;
    const holder = ticketHolder(ticket);
    return EventDoorLog.create({
        evento: event._id,
        ticket: ticket._id,
        decision,
        scannedBy: req.user._id,
        codigo: ticket.codigo,
        tipoEntradaNombre: ticket.tipoEntradaNombre,
        titular: {
            nombre: holder.nombre || '',
            apellido: holder.apellido || '',
            dni: holder.dni || '',
        },
    });
}

export const scanEventTicket = asyncHandler(async (req, res) => {
    let loaded;
    try {
        loaded = await loadTicketForDoor(req);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw new Error(e.message || 'QR inválido.');
    }
    const { ticket, event } = loaded;

    if (ticket.estado === 'anulada') {
        res.status(400);
        throw new Error('Entrada anulada.');
    }
    if (ticket.estado === 'usada') {
        return res.json(ticketScanBody(ticket, event, {
            needsDecision: false,
            alreadyUsed: true,
            message: 'Este ticket ya se usó',
            decision: 'entro',
        }));
    }

    res.json(ticketScanBody(ticket, event, {
        needsDecision: true,
        alreadyUsed: false,
        message: null,
        decision: null,
    }));
});

export const confirmEventTicketScan = asyncHandler(async (req, res) => {
    const decision = req.body?.decision === 'no_entro' ? 'no_entro' : req.body?.decision === 'entro' ? 'entro' : '';
    if (!decision) {
        res.status(400);
        throw new Error('Elegí si entró o no entró.');
    }

    let loaded;
    try {
        loaded = await loadTicketForDoor(req);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw new Error(e.message || 'QR inválido.');
    }
    const { ticket, event } = loaded;

    if (ticket.estado === 'anulada') {
        res.status(400);
        throw new Error('Entrada anulada.');
    }
    if (ticket.estado === 'usada') {
        return res.json(ticketScanBody(ticket, event, {
            needsDecision: false,
            alreadyUsed: true,
            message: 'Este ticket ya se usó',
            decision: 'entro',
        }));
    }

    if (decision === 'entro') {
        ticket.estado = 'usada';
        ticket.usadoEn = new Date();
        ticket.escaneadoPor = req.user._id;
        await ticket.save();
    }

    const log = await writeDoorLog(req, ticket, event, decision);
    res.json(ticketScanBody(ticket, event, {
        needsDecision: false,
        alreadyUsed: false,
        message: decision === 'entro' ? 'Entró' : 'No entró',
        decision,
        scannedAt: log.scannedAt,
    }));
});

export const listEventDoorLog = asyncHandler(async (req, res) => {
    const { ClubEvent, EventDoorLog } = req.models;
    const eventoId = req.query.eventoId;
    if (!eventoId) {
        res.status(400);
        throw new Error('Falta el evento.');
    }
    const doorEvent = await ClubEvent.findById(eventoId).select('estado controlIngreso');
    if (!doorEvent) {
        res.status(404);
        throw new Error('Evento no encontrado.');
    }
    if (!userCanScanEvent(req.user, doorEvent)) {
        res.status(403);
        throw new Error('No tenés acceso al control de ingreso de este evento.');
    }
    const logs = await EventDoorLog.find({ evento: eventoId })
        .sort({ scannedAt: -1 })
        .limit(40)
        .lean();
    res.json(logs.map((row) => ({
        _id: row._id,
        decision: row.decision,
        scannedAt: row.scannedAt,
        codigo: row.codigo,
        tipoEntradaNombre: row.tipoEntradaNombre,
        titular: row.titular || {},
    })));
});

export {
    ADMIN_WRITE,
    EVENT_MANAGE,
    ADMIN_READ,
    SCAN_ROLES,
    MEMBER_ROLES,
};
