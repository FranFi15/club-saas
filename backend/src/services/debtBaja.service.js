/**
 * Auto-baja when Plan or SocialFee overdue thresholds are hit.
 * Counters are independent per plan id / social fee id.
 */

export async function evaluateDebtBajaForUser(models, userId) {
    const { User, Payment, Plan, SocialFee } = models;
    const user = await User.findById(userId).select('estado');
    if (!user || user.estado === 'inactivo') return { bajado: false };

    const [planRules, feeRules] = await Promise.all([
        Plan.find({ bajaPorVencidasActiva: true, activo: true })
            .select('_id bajaTrasVencidas nombre')
            .lean(),
        SocialFee.find({ bajaPorVencidasActiva: true, activo: true })
            .select('_id bajaTrasVencidas nombre')
            .lean(),
    ]);

    for (const plan of planRules) {
        const n = Math.max(1, Number(plan.bajaTrasVencidas) || 1);
        const count = await Payment.countDocuments({
            atleta: userId,
            tipo: 'entrenamiento',
            plan: plan._id,
            estado: 'vencido',
        });
        if (count >= n) {
            user.estado = 'inactivo';
            await user.save();
            return {
                bajado: true,
                motivo: `plan:${plan._id}`,
                detalle: `${count} cuota(s) vencida(s) del plan (límite ${n})`,
            };
        }
    }

    for (const fee of feeRules) {
        const n = Math.max(1, Number(fee.bajaTrasVencidas) || 1);
        const count = await Payment.countDocuments({
            atleta: userId,
            tipo: 'social',
            cuotaSocial: fee._id,
            estado: 'vencido',
        });
        if (count >= n) {
            user.estado = 'inactivo';
            await user.save();
            return {
                bajado: true,
                motivo: `social:${fee._id}`,
                detalle: `${count} cuota(s) social(es) vencida(s) (límite ${n})`,
            };
        }
    }

    return { bajado: false };
}

/** After marking payments vencido, evaluate baja for affected users. */
export async function evaluateDebtBajaForPayments(models, payments) {
    const ids = [
        ...new Set(
            (payments || [])
                .map((p) => String(p.atleta || p.user || ''))
                .filter(Boolean),
        ),
    ];
    const results = [];
    for (const uid of ids) {
        try {
            results.push({ userId: uid, ...(await evaluateDebtBajaForUser(models, uid)) });
        } catch (e) {
            console.warn('[debt-baja]', uid, e.message);
        }
    }
    return results;
}

/**
 * Count vencidas relevant to a ClubDiscount rule for a user.
 * Uses linked planes / cuotasSociales when set; otherwise total vencidas.
 */
export async function countVencidasForDiscount(models, userId, discount) {
    const { Payment } = models;
    const planIds = (discount?.planes || []).map((p) => p._id || p).filter(Boolean);
    const feeIds = (discount?.cuotasSociales || []).map((p) => p._id || p).filter(Boolean);

    if (planIds.length || feeIds.length) {
        const or = [];
        if (planIds.length) {
            or.push({ tipo: 'entrenamiento', plan: { $in: planIds }, estado: 'vencido' });
        }
        if (feeIds.length) {
            or.push({ tipo: 'social', cuotaSocial: { $in: feeIds }, estado: 'vencido' });
        }
        return Payment.countDocuments({ atleta: userId, $or: or });
    }

    return Payment.countDocuments({ atleta: userId, estado: 'vencido' });
}

export async function shouldBlockDiscountForDebt(models, userId, discount) {
    if (!discount) return false;
    if (discount.bloquearDescuentoPorVencidas === false) return false;
    const max = Math.max(1, Number(discount.maxVencidasParaDescuento) || 1);
    const count = await countVencidasForDiscount(models, userId, discount);
    return count >= max;
}
