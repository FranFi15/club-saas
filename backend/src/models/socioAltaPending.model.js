import mongoose from 'mongoose';

const socioAltaPendingSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        apellido: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        dni: { type: String, required: true, trim: true },
        telefono: { type: String, default: '', trim: true },
        direccion: { type: String, default: '', trim: true },
        fechaNacimiento: { type: Date, default: null },
        sexo: { type: String, enum: ['M', 'F', ''], default: '' },
        dniFotoFrente: { type: String, required: true, trim: true },
        dniFotoDorso: { type: String, required: true, trim: true },
        socialFee: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialFee', required: true },
        monto: { type: Number, required: true, min: 0 },
        estado: {
            type: String,
            enum: ['pendiente_pago', 'pagado', 'expirado', 'cancelado'],
            default: 'pendiente_pago',
            index: true,
        },
        mpPreferenceId: { type: String, default: '' },
        mpPaymentId: { type: String, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        expiresAt: { type: Date, required: true, index: true },
        ocrMeta: {
            matchedDni: { type: Boolean, default: false },
            matchedName: { type: Boolean, default: false },
            hadDocumentoKeyword: { type: Boolean, default: false },
        },
    },
    { timestamps: true },
);

socioAltaPendingSchema.index({ email: 1, estado: 1 });
socioAltaPendingSchema.index({ dni: 1, estado: 1 });

export const getSocioAltaPendingModel = (tenantDB) => {
    return (
        tenantDB.models.SocioAltaPending ||
        tenantDB.model('SocioAltaPending', socioAltaPendingSchema)
    );
};
