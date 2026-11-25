/** Parse partner monto input (allows comma decimals). Empty → null. */
export function parsePartnerMonto(raw) {
  const s = String(raw ?? '').replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function formatPartnerMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Apply loyalty reward discount to a list price.
 * @returns {{ subtotal: number, discount: number, final: number, discountLabel: string|null }}
 */
export function computePartnerFinalPrice(monto, tipo, valor) {
  const subtotal = Number(monto) || 0;
  const v = Number(valor) || 0;
  const t = String(tipo || '').trim();

  if (t === 'porcentaje' && v > 0) {
    const pct = Math.min(100, Math.max(0, v));
    const discount = Math.round(subtotal * (pct / 100) * 100) / 100;
    return {
      subtotal,
      discount,
      final: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
      discountLabel: `${pct}%`,
    };
  }

  if (t === 'monto_fijo' && v > 0) {
    const discount = Math.min(subtotal, Math.max(0, v));
    return {
      subtotal,
      discount,
      final: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
      discountLabel: `$${formatPartnerMoney(discount)}`,
    };
  }

  return {
    subtotal,
    discount: 0,
    final: subtotal,
    discountLabel: null,
  };
}
