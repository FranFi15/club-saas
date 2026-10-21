import asyncHandler from 'express-async-handler';
import {
    resolveBuyerContext,
    quoteEventTickets,
} from '../services/eventPricing.service.js';
import {
    issueTicketsForOrder,
    ticketsWithQr,
    expireStaleHolds,
    releaseOrderHold,
    normalizeAsistentes,
} from '../services/eventTicketIssue.service.js';
import { parseEventTicketToken } from '../services/eventTicketToken.service.js';
import { createEventOrderMpPreference } from '../services/eventMp.service.js';

const HOLD_MS = 15 * 60 * 1000;
const ADMIN_WRITE = ['admin_club', 'administrativo'];
const ADMIN_READ = ['admin_club', 'dirigente', 'administrativo'];
const SCAN_ROLES = ['admin_club', 'administrativo', 'control_ingreso'];
const MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

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

export const listAdminEvents = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const events = await ClubEvent.find().sort({ fechaInicio: -1 }).lean();
    res.json(events);
});

export const getAdminEvent = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    const event = await ClubEvent.findById(req.params.id).lean();
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
        lugar,
        fechaInicio,
        fechaFin,
        tiposEntrada,
        reglasDescuento,
        estado,
        slug: slugIn,
    } = req.body || {};

    if (!titulo?.trim() || !fechaInicio) {
        res.status(400);
        throw new Error('Título y fecha de inicio son obligatorios.');
    }

    const slug = await uniqueSlug(ClubEvent, slugIn || titulo);
    const event = await ClubEvent.create({
        titulo: titulo.trim(),
        descripcion: descripcion || '',
        imagenUrl: imagenUrl || '',
        lugar: lugar || '',
        fechaInicio: new Date(fechaInicio),
        fechaFin: fechaFin ? new Date(fechaFin) : undefined,
        slug,
        tiposEntrada: normalizeTipos(tiposEntrada),
        reglasDescuento: normalizeReglas(reglasDescuento),
        estado: ['borrador', 'publicado'].includes(estado) ? estado : 'borrador',
        creadoPor: req.user._id,
    });
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
    if (b.reglasDescuento != null) {
        event.reglasDescuento = normalizeReglas(b.reglasDescuento);
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

// ─── Public ──────────────────────────────────────────────────────────────────

export const listPublicEvents = asyncHandler(async (req, res) => {
    const { ClubEvent } = req.models;
    await expireStaleHolds(req.models);
    const now = new Date();
    const events = await ClubEvent.find({
        estado: 'publicado',
        $or: [{ fechaFin: { $gte: now } }, { fechaFin: null, fechaInicio: { $gte: new Date(now.getTime() - 86400000) } }],
    })
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
    res.json(publicEventCard(event));
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

    const context = { rol: null, cuotaSocialId: null, planIds: [], tieneVencidos: false };
    const quote = quoteEventTickets({
        event,
        tipoEntradaId,
        cantidad,
        context,
    });
    const holders = normalizeAsistentes(asistentes, quote.cantidad);

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
        asistentes: holders,
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
    const now = new Date();
    const events = await ClubEvent.find({
        estado: 'publicado',
        $or: [{ fechaFin: { $gte: now } }, { fechaFin: null, fechaInicio: { $gte: new Date(now.getTime() - 86400000) } }],
    })
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
    const context = await resolveBuyerContext(req.models, req.user);
    const quote = quoteEventTickets({
        event,
        tipoEntradaId: req.body?.tipoEntradaId,
        cantidad: req.body?.cantidad,
        context,
    });
    res.json(quote);
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
    const context = await resolveBuyerContext(req.models, req.user);
    const quote = quoteEventTickets({
        event,
        tipoEntradaId,
        cantidad,
        context,
    });
    const holders = normalizeAsistentes(asistentes, quote.cantidad);

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
    const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);
    const events = await ClubEvent.find({
        estado: 'publicado',
        fechaInicio: { $lte: windowEnd },
        $or: [{ fechaFin: null }, { fechaFin: { $gte: windowStart } }],
    })
        .select('titulo fechaInicio fechaFin lugar slug')
        .sort({ fechaInicio: 1 })
        .lean();
    res.json(events);
});

export const scanEventTicket = asyncHandler(async (req, res) => {
    const { EventTicket, ClubEvent } = req.models;
    const { token, eventoId } = req.body || {};
    if (!eventoId) {
        res.status(400);
        throw new Error('Seleccioná el evento de la puerta.');
    }
    if (!token) {
        res.status(400);
        throw new Error('Falta el código QR.');
    }

    let parsed;
    try {
        parsed = parseEventTicketToken(token, req.clubIdentifier);
    } catch (e) {
        res.status(400);
        throw new Error(e.message || 'QR inválido.');
    }

    if (String(parsed.eventId) !== String(eventoId)) {
        res.status(400);
        throw new Error('Esta entrada es de otro evento. Revisá el evento seleccionado.');
    }

    const ticket = await EventTicket.findById(parsed.ticketId);
    if (!ticket) {
        res.status(404);
        throw new Error('Entrada no encontrada.');
    }
    if (String(ticket.evento) !== String(eventoId)) {
        res.status(400);
        throw new Error('Esta entrada es de otro evento.');
    }
    if (ticket.tokenNonce && ticket.tokenNonce !== parsed.nonce) {
        res.status(400);
        throw new Error('Código QR no válido para esta entrada.');
    }
    if (ticket.estado === 'anulada') {
        res.status(400);
        throw new Error('Entrada anulada.');
    }
    if (ticket.estado === 'usada') {
        res.status(400);
        throw new Error(
            `Entrada ya utilizada${ticket.usadoEn ? ` (${new Date(ticket.usadoEn).toLocaleString('es-AR')})` : ''}.`,
        );
    }

    ticket.estado = 'usada';
    ticket.usadoEn = new Date();
    ticket.escaneadoPor = req.user._id;
    await ticket.save();

    const event = await ClubEvent.findById(ticket.evento).lean();
    res.json({
        ok: true,
        ticket: {
            codigo: ticket.codigo,
            tipoEntradaNombre: ticket.tipoEntradaNombre,
            titular: ticket.titular?.dni
                ? ticket.titular
                : {
                    nombre: ticket.compradorSnapshot?.nombre || '',
                    apellido: ticket.compradorSnapshot?.apellido || '',
                    dni: ticket.compradorSnapshot?.dni || '',
                },
            comprador: ticket.compradorSnapshot,
            usadoEn: ticket.usadoEn,
        },
        evento: {
            _id: event?._id,
            titulo: event?.titulo,
            fechaInicio: event?.fechaInicio,
            lugar: event?.lugar,
        },
    });
});

export {
    ADMIN_WRITE,
    ADMIN_READ,
    SCAN_ROLES,
    MEMBER_ROLES,
};
