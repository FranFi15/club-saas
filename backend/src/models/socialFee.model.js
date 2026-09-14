import mongoose from 'mongoose';

/** Roles de cliente que pueden recibir cuota social. */
export const SOCIAL_FEE_DEFAULT_ROLES = ['atleta', 'tutor', 'socio'];

/** Roles que pueden ser alcanzados por la cuota social. */
export const SOCIAL_FEE_ELIGIBLE_ROLES = ['atleta', 'tutor', 'socio'];

/**
 * Tipos de cuota social del club (varios por tenant).
 * `rolesAutoAsignacion`: roles que reciben este tipo automáticamente
 * (a lo sumo un fee activo por rol).
 */
const socialFeeSchema = new mongoose.Schema(
    {
        /** Legacy singleton key — kept optional for migration; no longer unique. */
        singletonKey: { type: String, trim: true, default: undefined },
        nombre: { type: String, default: 'Cuota social', trim: true },
        descripcion: { type: String, trim: true, default: '' },
        monto: { type: Number, default: 0, min: 0 },
        diaVencimiento: { type: Number, default: 10, min: 1, max: 28 },
        /** Recargo % sobre montoFinal al pasar a vencido. */
        porcentajeRecargo: { type: Number, default: 0, min: 0, max: 100 },
        /** Mientras esté en false no se generan cuotas de este tipo. */
        activo: { type: Boolean, default: false },
        /** Roles que auto-asignan este fee a usuarios no exentos. */
        rolesAutoAsignacion: { type: [String], default: [] },
        /** @deprecated Prefer rolesAutoAsignacion — kept for legacy reads. */
        rolesAplicables: { type: [String], default: undefined },
    },
    { timestamps: true },
);

socialFeeSchema.index({ activo: 1, rolesAutoAsignacion: 1 });

export const getSocialFeeModel = (tenantDB) =>
    tenantDB.models.SocialFee || tenantDB.model('SocialFee', socialFeeSchema);

export function feeAutoRoles(fee) {
    if (!fee) return [];
    if (Array.isArray(fee.rolesAutoAsignacion) && fee.rolesAutoAsignacion.length) {
        return fee.rolesAutoAsignacion;
    }
    if (Array.isArray(fee.rolesAplicables) && fee.rolesAplicables.length) {
        return fee.rolesAplicables;
    }
    return [];
}
