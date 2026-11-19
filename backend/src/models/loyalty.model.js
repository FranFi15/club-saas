import mongoose from 'mongoose';

const loyaltySettingsSchema = new mongoose.Schema(
    {
        singletonKey: { type: String, default: 'default', unique: true },
        enabled: { type: Boolean, default: false },
        nombrePuntos: { type: String, trim: true, default: 'Créditos' },
        valorPuntoPesos: { type: Number, default: 1, min: 0 },
        diasVigenciaPuntos: { type: Number, default: 90, min: 1, max: 3650 },
        /** Points earned per on-time paid cuota (fixed). 0 = disabled. */
        puntosPorCuotaAlDia: { type: Number, default: 0, min: 0 },
        /** Points per $1 of partner-reported sale. */
        puntosPorPesoVentaPartner: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true },
);

const REASONS = [
    'cuota_al_dia',
    'ajuste_admin',
    'venta_partner',
    'canje',
    'reversa',
    'expiracion',
];

const loyaltyLedgerEntrySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        delta: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        reason: { type: String, enum: REASONS, required: true },
        ref: { type: String, trim: true, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, trim: true, default: '' },
        /** Remaining points from this credit batch (FIFO). Only for positive credits. */
        remaining: { type: Number, default: 0, min: 0 },
        expiresAt: { type: Date, default: null },
    },
    { timestamps: true },
);

loyaltyLedgerEntrySchema.index({ user: 1, createdAt: -1 });
loyaltyLedgerEntrySchema.index({ user: 1, expiresAt: 1, remaining: 1 });
loyaltyLedgerEntrySchema.index(
    { reason: 1, ref: 1 },
    { unique: true, partialFilterExpression: { ref: { $type: 'string', $gt: '' } } },
);

const loyaltyRewardSchema = new mongoose.Schema(
    {
        sponsor: { type: mongoose.Schema.Types.ObjectId, ref: 'Sponsor', required: true },
        titulo: { type: String, required: true, trim: true },
        descripcion: { type: String, trim: true, default: '' },
        fotoUrl: { type: String, trim: true, default: '' },
        /** Display crop for member cards: 16:9 | 4:3 | 1:1 | 3:4 */
        fotoAspect: {
            type: String,
            enum: ['16:9', '4:3', '1:1', '3:4'],
            default: '16:9',
        },
        costoPuntos: { type: Number, required: true, min: 1 },
        /** Roles that may redeem this discount (empty = use sponsor.rolesCanjeCreditos). */
        rolesCanje: [{ type: String }],
        tipo: {
            type: String,
            enum: ['porcentaje', 'monto_fijo', 'texto'],
            default: 'porcentaje',
        },
        valor: { type: Number, default: 0, min: 0 },
        activo: { type: Boolean, default: true },
        stock: { type: Number, default: null, min: 0 },
        vigenciaHasta: { type: Date, default: null },
    },
    { timestamps: true },
);

loyaltyRewardSchema.index({ sponsor: 1, activo: 1 });

const loyaltyRedemptionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        reward: { type: mongoose.Schema.Types.ObjectId, ref: 'LoyaltyReward', required: true },
        sponsor: { type: mongoose.Schema.Types.ObjectId, ref: 'Sponsor', required: true },
        puntosGastados: { type: Number, required: true, min: 1 },
        codigo: { type: String, required: true, trim: true, uppercase: true },
        tokenNonce: { type: String, required: true, trim: true },
        estado: {
            type: String,
            enum: ['pendiente', 'usado', 'anulado', 'expirado'],
            default: 'pendiente',
        },
        /**
         * true = credits debit when partner confirms (new flow).
         * missing/false = legacy canjes that already debited on create.
         */
        chargeOnConfirm: { type: Boolean, default: true },
        expiresAt: { type: Date, required: true },
        usadoEn: { type: Date, default: null },
        validadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        snapshotTitulo: { type: String, trim: true, default: '' },
        snapshotTipo: { type: String, trim: true, default: '' },
        snapshotValor: { type: Number, default: 0 },
    },
    { timestamps: true },
);

loyaltyRedemptionSchema.index({ codigo: 1 }, { unique: true });
loyaltyRedemptionSchema.index({ tokenNonce: 1 }, { unique: true });
loyaltyRedemptionSchema.index({ user: 1, estado: 1 });
loyaltyRedemptionSchema.index({ sponsor: 1, estado: 1 });

const loyaltyPartnerSaleSchema = new mongoose.Schema(
    {
        sponsor: { type: mongoose.Schema.Types.ObjectId, ref: 'Sponsor', required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        monto: { type: Number, required: true, min: 0 },
        puntosOtorgados: { type: Number, required: true, min: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        note: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

loyaltyPartnerSaleSchema.index({ sponsor: 1, createdAt: -1 });
loyaltyPartnerSaleSchema.index({ user: 1, createdAt: -1 });

export const getLoyaltySettingsModel = (tenantDB) =>
    tenantDB.models.LoyaltySettings || tenantDB.model('LoyaltySettings', loyaltySettingsSchema);

export const getLoyaltyLedgerEntryModel = (tenantDB) =>
    tenantDB.models.LoyaltyLedgerEntry ||
    tenantDB.model('LoyaltyLedgerEntry', loyaltyLedgerEntrySchema);

export const getLoyaltyRewardModel = (tenantDB) =>
    tenantDB.models.LoyaltyReward || tenantDB.model('LoyaltyReward', loyaltyRewardSchema);

export const getLoyaltyRedemptionModel = (tenantDB) =>
    tenantDB.models.LoyaltyRedemption ||
    tenantDB.model('LoyaltyRedemption', loyaltyRedemptionSchema);

export const getLoyaltyPartnerSaleModel = (tenantDB) =>
    tenantDB.models.LoyaltyPartnerSale ||
    tenantDB.model('LoyaltyPartnerSale', loyaltyPartnerSaleSchema);

export const LOYALTY_REASONS = REASONS;
