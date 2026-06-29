/** Porcentaje de recargo por mora (0–100). */
export function clampRecargoPct(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 0) return 0;
    if (n > 100) return 100;
    return n;
}

/**
 * Marca cuotas pendientes vencidas y aplica el recargo del plan sobre montoFinal.
 * Idempotente: no vuelve a sumar si ya tiene recargoAplicado > 0.
 */
export async function markOverduePayments(models, extraFilter = {}) {
    const { Payment } = models;
    const ahora = new Date();

    const pending = await Payment.find({
        estado: 'pendiente',
        fechaVencimiento: { $lt: ahora },
        ...extraFilter,
    }).populate('plan', 'porcentajeRecargo');

    let modified = 0;

    for (const payment of pending) {
        try {
            const pct = clampRecargoPct(payment.plan?.porcentajeRecargo ?? 0);
            let recargo = 0;

            if (pct > 0 && !(payment.recargoAplicado > 0)) {
                const base = payment.montoFinal || 0;
                recargo = Math.round((base * pct) / 100);
            }

            payment.estado = 'vencido';
            if (recargo > 0) {
                payment.recargoAplicado = recargo;
                payment.porcentajeRecargo = pct;
                payment.montoFinal = (payment.montoFinal || 0) + recargo;
            }

            await payment.save();
            modified += 1;
        } catch (err) {
            console.error('[markOverduePayments] Cuota omitida:', payment._id, err.message);
        }
    }

    return modified;
}
