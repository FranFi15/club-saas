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
            'noticia',
            'intercambio_espacio',
            'consulta_pendiente',
            'consulta_confirmada',
            'consulta_rechazada',
            'prueba_expirada',
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
    const existing = tenantDB.models.Notification;
    if (existing) {
        const tipoPath = existing.schema.path('tipo');
        const enums = tipoPath?.enumValues || tipoPath?.options?.enum || [];
        if (Array.isArray(enums) && enums.includes('noticia')) return existing;
        delete tenantDB.models.Notification;
        if (tenantDB.modelSchemas) delete tenantDB.modelSchemas.Notification;
    }
    return tenantDB.model('Notification', notificationSchema);
};
