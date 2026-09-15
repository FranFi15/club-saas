import mongoose from 'mongoose';

export const SPONSOR_PAYMENT_ESTADOS = ['pendiente', 'pagado'];
export const SPONSOR_PAYMENT_METODOS = ['efectivo', 'transferencia', 'mercado_pago', 'otro'];

/**
 * Aporte mensual de un sponsor al club (control de cobro mes a mes).
 */
const sponsorPaymentSchema = new mongoose.Schema(
    {
        sponsor: { type: mongoose.Schema.Types.ObjectId, ref: 'Sponsor', required: true },
        mes: { type: Number, required: true, min: 1, max: 12 },
        anio: { type: Number, required: true, min: 2000, max: 2100 },
        /** Snapshot del aporte esperado ese mes. */
        monto: { type: Number, required: true, min: 0 },
        estado: {
            type: String,
            enum: SPONSOR_PAYMENT_ESTADOS,
            default: 'pendiente',
        },
        comprobanteUrl: { type: String, trim: true, default: '' },
        fechaPago: { type: Date },
        metodoPago: {
            type: String,
            enum: SPONSOR_PAYMENT_METODOS,
        },
        notas: { type: String, trim: true, default: '' },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

sponsorPaymentSchema.index({ sponsor: 1, anio: 1, mes: 1 }, { unique: true });
sponsorPaymentSchema.index({ anio: 1, mes: 1, estado: 1 });

export const getSponsorPaymentModel = (tenantDB) =>
    tenantDB.models.SponsorPayment || tenantDB.model('SponsorPayment', sponsorPaymentSchema);
