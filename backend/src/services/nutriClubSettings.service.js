import { getOrCreateClubSettings } from './familyDiscount.service.js';

export async function getClubBodyFatMethod(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return doc.metodoGrasaCorporal === 'carter' ? 'carter' : 'durnin_siri';
}

export async function setClubBodyFatMethod(models, metodo) {
    const { ClubSettings } = models;
    const method = metodo === 'carter' ? 'carter' : 'durnin_siri';
    await getOrCreateClubSettings(ClubSettings);
    await ClubSettings.findOneAndUpdate({}, { metodoGrasaCorporal: method }, { upsert: true });
    return method;
}
