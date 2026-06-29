import mongoose from 'mongoose';

const swapRequestSchema = new mongoose.Schema(
    {
        solicitante: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        /** Sesión de la categoría del coach que pide el cambio */
        sesionOrigen: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Session',
            required: true,
        },
        /** Sesión de la otra categoría (mismo día/horario, otro espacio) */
        sesionDestino: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Session',
            required: true,
        },
        mensaje: { type: String, trim: true, default: '' },
        estado: {
            type: String,
            enum: ['pendiente', 'aceptada', 'rechazada', 'cancelada'],
            default: 'pendiente',
        },
    },
    { timestamps: true },
);

swapRequestSchema.index({ sesionOrigen: 1, sesionDestino: 1, estado: 1 });

export const getSwapRequestModel = (tenantDB) =>
    tenantDB.models.SwapRequest || tenantDB.model('SwapRequest', swapRequestSchema);
