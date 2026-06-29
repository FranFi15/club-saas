import mongoose from 'mongoose';

const enrollmentRequestSchema = new mongoose.Schema(
    {
        solicitante: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        categoria: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
        },
        atletas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
        mensaje: { type: String, trim: true, default: '' },
        estado: {
            type: String,
            enum: ['pendiente', 'aprobada', 'rechazada'],
            default: 'pendiente',
        },
        revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        motivoRechazo: { type: String, trim: true, default: '' },
        fechaResolucion: { type: Date },
    },
    { timestamps: true },
);

enrollmentRequestSchema.index({ categoria: 1, estado: 1 });
enrollmentRequestSchema.index({ solicitante: 1, estado: 1 });

export const getEnrollmentRequestModel = (tenantDB) =>
    tenantDB.models.EnrollmentRequest ||
    tenantDB.model('EnrollmentRequest', enrollmentRequestSchema);
