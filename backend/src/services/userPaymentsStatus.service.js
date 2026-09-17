/**
 * Cuotas abiertas (pendiente / vencido / en_revisión) de un usuario.
 * Usado al dar de baja / reactivar para informar y opcionalmente perdonar.
 */

const OPEN_ESTADOS = ['pendiente', 'vencido', 'en_revision'];

export async function getOpenPaymentsSummary(models, userId) {
    const { Payment } = models;
    if (!Payment || !userId) {
        return { cantidad: 0, montoTotal: 0 };
    }

    const payments = await Payment.find({
        atleta: userId,
        estado: { $in: OPEN_ESTADOS },
    })
        .select('montoFinal estado mes anio tipo')
        .lean();

    const cantidad = payments.length;
    const montoTotal = payments.reduce((s, p) => s + (Number(p.montoFinal) || 0), 0);
    return { cantidad, montoTotal };
}

/** Borra cuotas abiertas (perdón). No toca pagos ya pagados. */
export async function forgiveOpenPayments(models, userId) {
    const { Payment } = models;
    if (!Payment || !userId) return { deleted: 0 };

    const result = await Payment.deleteMany({
        atleta: userId,
        estado: { $in: OPEN_ESTADOS },
    });
    return { deleted: result.deletedCount || 0 };
}
