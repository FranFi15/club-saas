/**
 * Genera la cuota social del mes para todos los clientes alcanzados.
 * La cuota social es independiente del plan de inscripción: un usuario puede
 * tener cuotas de entrenamiento y además una cuota social del mismo período.
 */
import {
    getOrCreateSocialFee,
    SOCIAL_FEE_DEFAULT_ROLES,
    SOCIAL_FEE_ELIGIBLE_ROLES,
} from '../models/socialFee.model.js';

export function sanitizeSocialFeeRoles(roles) {
    if (!Array.isArray(roles)) return [...SOCIAL_FEE_DEFAULT_ROLES];
    const clean = roles.filter((r) => SOCIAL_FEE_ELIGIBLE_ROLES.includes(r));
    return clean.length ? [...new Set(clean)] : [...SOCIAL_FEE_DEFAULT_ROLES];
}

/** Config vigente + roles saneados. Devuelve null si no se debe facturar. */
export async function getActiveSocialFee(models) {
    const { SocialFee } = models;
    const config = await getOrCreateSocialFee(SocialFee);
    if (!config?.activo) return null;
    if (!(Number(config.monto) > 0)) return null;
    return config;
}

/**
 * Crea la cuota social de un período para un usuario si aún no existe.
 * @returns {{ created: boolean, omitted: boolean, reason?: string }}
 */
export async function ensureSocialFeeForUser(models, user, mes, anio, config = null) {
    const { Payment, User } = models;
    if (!user) return { created: false, omitted: true, reason: 'sin_usuario' };

    const cuotaSocial = config || (await getActiveSocialFee(models));
    if (!cuotaSocial) return { created: false, omitted: true, reason: 'cuota_social_inactiva' };

    let usuario = user;
    if (!usuario.rol) {
        usuario = await User.findById(user._id || user).select('rol estado exentoCuotaSocial').lean();
    }
    if (!usuario) return { created: false, omitted: true, reason: 'sin_usuario' };
    if (usuario.estado === 'inactivo') return { created: false, omitted: true, reason: 'inactivo' };
    if (usuario.exentoCuotaSocial) return { created: false, omitted: true, reason: 'exento' };

    const roles = sanitizeSocialFeeRoles(cuotaSocial.rolesAplicables);
    if (!roles.includes(usuario.rol)) {
        return { created: false, omitted: true, reason: 'rol_no_alcanzado' };
    }

    const usuarioId = usuario._id || usuario;
    const yaExiste = await Payment.findOne({ atleta: usuarioId, tipo: 'social', mes, anio })
        .select('_id')
        .lean();
    if (yaExiste) return { created: false, omitted: true, reason: 'ya_existe' };

    const monto = Number(cuotaSocial.monto) || 0;
    const diaVenc = cuotaSocial.diaVencimiento || 10;

    await Payment.create({
        atleta: usuarioId,
        tipo: 'social',
        cuotaSocial: cuotaSocial._id,
        mes,
        anio,
        montoOriginal: monto,
        descuentoAplicado: 0,
        montoFinal: monto,
        fechaVencimiento: new Date(anio, mes - 1, diaVenc, 23, 59, 59),
        estado: 'pendiente',
    });

    return { created: true, omitted: false };
}

/** Cuota social del mes calendario actual (zona del servidor). */
export async function ensureCurrentMonthSocialFeeForUser(models, user) {
    const now = new Date();
    return ensureSocialFeeForUser(models, user, now.getMonth() + 1, now.getFullYear());
}

export async function generateSocialFeesForTenant(models, mes, anio) {
    const { User } = models;

    const config = await getActiveSocialFee(models);
    if (!config) {
        return {
            cuotasCreadas: 0,
            cuotasOmitidas: 0,
            totalProcesados: 0,
            omitido: true,
            motivo: 'La cuota social está desactivada o su monto es 0.',
        };
    }

    const roles = sanitizeSocialFeeRoles(config.rolesAplicables);
    const clientes = await User.find({
        rol: { $in: roles },
        estado: { $ne: 'inactivo' },
        exentoCuotaSocial: { $ne: true },
    })
        .select('rol estado exentoCuotaSocial')
        .lean();

    let cuotasCreadas = 0;
    let cuotasOmitidas = 0;

    for (const cliente of clientes) {
        const result = await ensureSocialFeeForUser(models, cliente, mes, anio, config);
        if (result.created) cuotasCreadas++;
        else cuotasOmitidas++;
    }

    return {
        cuotasCreadas,
        cuotasOmitidas,
        totalProcesados: clientes.length,
        omitido: false,
        roles,
        monto: Number(config.monto) || 0,
    };
}
