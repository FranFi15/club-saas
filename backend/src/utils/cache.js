import NodeCache from 'node-cache';
import { DEFAULT_CLUB_TIMEZONE, normalizeClubTimezone } from './timeHelper.js';

// TTL de 10 minutos (600 segundos)
// checkperiod: cada 2 minutos limpia elementos vencidos internamente
export const tenantCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

/**
 * @returns {{ connectionStringDB: string, timezone: string } | undefined}
 */
export const getCachedTenant = (clubIdentifier) => {
    const raw = tenantCache.get(clubIdentifier);
    if (!raw) return undefined;
    // Compat: entradas viejas guardaban solo el string de conexión
    if (typeof raw === 'string') {
        return { connectionStringDB: raw, timezone: DEFAULT_CLUB_TIMEZONE };
    }
    return {
        connectionStringDB: raw.connectionStringDB,
        timezone: normalizeClubTimezone(raw.timezone),
    };
};

export const setCachedTenant = (clubIdentifier, connectionStringDB, timezone) => {
    tenantCache.set(clubIdentifier, {
        connectionStringDB,
        timezone: normalizeClubTimezone(timezone),
    });
};

export const clearCachedTenant = (clubIdentifier) => {
    tenantCache.del(clubIdentifier);
};
