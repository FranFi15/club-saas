import mongoose from 'mongoose';

const clubEntrySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        scannedAt: { type: Date, default: Date.now, index: true },
        tokenNonce: { type: String, default: '' },
        duplicate: { type: Boolean, default: false },
    },
    { timestamps: true },
);

clubEntrySchema.index({ scannedAt: -1 });

export const getClubEntryModel = (tenantDB) => {
    return tenantDB.models.ClubEntry || tenantDB.model('ClubEntry', clubEntrySchema);
};
