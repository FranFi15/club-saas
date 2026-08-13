/** Sincroniza estadoPago según monto cobrado vs total. */
export function syncRentalEstadoPago(rental) {
    const total = Number(rental.montoTotal) || 0;
    const cobrado = Number(rental.señaPagada) || 0;
    if (cobrado <= 0) {
        rental.estadoPago = 'pendiente';
    } else if (cobrado >= total) {
        rental.estadoPago = 'pagado';
        rental.señaPagada = total;
    } else {
        rental.estadoPago = 'señado';
    }
    return rental;
}

export function rentalSaldoPendiente(rental) {
    const total = Number(rental.montoTotal) || 0;
    const cobrado = Number(rental.señaPagada) || 0;
    return Math.max(0, total - cobrado);
}

/**
 * Calcula monto a cobrar por MP según concepto.
 * - sena: requiere `monto` (parcial); solo si aún no hay cobros
 * - saldo | total: saldo restante
 */
export function resolveRentalMpCharge(rental, concepto, montoRaw) {
    if (!rental || rental.estadoReserva === 'cancelada') {
        const err = new Error('La reserva no admite cobro.');
        err.statusCode = 400;
        throw err;
    }

    const saldo = rentalSaldoPendiente(rental);
    if (saldo <= 0) {
        const err = new Error('Esta reserva ya está pagada en su totalidad.');
        err.statusCode = 400;
        throw err;
    }

    const kind = String(concepto || '').toLowerCase();
    const cobrado = Number(rental.señaPagada) || 0;

    if (kind === 'sena' || kind === 'seña') {
        if (cobrado > 0) {
            const err = new Error('Ya hay un cobro registrado. Usá “Saldo” para el resto.');
            err.statusCode = 400;
            throw err;
        }
        const monto = Number(montoRaw);
        if (!Number.isFinite(monto) || monto <= 0) {
            const err = new Error('Indicá un monto de seña válido.');
            err.statusCode = 400;
            throw err;
        }
        if (monto > saldo) {
            const err = new Error(`La seña no puede superar el total (${saldo}).`);
            err.statusCode = 400;
            throw err;
        }
        const historialConcepto = monto >= saldo ? 'pago_total' : 'seña_inicial';
        return { monto, historialConcepto, conceptoKey: 'sena' };
    }

    if (kind === 'saldo' || kind === 'total') {
        const historialConcepto = cobrado <= 0 ? 'pago_total' : 'pago_saldo';
        return { monto: saldo, historialConcepto, conceptoKey: kind === 'saldo' ? 'saldo' : 'total' };
    }

    const err = new Error('Concepto inválido. Usá sena, saldo o total.');
    err.statusCode = 400;
    throw err;
}

function historialHasComprobante(rental, paymentId) {
    const id = String(paymentId || '');
    if (!id) return false;
    return (rental.historialPagos || []).some((h) => {
        if (h.comprobante && String(h.comprobante) === id) return true;
        if (h.nota && String(h.nota).includes(`MP:${id}`)) return true;
        return false;
    });
}

/**
 * Aplica un pago aprobado de Mercado Pago al alquiler (idempotente por paymentId).
 * Usa el monto cobrado por MP, topeado al saldo pendiente.
 */
export function applyMercadoPagoToRental(rental, { paymentId, transactionAmount, conceptoKey }) {
    const pid = String(paymentId || '');
    if (!pid) {
        const err = new Error('Falta el ID de pago de Mercado Pago.');
        err.statusCode = 400;
        throw err;
    }

    if (historialHasComprobante(rental, pid)) {
        return { applied: false, reason: 'already_applied' };
    }

    if (rental.estadoReserva === 'cancelada') {
        return { applied: false, reason: 'cancelled' };
    }

    const saldo = rentalSaldoPendiente(rental);
    if (saldo <= 0) {
        return { applied: false, reason: 'already_paid' };
    }

    let amount = Number(transactionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
        const err = new Error('Monto de Mercado Pago inválido.');
        err.statusCode = 400;
        throw err;
    }
    amount = Math.min(amount, saldo);

    const cobradoAntes = Number(rental.señaPagada) || 0;
    let historialConcepto = 'pago_saldo';
    if (conceptoKey === 'sena' && cobradoAntes <= 0) {
        historialConcepto = amount >= (Number(rental.montoTotal) || 0) ? 'pago_total' : 'seña_inicial';
    } else if (cobradoAntes <= 0 && amount >= (Number(rental.montoTotal) || 0)) {
        historialConcepto = 'pago_total';
    } else if (cobradoAntes <= 0) {
        historialConcepto = amount >= saldo ? 'pago_total' : 'seña_inicial';
    }

    if (!rental.historialPagos) rental.historialPagos = [];
    rental.historialPagos.push({
        monto: amount,
        concepto: historialConcepto,
        fecha: new Date(),
        nota: `Mercado Pago MP:${pid}`,
        comprobante: pid,
    });
    rental.señaPagada = cobradoAntes + amount;
    syncRentalEstadoPago(rental);

    return { applied: true, amount, historialConcepto };
}
