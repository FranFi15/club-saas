import { getOrCreateClubSettings } from './familyDiscount.service.js';

/** Default true: clubs existentes siguen generando el día 1 hasta que lo apaguen. */
export async function isAutoPaymentGenerationEnabled(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return doc.generacionAutomaticaCuotas !== false;
}

export async function getAutoPaymentGenerationSettings(models) {
    const enabled = await isAutoPaymentGenerationEnabled(models);
    return { generacionAutomaticaCuotas: enabled };
}

export async function setAutoPaymentGenerationEnabled(models, enabled) {
    const { ClubSettings } = models;
    const value = enabled !== false && enabled !== 'false' && enabled !== 0 && enabled !== '0';
    await getOrCreateClubSettings(ClubSettings);
    await ClubSettings.findOneAndUpdate(
        {},
        { generacionAutomaticaCuotas: Boolean(value) },
        { upsert: true },
    );
    return { generacionAutomaticaCuotas: Boolean(value) };
}
