/**
 * Genera cuotas sociales del mes según la asignación por usuario.
 * Cada persona tiene a lo sumo un tipo (User.cuotaSocialAsignada).
 */
import { feeAutoRoles, SOCIAL_FEE_DEFAULT_ROLES, SOCIAL_FEE_ELIGIBLE_ROLES } from '../models/socialFee.model.js';
import {
    calendarMonthYearInTz,
    DEFAULT_CLUB_TIMEZONE,
    zonedWallTimeToDate,
} from '../utils/timeHelper.js';

export function sanitizeSocialFeeRoles(roles, { allowEmpty = false } = {}) {
    if (!Array.isArray(roles)) {
        return allowEmpty ? [] : [...SOCIAL_FEE_DEFAULT_ROLES];
    }
    const clean = [...new Set(roles.filter((r) => SOCIAL_FEE_ELIGIBLE_ROLES.includes(r)))];
    if (clean.length) return clean;
    return allowEmpty ? [] : [...SOCIAL_FEE_DEFAULT_ROLES];
}

let migrationPromiseByDb = new WeakMap();

/**
 * One-shot per tenant connection: drop legacy unique singleton index,
 * copy rolesAplicables → rolesAutoAsignacion, backfill user assignments.
 */
export async function ensureSocialFeesMigrated(models) {
    const { SocialFee, User } = models;
    const conn = SocialFee?.db;
    if (conn && migrationPromiseByDb.has(conn)) {
        return migrationPromiseByDb.get(conn);
    }

    const run = (async () => {
        try {
            await SocialFee.collection.dropIndex('singletonKey_1');
        } catch {
            /* index may not exist */
        }

        const fees = await SocialFee.find({}).lean();
        for (const fee of fees) {
            const updates = {};
            const hasAuto =
                Array.isArray(fee.rolesAutoAsignacion) && fee.rolesAutoAsignacion.length > 0;
            if (!hasAuto && Array.isArray(fee.rolesAplicables) && fee.rolesAplicables.length) {
                updates.rolesAutoAsignacion = sanitizeSocialFeeRoles(fee.rolesAplicables, {
                    allowEmpty: true,
                });
            }
            if (fee.singletonKey) {
                updates.$unset = { ...(updates.$unset || {}), singletonKey: 1 };
            }
            if (Object.keys(updates).length) {
                const { $unset, ...setFields } = updates;
                const op = {};
                if (Object.keys(setFields).length) op.$set = setFields;
                if ($unset) op.$unset = $unset;
                await SocialFee.updateOne({ _id: fee._id }, op);
            }
        }

        const refreshed = await SocialFee.find({}).lean();
        for (const fee of refreshed) {
            const roles = sanitizeSocialFeeRoles(feeAutoRoles(fee), { allowEmpty: true });
            if (!roles.length || !fee.activo) continue;
            await User.updateMany(
                {
                    rol: { $in: roles },
                    exentoCuotaSocial: { $ne: true },
                    $or: [{ cuotaSocialAsignada: null }, { cuotaSocialAsignada: { $exists: false } }],
                },
                { $set: { cuotaSocialAsignada: fee._id } },
            );
        }
    })();

    if (conn) migrationPromiseByDb.set(conn, run);
    try {
        await run;
    } catch (e) {
        if (conn) migrationPromiseByDb.delete(conn);
        throw e;
    }
    return run;
}

/** Active fee that auto-assigns a given role (at most one expected). */
export async function findDefaultSocialFeeForRole(models, rol) {
    await ensureSocialFeesMigrated(models);
    if (!SOCIAL_FEE_ELIGIBLE_ROLES.includes(rol)) return null;
    const { SocialFee } = models;
    return SocialFee.findOne({
        activo: true,
        monto: { $gt: 0 },
        rolesAutoAsignacion: rol,
    }).lean();
}

/**
 * Claim auto-roles for a fee: remove them from other fees, then assign
 * all non-exempt users of those roles to this fee.
 */
