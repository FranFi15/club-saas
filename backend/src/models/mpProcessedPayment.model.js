import mongoose from 'mongoose';

/** Idempotencia de webhooks/sync MP: un payment id de MP se aplica una sola vez. */
const mpProcessedPaymentSchema = new mongoose.Schema(
    {
        mpPaymentId: { type: String, required: true, trim: true },
        externalReference: { type: String, default: '' },
        tipo: { type: String, default: '' },
        appliedIds: [{ type: String }],
        status: {
            type: String,
            enum: ['applied', 'skipped'],
            default: 'applied',
        },
        reason: { type: String, default: '' },
    },
    { timestamps: true },
);

mpProcessedPaymentSchema.index({ mpPaymentId: 1 }, { unique: true });

export const getMpProcessedPaymentModel = (tenantDB) =>
    tenantDB.models.MpProcessedPayment ||
    tenantDB.model('MpProcessedPayment', mpProcessedPaymentSchema);
