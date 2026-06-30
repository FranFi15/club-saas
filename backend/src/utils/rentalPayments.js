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
