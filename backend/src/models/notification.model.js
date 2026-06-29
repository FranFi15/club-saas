import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    usuario: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    tipo: {
        type: String,
        enum: [
            'cuota_vencida',
            'cuota_proxima',
            'pago_registrado',
            'documentacion_entregada',
            'general',
            'intercambio_espacio',
            'consulta_pendiente',
            'consulta_confirmada',
            'consulta_rechazada',
        ],
        default: 'general',
    },
    titulo: { type: String, required: true },
    mensaje: { type: String, required: true },
    leida: { type: Boolean, default: false },
    referencia: { type: mongoose.Schema.Types.ObjectId } // Payment ID u otro documento relacionado
}, { timestamps: true });

// Índice para consultas rápidas por usuario
notificationSchema.index({ usuario: 1, leida: 1, createdAt: -1 });

export const getNotificationModel = (tenantDB) => {
    return tenantDB.models.Notification || tenantDB.model('Notification', notificationSchema);
};
