import mongoose from 'mongoose';

// 1. PRIMERO DECLARAMOS EL PLAN
const planSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, 
    monto: { type: Number, required: true },
    descripcion: { type: String },
    diaVencimiento: { type: Number, default: 10, min: 1, max: 28 }, // Día del mes en que vence la cuota
    /** Recargo % sobre montoFinal al pasar a vencido (después del descuento de inscripción). */
    porcentajeRecargo: { type: Number, default: 0, min: 0, max: 100 },
    activo: { type: Boolean, default: true }
}, { timestamps: true });

// 2. DESPUÉS DECLARAMOS EL PAGO
const paymentSchema = new mongoose.Schema({
    atleta: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    mes: { type: Number, required: true }, 
    anio: { type: Number, required: true },
    montoOriginal: { type: Number, required: true }, 
    descuentoAplicado: { type: Number, default: 0 }, 
    motivoDescuento: { type: String },               
    montoFinal: { type: Number, required: true },
    recargoAplicado: { type: Number, default: 0 },
    porcentajeRecargo: { type: Number, default: 0 },
    fechaVencimiento: { type: Date }, // Fecha límite de pago
    metodoPago: { 
        type: String, 
        enum: ['mercado_pago', 'efectivo', 'transferencia', 'otro'],
        default: 'efectivo'
    },
    estado: { 
        type: String, 
        enum: ['pendiente', 'pagado', 'vencido', 'en_revision'], 
        default: 'pendiente' 
    },
    fechaPago: { type: Date },
    comprobante: { type: String }, 
    notasAdmin: { type: String },
    fechaEnvioComprobante: { type: Date },
    motivoRechazo: { type: String },
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Agrupa cuotas pagadas con un mismo comprobante de transferencia. */
    transferGrupoId: { type: String },
}, { timestamps: true });

// Índice para optimizar consultas de vencimiento
paymentSchema.index({ estado: 1, fechaVencimiento: 1 });
paymentSchema.index({ estado: 1, transferGrupoId: 1 });

// 3. AL FINAL DE TODO EXPORTAMOS AMBOS
export const getPlanModel = (tenantDB) => tenantDB.models.Plan || tenantDB.model('Plan', planSchema);
export const getPaymentModel = (tenantDB) => tenantDB.models.Payment || tenantDB.model('Payment', paymentSchema);