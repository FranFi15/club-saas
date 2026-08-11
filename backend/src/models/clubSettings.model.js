import mongoose from 'mongoose';

const clubSettingsSchema = new mongoose.Schema(
    {
        mercadopagoAccessToken: { type: String, default: '' },
        mercadopagoRefreshToken: { type: String, default: '' },
        mercadopagoAccessTokenExpiresAt: { type: Date },

        /** PKCE OAuth: válido hasta completar redirect (unos minutos). */
        mpOAuthCodeVerifier: { type: String, default: '' },
        mpOAuthStateNonce: { type: String, default: '' },

        /** % de descuento por defecto para familias nuevas (tutor + atletas). */
        descuentoFamiliarGlobal: { type: Number, default: 0, min: 0, max: 100 },

        /** Si hay menos sesiones programadas futuras que este número, el cron rellena. */
        sesionesMinimoFuturas: { type: Number, default: 30, min: 1, max: 365 },

        /** Fórmula de % grasa para todo el club (nutricionista). */
        metodoGrasaCorporal: {
            type: String,
            enum: ['durnin_siri', 'carter'],
            default: 'durnin_siri',
        },

        /** Datos bancarios para pagos por transferencia (visible a tutores/atletas). */
        transferenciaTitular: { type: String, default: '' },
        transferenciaBanco: { type: String, default: '' },
        transferenciaCbu: { type: String, default: '' },
        transferenciaAlias: { type: String, default: '' },
    },
    { timestamps: true }
);

/** Singleton por tenant: configuración integraciones (Mercado Pago, etc.). */
export const getClubSettingsModel = (tenantDB) => {
    return tenantDB.models.ClubSettings || tenantDB.model('ClubSettings', clubSettingsSchema);
};
