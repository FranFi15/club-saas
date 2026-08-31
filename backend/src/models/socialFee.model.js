import mongoose from 'mongoose';

/** Roles de cliente que pagan cuota social por defecto. */
export const SOCIAL_FEE_DEFAULT_ROLES = ['atleta', 'tutor', 'socio'];

/** Roles que pueden ser alcanzados por la cuota social. */
export const SOCIAL_FEE_ELIGIBLE_ROLES = ['atleta', 'tutor', 'socio'];

/**
 * Configuración de la cuota social del club: un único documento por tenant.
 * `singletonKey` garantiza esa unicidad y permite upserts atómicos.
 */
const socialFeeSchema = new mongoose.Schema(
    {
        singletonKey: {
            type: String,
            default: 'social-fee',
            unique: true,
            immutable: true,
        },
        nombre: { type: String, default: 'Cuota social', trim: true },
        descripcion: { type: String, trim: true, default: '' },
        monto: { type: Number, default: 0, min: 0 },
        diaVencimiento: { type: Number, default: 10, min: 1, max: 28 },
        /** Recargo % sobre montoFinal al pasar a vencido. */
        porcentajeRecargo: { type: Number, default: 0, min: 0, max: 100 },
        /** Mientras esté en false no se generan cuotas sociales. */
        activo: { type: Boolean, default: false },
        rolesAplicables: { type: [String], default: SOCIAL_FEE_DEFAULT_ROLES },
    },
    { timestamps: true },
);

export const getSocialFeeModel = (tenantDB) =>
    tenantDB.models.SocialFee || tenantDB.model('SocialFee', socialFeeSchema);

/** Devuelve la configuración del club, creándola con valores por defecto si no existe. */
export async function getOrCreateSocialFee(SocialFee) {
    const existing = await SocialFee.findOne({ singletonKey: 'social-fee' });
    if (existing) return existing;
    return SocialFee.create({ singletonKey: 'social-fee' });
}
