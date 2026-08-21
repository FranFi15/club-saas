import mongoose from 'mongoose';

export const BILL_METODOS = ['efectivo', 'transferencia', 'mercado_pago', 'otro'];
export const BILL_ESTADOS = ['pendiente', 'pagado'];

const billSchema = new mongoose.Schema(
    {
        concepto: { type: String, required: true, trim: true },
        monto: { type: Number, required: true, min: 0 },
        fecha: { type: Date, default: Date.now },
        estado: {
            type: String,
            enum: BILL_ESTADOS,
            default: 'pendiente',
        },
        facturaUrl: { type: String, trim: true, default: '' },
        pagoComprobanteUrl: { type: String, trim: true, default: '' },
        fechaPago: { type: Date },
        metodoPago: {
            type: String,
            enum: BILL_METODOS,
        },
        notas: { type: String, trim: true, default: '' },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

billSchema.index({ estado: 1, fecha: -1 });
billSchema.index({ createdAt: -1 });

export const getBillModel = (tenantDB) =>
    tenantDB.models.Bill || tenantDB.model('Bill', billSchema);
