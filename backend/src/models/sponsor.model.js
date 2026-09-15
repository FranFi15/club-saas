import mongoose from 'mongoose';

/** Roles de cliente que pueden ver beneficios de sponsors. */
export const SPONSOR_MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

/**
 * Sponsors del club: aporte mensual + beneficios para miembros al día
 * según rol y/o tipo de cuota social.
 */
const sponsorSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        /** CUIT / registro / razón social corta. */
        registro: { type: String, trim: true, default: '' },
        fotoUrl: { type: String, trim: true, default: '' },
        montoMensual: { type: Number, default: 0, min: 0 },
        /** Texto libre de beneficios (líneas separadas por salto). */
        beneficios: { type: String, trim: true, default: '' },
        /** Roles alcanzados (atleta / tutor / socio). */
        rolesAplicables: [{ type: String, enum: SPONSOR_MEMBER_ROLES }],
        /** Tipos de cuota social alcanzados. */
        cuotasSociales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialFee' }],
        activo: { type: Boolean, default: true },
        /** Primer mes con control de aportes (no se generan pagos en meses anteriores). */
        desdeMes: { type: Number, min: 1, max: 12 },
        desdeAnio: { type: Number, min: 2000, max: 2100 },
    },
    { timestamps: true },
);

sponsorSchema.index({ activo: 1 });

export const getSponsorModel = (tenantDB) =>
    tenantDB.models.Sponsor || tenantDB.model('Sponsor', sponsorSchema);