export async function applyRoleAutoAssignment(models, feeDoc) {
    const { SocialFee, User } = models;
    if (!feeDoc?._id) return { assigned: 0, roles: [] };

    const roles = sanitizeSocialFeeRoles(feeAutoRoles(feeDoc), { allowEmpty: true });
    feeDoc.rolesAutoAsignacion = roles;
    feeDoc.rolesAplicables = roles;

    if (roles.length) {
        await SocialFee.updateMany(
            { _id: { $ne: feeDoc._id }, rolesAutoAsignacion: { $in: roles } },
            { $pull: { rolesAutoAsignacion: { $in: roles } } },
        );
        await SocialFee.updateMany(
            { _id: { $ne: feeDoc._id }, rolesAplicables: { $in: roles } },
            { $pull: { rolesAplicables: { $in: roles } } },
        );
    }

    await feeDoc.save();

    if (!feeDoc.activo || !(Number(feeDoc.monto) > 0) || !roles.length) {
        return { assigned: 0, roles };
    }

    const result = await User.updateMany(
        {
            rol: { $in: roles },
            estado: { $ne: 'inactivo' },
            exentoCuotaSocial: { $ne: true },
        },
        { $set: { cuotaSocialAsignada: feeDoc._id } },
    );

    return { assigned: result.modifiedCount ?? result.nModified ?? 0, roles };
}

