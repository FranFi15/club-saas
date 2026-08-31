/** Porcentaje de recargo por mora (0–100). */
export function clampRecargoPct(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 0) return 0;
    if (n > 100) return 100;
    return n;
}

/**
 * Marca cuotas pendientes vencidas y aplica el recargo (del plan o de la cuota
 * social, según el tipo) sobre montoFinal.
 * Idempotente: no vuelve a sumar si ya tiene recargoAplicado > 0.
 */
export async function markOverduePayments(models, extraFilter = {}) {
    const { Payment } = models;
    const ahora = new Date();

    const pending = await Payment.find({
        estado: 'pendiente',
        fechaVencimiento: { $lt: ahora },
        ...extraFilter,
    })
        .populate('plan', 'porcentajeRecargo')
        .populate('cuotaSocial', 'porcentajeRecargo')
        .lean();

    if (!pending.length) return 0;

    const bulkOps = [];
    for (const payment of pending) {
        const origen = payment.tipo === 'social' ? payment.cuotaSocial : payment.plan;
        const pct = clampRecargoPct(origen?.porcentajeRecargo ?? 0);
        let recargo = 0;

        if (pct > 0 && !(payment.recargoAplicado > 0)) {
            recargo = Math.round(((payment.montoFinal || 0) * pct) / 100);
        }

        const update = { estado: 'vencido' };
        if (recargo > 0) {
            update.recargoAplicado = recargo;
            update.porcentajeRecargo = pct;
            update.montoFinal = (payment.montoFinal || 0) + recargo;
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: payment._id },
                update: { $set: update },
            },
        });
    }

    try {
        const result = await Payment.bulkWrite(bulkOps, { ordered: false });
        return result.modifiedCount ?? bulkOps.length;
    } catch (err) {
        console.error('[markOverduePayments] bulkWrite:', err.message);
        return 0;
    }
}
