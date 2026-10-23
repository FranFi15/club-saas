import crypto from 'crypto';
import {
    buildEventTicketToken,
    formatEventTicketQrValue,
    resolveEventTicketExpiry,
} from './eventTicketToken.service.js';

function shortCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/** DNI (6–8 digits) or CUIL/CUIT (11): the document number is the middle 8 digits. */
export function normalizeTicketDni(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 11) return digits.slice(2, 10);
    return digits;
}

/**
 * One holder per ticket: name, last name, and DNI. DNIs must be unique in the order.
 */
export function normalizeAsistentes(raw, cantidad) {
    const list = Array.isArray(raw) ? raw : [];
    const n = Number(cantidad) || 0;
    if (!n || list.length !== n) {
        const err = new Error(
            `Completá nombre, apellido y DNI de cada entrada (${n || 'la cantidad elegida'}).`,
        );
        err.statusCode = 400;
        throw err;
    }
    const seen = new Set();
    return list.map((a, i) => {
        const nombre = String(a?.nombre || '').trim();
        const apellido = String(a?.apellido || '').trim();
        const dni = normalizeTicketDni(a?.dni);
        if (!nombre || !apellido) {
            const err = new Error(`Entrada ${i + 1}: completá nombre y apellido.`);
            err.statusCode = 400;
            throw err;
        }
        if (dni.length < 6 || dni.length > 8) {
            const err = new Error(`Entrada ${i + 1}: el DNI tiene que tener entre 6 y 8 números.`);
            err.statusCode = 400;
            throw err;
        }
        if (seen.has(dni)) {
            const err = new Error(`El DNI ${dni} está repetido. Cada entrada es de una persona.`);
            err.statusCode = 400;
            throw err;
        }
        seen.add(dni);
        return { nombre, apellido, dni };
    });
}

/**
 * Issue EventTicket docs for a paid/free order. Idempotent if tickets already exist.
 */
export async function issueTicketsForOrder(models, order, { clubIdentifier, event } = {}) {
    const { EventTicket, ClubEvent, EventTicketOrder } = models;
    if (!order) {
        const err = new Error('Orden no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (!['pagada', 'gratis'].includes(order.estado)) {
        const err = new Error('La orden aún no está pagada.');
        err.statusCode = 400;
        throw err;
    }

    const existing = await EventTicket.find({ orden: order._id }).lean();
    if (existing.length >= order.cantidad) {
        return existing;
    }

    const evt =
        event ||
        (await ClubEvent.findById(order.evento).lean()) ||
        null;
    if (!evt) {
        const err = new Error('Evento no encontrado.');
        err.statusCode = 404;
        throw err;
    }

    const tipo = (evt.tiposEntrada || []).find(
        (t) => String(t._id) === String(order.tipoEntrada),
    );
    const tipoNombre = tipo?.nombre || '';
    const exp = resolveEventTicketExpiry(evt);
    const prices = [];
    for (let i = 0; i < order.cantidadConDescuento; i += 1) {
        prices.push(Number(order.precioConDescuento) || 0);
    }
    for (let i = 0; i < order.cantidadPrecioLleno; i += 1) {
        prices.push(Number(order.precioLista) || 0);
    }
    while (prices.length < order.cantidad) {
        prices.push(Number(order.precioLista) || 0);
    }

    const toCreate = order.cantidad - existing.length;
    const docs = [];
    for (let i = 0; i < toCreate; i += 1) {
        const nonce = crypto.randomBytes(16).toString('hex');
        const precioCobrado = prices[existing.length + i] ?? (Number(order.precioLista) || 0);
        const holder = (order.asistentes || [])[existing.length + i];
        const titular = holder?.dni
            ? {
                nombre: holder.nombre || '',
                apellido: holder.apellido || '',
                dni: holder.dni || '',
            }
            : {
                nombre: order.comprador?.nombre || '',
                apellido: order.comprador?.apellido || '',
                dni: order.comprador?.dni || '',
            };
        let codigo = shortCode();
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const clash = await EventTicket.exists({ codigo });
            if (!clash) break;
            codigo = shortCode();
        }
        docs.push({
            evento: order.evento,
            orden: order._id,
            tipoEntrada: order.tipoEntrada,
            tipoEntradaNombre: tipoNombre,
            codigo,
            tokenNonce: nonce,
            estado: 'valida',
            precioCobrado,
            compradorSnapshot: {
                nombre: order.comprador?.nombre || '',
                apellido: order.comprador?.apellido || '',
                email: order.comprador?.email || '',
                dni: order.comprador?.dni || '',
            },
            titular,
            asiento: holder?.asiento?.seccionId
                ? {
                    seccionId: holder.asiento.seccionId,
                    seccionNombre: holder.asiento.seccionNombre || '',
                    fila: holder.asiento.fila,
                    numero: holder.asiento.numero,
                }
                : undefined,
            _exp: exp,
        });
    }

    const created = await EventTicket.insertMany(
        docs.map(({ _exp, ...rest }) => rest),
        { ordered: true },
    );

    if (order.estado === 'pendiente_pago') {
        order.estado = 'pagada';
        await EventTicketOrder.findByIdAndUpdate(order._id, { estado: 'pagada' });
    }

    return [...existing, ...created.map((d) => d.toObject?.() || d)];
}

