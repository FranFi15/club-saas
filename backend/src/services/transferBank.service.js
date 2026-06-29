import { getOrCreateClubSettings } from './familyDiscount.service.js';

function normalizeBankField(value, maxLen) {
    if (value == null) return '';
    return String(value).trim().slice(0, maxLen);
}

export function transferBankFromDoc(doc) {
    return {
        titular: doc?.transferenciaTitular || '',
        banco: doc?.transferenciaBanco || '',
        cbu: doc?.transferenciaCbu || '',
        alias: doc?.transferenciaAlias || '',
    };
}

export async function getTransferBankData(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return transferBankFromDoc(doc);
}

export async function setTransferBankData(models, body) {
    const { ClubSettings } = models;
    await getOrCreateClubSettings(ClubSettings);

    const update = {
        transferenciaTitular: normalizeBankField(body.titular, 120),
        transferenciaBanco: normalizeBankField(body.banco, 80),
        transferenciaCbu: normalizeBankField(body.cbu, 22).replace(/\D/g, ''),
        transferenciaAlias: normalizeBankField(body.alias, 30),
    };

    await ClubSettings.findOneAndUpdate({}, update, { upsert: true });
    const doc = await ClubSettings.findOne().lean();
    return transferBankFromDoc(doc);
}
