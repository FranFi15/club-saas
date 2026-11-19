import mongoose from 'mongoose';

const MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

const clubDiscountSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        roles: [{ type: String, enum: MEMBER_ROLES }],
        cuotasSociales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialFee' }],
        planes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],
        modo: {
            type: String,
            enum: ['porcentaje', 'precio_fijo', 'gratis'],
            required: true,
            default: 'porcentaje',
        },
        valor: { type: Number, default: 0, min: 0 },
        maxEntradasConDescuento: { type: Number, default: 1, min: 1 },
        activo: { type: Boolean, default: true },
        /** When on, block ticket discount if overdue count ≥ maxVencidasParaDescuento. */
        bloquearDescuentoPorVencidas: { type: Boolean, default: true },
        maxVencidasParaDescuento: { type: Number, default: 1, min: 1, max: 36 },
    },
    { timestamps: true },
);

export const getClubDiscountModel = (tenantDB) =>
    tenantDB.models.ClubDiscount || tenantDB.model('ClubDiscount', clubDiscountSchema);
