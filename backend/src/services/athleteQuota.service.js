import axios from 'axios';

export async function countClubAthletes(models) {
    const { User } = models;
    return User.countDocuments({ rol: 'atleta' });
}

async function superInternalRequest(clubIdentifier, method, pathSuffix = '', body) {
    const superUrl = process.env.SUPER_ADMIN_URL;
    const key = process.env.INTERNAL_ADMIN_API_KEY;
    if (!superUrl || !key || !clubIdentifier) return null;

    const base = `${superUrl.replace(/\/$/, '')}/api/clubs/internal/${clubIdentifier}`;
    const url = pathSuffix ? `${base}/${pathSuffix}` : base;
    const config = {
        method,
        url,
        headers: { 'x-internal-api-key': key },
        timeout: 15000,
        ...(body != null ? { data: body } : {}),
    };
    const { data } = await axios(config);
    return data;
}

/** Sincroniza userCount en super con atletas reales del tenant (facturación por cantidad). */
export async function syncAthleteCountToSuper(models, clubIdentifier) {
    if (!clubIdentifier) return;
    try {
        const count = await countClubAthletes(models);
        await superInternalRequest(clubIdentifier, 'patch', 'athlete-count', { count });
    } catch (e) {
        console.warn('[athlete-count] No se pudo sincronizar conteo:', e.response?.data?.message || e.message);
    }
}