function seatKey(seat) {
    return `${seat.seccionId}:${seat.fila}:${seat.numero}`;
}

export async function listOccupiedSeats(models, eventId) {
    const { EventTicket, EventTicketOrder } = models;
    const tickets = await EventTicket.find({
        evento: eventId,
        estado: { $ne: 'anulada' },
        'asiento.seccionId': { $ne: null },
    })
        .select('asiento')
        .lean();
    const holds = await EventTicketOrder.find({
        evento: eventId,
        estado: 'pendiente_pago',
        holdUntil: { $gt: new Date() },
    })
        .select('asistentes.asiento')
        .lean();
    const seats = [];
    for (const ticket of tickets) {
        if (ticket.asiento?.seccionId) seats.push(ticket.asiento);
    }
    for (const order of holds) {
        for (const person of order.asistentes || []) {
            if (person.asiento?.seccionId) seats.push(person.asiento);
        }
    }
    return seats.map((seat) => ({
        seccionId: String(seat.seccionId),
        fila: seat.fila,
        numero: seat.numero,
    }));
}

/**
 * When the event has sections for this ticket type, each holder must pick a free seat.
 * Events without a stadium map keep the previous quantity-only purchase.
 */
export async function bindHolderSeats(models, event, tipoEntradaId, holders, rawList) {
    const sections = (event.secciones || []).filter(
        (section) => String(section.tipoEntrada) === String(tipoEntradaId),
    );
    if (!sections.length) {
        return holders.map((holder) => {
            const next = { ...holder };
            delete next.asiento;
            return next;
        });
    }
    const occupied = await listOccupiedSeats(models, event._id);
    const taken = new Set(occupied.map(seatKey));
    const byId = Object.fromEntries(sections.map((section) => [String(section._id), section]));
    const used = new Set();
    return holders.map((holder, index) => {
        const raw = rawList?.[index]?.asiento || {};
        const seccionId = String(raw.seccionId || '');
        const section = byId[seccionId];
        const fila = Math.floor(Number(raw.fila));
        const numero = Math.floor(Number(raw.numero));
        if (
            !section
            || fila < 1
            || fila > section.filas
            || numero < 1
            || numero > section.asientosPorFila
        ) {
            const err = new Error(`Entrada ${index + 1}: elegí un asiento tocando el plano.`);
            err.statusCode = 400;
            throw err;
        }
        const key = seatKey({ seccionId, fila, numero });
        if (taken.has(key) || used.has(key)) {
            const err = new Error(
                `Fila ${fila}, asiento ${numero} de ${section.nombre} ya está ocupado.`,
            );
            err.statusCode = 400;
            throw err;
        }
        used.add(key);
        return {
            ...holder,
            asiento: {
                seccionId: section._id,
                seccionNombre: section.nombre,
                fila,
                numero,
            },
        };
    });
}

/**
 * Attach QR strings for client display.
 */
export function ticketsWithQr(tickets, clubIdentifier, event) {
    const exp = resolveEventTicketExpiry(event);
    return (tickets || []).map((t) => {
        const { token, expiresAt } = buildEventTicketToken(clubIdentifier, {
            ticketId: t._id,
            eventId: t.evento,
            exp,
            nonce: t.tokenNonce,
        });
        return {
            ...t,
            qrValue: formatEventTicketQrValue(token),
            qrExpiresAt: expiresAt,
        };
    });
}

/**
 * Release cupo held by an expired/cancelled pending order.
 */
export async function releaseOrderHold(models, order) {
    const { ClubEvent } = models;
    if (!order || order.estado !== 'pendiente_pago') return order;

    const event = await ClubEvent.findById(order.evento);
    if (!event) return order;

    const tipo = event.tiposEntrada.id(order.tipoEntrada);
    if (tipo) {
        tipo.vendidas = Math.max(0, Number(tipo.vendidas || 0) - Number(order.cantidad || 0));
        await event.save();
    }
    order.estado = 'expirada';
    await order.save();
    return order;
}

export async function expireStaleHolds(models) {
    const { EventTicketOrder } = models;
    const now = new Date();
    const stale = await EventTicketOrder.find({
        estado: 'pendiente_pago',
        holdUntil: { $lte: now },
    }).limit(50);
    for (const order of stale) {
        await releaseOrderHold(models, order);
    }
}
