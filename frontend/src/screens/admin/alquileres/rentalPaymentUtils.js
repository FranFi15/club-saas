export function rentalSaldoPendiente(rental) {
  const total = Number(rental?.montoTotal) || 0;
  const cobrado = Number(rental?.señaPagada) || 0;
  return Math.max(0, total - cobrado);
}

export function rentalNeedsFullPayment(rental) {
  return rental?.estadoPago !== 'pagado' && rentalSaldoPendiente(rental) > 0;
}

export function fmtRentalMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-AR')}`;
}

export const PAGO_CONCEPTO_LABEL = {
  seña_inicial: 'Seña inicial',
  pago_saldo: 'Pago de saldo',
  pago_total: 'Pago total',
  ajuste: 'Ajuste',
};
