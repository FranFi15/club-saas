import crypto from 'crypto';
import {
    buildEventTicketToken,
    formatEventTicketQrValue,
    resolveEventTicketExpiry,
} from './eventTicketToken.service.js';

function shortCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
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