/** Retarget open (pendiente/vencido) social payment for current month to a fee. */
export async function retargetOpenSocialPayment(models, userId, fee, timezone = DEFAULT_CLUB_TIMEZONE) {
    const { Payment } = models;
    if (!userId || !fee?._id) return null;

    const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
    const payment = await Payment.findOne({
        atleta: userId,
        tipo: 'social',
        mes,
        anio,
        estado: { $in: ['pendiente', 'vencido'] },
    });
    if (!payment) return null;

    const monto = Number(fee.monto) || 0;
    const diaVenc = fee.diaVencimiento || 10;
    payment.cuotaSocial = fee._id;
    payment.montoOriginal = monto;
    payment.descuentoAplicado = 0;
    payment.montoFinal = monto;
    const ymd = `${anio}-${String(mes).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;
    payment.fechaVencimiento = zonedWallTimeToDate(ymd, '23:59', timezone);
    await payment.save();
    return payment;
}

/**
 * Assign a fee to users. Clears exempt when assigning.
 * Retargets open current-month social payments.
 */
export async function assignSocialFeeToUsers(models, feeId, userIds) {
    const { SocialFee, User } = models;
    await ensureSocialFeesMigrated(models);

    const fee = await SocialFee.findById(feeId);
    if (!fee) {
        const err = new Error('Tipo de cuota social no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (!fee.activo || !(Number(fee.monto) > 0)) {
        const err = new Error('Activá el tipo y definí un monto mayor a 0 antes de asignar.');
        err.statusCode = 400;
        throw err;
    }

    const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
    if (!ids.length) {
        const err = new Error('Seleccioná al menos un usuario.');
        err.statusCode = 400;
        throw err;
    }

    const users = await User.find({
        _id: { $in: ids },
        rol: { $in: SOCIAL_FEE_ELIGIBLE_ROLES },
        estado: { $ne: 'inactivo' },
    }).select('_id');

    let assigned = 0;
    for (const u of users) {
        await User.updateOne(
            { _id: u._id },
            { $set: { cuotaSocialAsignada: fee._id, exentoCuotaSocial: false } },
        );
        await retargetOpenSocialPayment(models, u._id, fee);
        assigned += 1;
    }

    return { assigned, fee };
}

/**
 * Crea la cuota social de un período para un usuario si aún no existe.
 * @returns {{ created: boolean, omitted: boolean, reason?: string, updated?: boolean }}
 */
export async function ensureSocialFeeForUser(
    models,
    user,
    mes,
    anio,
    timezone = DEFAULT_CLUB_TIMEZONE,
) {
    const { Payment, User, SocialFee } = models;
    if (!user) return { created: false, omitted: true, reason: 'sin_usuario' };

    await ensureSocialFeesMigrated(models);

    let usuario = user;
    if (usuario.cuotaSocialAsignada === undefined || !usuario.rol) {
        usuario = await User.findById(user._id || user)
            .select('rol estado exentoCuotaSocial cuotaSocialAsignada esPrueba')
            .lean();
    }
    if (!usuario) return { created: false, omitted: true, reason: 'sin_usuario' };
    if (usuario.estado === 'inactivo') return { created: false, omitted: true, reason: 'inactivo' };
    if (usuario.esPrueba && usuario.rol === 'atleta') {
        return { created: false, omitted: true, reason: 'atleta_prueba' };
    }
    if (usuario.exentoCuotaSocial) return { created: false, omitted: true, reason: 'exento' };
    if (!usuario.cuotaSocialAsignada) {
        return { created: false, omitted: true, reason: 'sin_asignacion' };
    }

    const cuotaSocial = await SocialFee.findById(usuario.cuotaSocialAsignada).lean();
    if (!cuotaSocial?.activo) {
        return { created: false, omitted: true, reason: 'cuota_social_inactiva' };
    }
    if (!(Number(cuotaSocial.monto) > 0)) {
        return { created: false, omitted: true, reason: 'monto_cero' };
    }

    const usuarioId = usuario._id || usuario;
    const existente = await Payment.findOne({ atleta: usuarioId, tipo: 'social', mes, anio });
    if (existente) {
        if (['pendiente', 'vencido'].includes(existente.estado)) {
            const sameFee = String(existente.cuotaSocial) === String(cuotaSocial._id);
            const sameMonto = Number(existente.montoFinal) === Number(cuotaSocial.monto);
            if (!sameFee || !sameMonto) {
                await retargetOpenSocialPayment(models, usuarioId, cuotaSocial, timezone);
                return { created: false, omitted: false, updated: true, reason: 'retarget' };
            }
        }
        return { created: false, omitted: true, reason: 'ya_existe' };
    }

    const monto = Number(cuotaSocial.monto) || 0;
    const diaVenc = cuotaSocial.diaVencimiento || 10;
    const ymd = `${anio}-${String(mes).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;

    await Payment.create({
        atleta: usuarioId,
        tipo: 'social',
        cuotaSocial: cuotaSocial._id,
        mes,
        anio,
        montoOriginal: monto,
        descuentoAplicado: 0,
        montoFinal: monto,
        fechaVencimiento: zonedWallTimeToDate(ymd, '23:59', timezone),
        estado: 'pendiente',
    });

    return { created: true, omitted: false };
}

/** Cuota social del mes calendario actual (zona del club). */
export async function ensureCurrentMonthSocialFeeForUser(
    models,
    user,
    timezone = DEFAULT_CLUB_TIMEZONE,
) {
    const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
    return ensureSocialFeeForUser(models, user, mes, anio, timezone);
}

export async function generateSocialFeesForTenant(
    models,
    mes,
    anio,
    timezone = DEFAULT_CLUB_TIMEZONE,
) {
    const { User } = models;
    await ensureSocialFeesMigrated(models);

    const clientes = await User.find({
        rol: { $in: SOCIAL_FEE_ELIGIBLE_ROLES },
        estado: { $ne: 'inactivo' },
        exentoCuotaSocial: { $ne: true },
        cuotaSocialAsignada: { $ne: null },
        esPrueba: { $ne: true },
    })
        .select('rol estado exentoCuotaSocial cuotaSocialAsignada esPrueba')
        .lean();

    if (!clientes.length) {
        return {
            cuotasCreadas: 0,
            cuotasOmitidas: 0,
            cuotasActualizadas: 0,
            totalProcesados: 0,
            omitido: true,
            motivo: 'No hay usuarios con cuota social asignada (o todos están exentos).',
        };
    }

    let cuotasCreadas = 0;
    let cuotasOmitidas = 0;
    let cuotasActualizadas = 0;

    for (const cliente of clientes) {
        const result = await ensureSocialFeeForUser(models, cliente, mes, anio, timezone);
        if (result.created) cuotasCreadas++;
        else if (result.updated) cuotasActualizadas++;
        else cuotasOmitidas++;
    }

    return {
        cuotasCreadas,
        cuotasOmitidas,
        cuotasActualizadas,
        totalProcesados: clientes.length,
        omitido: false,
    };
}

/** Resolve assignment for create/update user payloads. */
export async function resolveUserSocialFeeAssignment(models, { rol, exentoCuotaSocial, cuotaSocialAsignada }) {
    await ensureSocialFeesMigrated(models);
    const exempt = exentoCuotaSocial === true || exentoCuotaSocial === 'true';
    if (exempt || !SOCIAL_FEE_ELIGIBLE_ROLES.includes(rol)) {
        return { exentoCuotaSocial: exempt, cuotaSocialAsignada: null };
    }

    if (cuotaSocialAsignada) {
        const { SocialFee } = models;
        const fee = await SocialFee.findById(cuotaSocialAsignada).lean();
        if (!fee) {
            const err = new Error('Tipo de cuota social no encontrado.');
            err.statusCode = 400;
            throw err;
        }
        return { exentoCuotaSocial: false, cuotaSocialAsignada: fee._id };
    }

    const def = await findDefaultSocialFeeForRole(models, rol);
    return {
        exentoCuotaSocial: false,
        cuotaSocialAsignada: def?._id || null,
    };
}
