import mongoose from 'mongoose';

const clubEntrySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        scannedAt: { type: Date, default: Date.now, index: true },
        tokenNonce: { type: String, required: true },
        duplicate: { type: Boolean, default: false },
    },
    { timestamps: true },
);

clubEntrySchema.index({ scannedAt: -1 });
/** Un QR (nonce) solo puede usarse una vez (ignora docs legacy sin nonce). */
clubEntrySchema.index(
    { tokenNonce: 1 },
    {
        unique: true,
        partialFilterExpression: { tokenNonce: { $exists: true, $type: 'string', $gt: '' } },
    },
);

export const getClubEntryModel = (tenantDB) => {
    return tenantDB.models.ClubEntry || tenantDB.model('ClubEntry', clubEntrySchema);
};
