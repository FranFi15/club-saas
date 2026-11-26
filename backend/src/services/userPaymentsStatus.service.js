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

/**
 * Resumen financiero por socio para listados admin:
 * - mes actual (estado + monto)
 * - total de cuotas vencidas (cantidad + monto)
 */
export async function getUsersFinanceSummaries(models, userIds, { mes, anio } = {}) {
    const { Payment } = models;
    const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
    const empty = () => ({
        mesActual: { estado: 'sin_cuota', monto: 0, mes: mes || null, anio: anio || null },
        vencidas: { cantidad: 0, montoTotal: 0 },
    });
    const out = Object.fromEntries(ids.map((id) => [id, empty()]));
    if (!Payment || !ids.length || !mes || !anio) return out;

    const objectIds = ids.map((id) => id);
    const payments = await Payment.find({
        atleta: { $in: objectIds },
        $or: [
            { mes, anio },
            { estado: 'vencido' },
        ],
    })
        .select('atleta estado montoFinal mes anio')
        .lean();

    for (const p of payments) {
        const uid = String(p.atleta);
        if (!out[uid]) out[uid] = empty();
        if (Number(p.mes) === Number(mes) && Number(p.anio) === Number(anio)) {
            out[uid].mesActual = {
                estado: p.estado || 'sin_cuota',
                monto: Number(p.montoFinal) || 0,
                mes,
                anio,
            };
        }
        if (p.estado === 'vencido') {
            out[uid].vencidas.cantidad += 1;
            out[uid].vencidas.montoTotal += Number(p.montoFinal) || 0;
        }
    }
    return out;
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
