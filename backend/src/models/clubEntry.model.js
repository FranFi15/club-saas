import mongoose from 'mongoose';

const clubEntrySchema = new mongoose.Schema(
    {
        entryType: {
            type: String,
            enum: ['member', 'visitor'],
            default: 'member',
            index: true,
        },
        /** Socio del club (solo ingresos por QR). */
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
        scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        scannedAt: { type: Date, default: Date.now, index: true },
        /** Nonce del QR — solo ingresos de socio. */
        tokenNonce: { type: String, required: false, default: '' },
        duplicate: { type: Boolean, default: false },

        /** Visitante externo (sin cuenta en el club). */
        visitorNombre: { type: String, trim: true, default: '' },
        visitorApellido: { type: String, trim: true, default: '' },
        visitorDni: { type: String, trim: true, default: '' },
        visitorFoto: { type: String, trim: true, default: '' },
        visitorNota: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

clubEntrySchema.pre('validate', function () {
    const type = this.entryType || 'member';
    if (type === 'visitor') {
        if (!String(this.visitorNombre || '').trim()) {
            this.invalidate('visitorNombre', 'El nombre del visitante es obligatorio.');
        }
        if (!String(this.visitorApellido || '').trim()) {
            this.invalidate('visitorApellido', 'El apellido del visitante es obligatorio.');
        }
        if (!String(this.visitorDni || '').trim()) {
            this.invalidate('visitorDni', 'El DNI del visitante es obligatorio.');
        }
        // Visitantes no llevan socio vinculado.
        this.user = undefined;
        return;
    }

    if (!this.user) {
        this.invalidate('user', 'El ingreso de socio requiere un usuario.');
    }
    if (!this.tokenNonce) {
        this.invalidate('tokenNonce', 'El ingreso de socio requiere un nonce de QR.');
    }
});

clubEntrySchema.index({ scannedAt: -1 });
/** Un QR (nonce) solo puede usarse una vez (ignora docs sin nonce / visitantes). */
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
