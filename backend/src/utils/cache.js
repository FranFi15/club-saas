import NodeCache from 'node-cache';

// TTL de 10 minutos (600 segundos)
// checkperiod: cada 2 minutos limpia elementos vencidos internamente
export const tenantCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

export const getCachedTenant = (clubIdentifier) => {
    return tenantCache.get(clubIdentifier);
};

export const setCachedTenant = (clubIdentifier, connectionStringDB) => {
    tenantCache.set(clubIdentifier, connectionStringDB);
};

export const clearCachedTenant = (clubIdentifier) => {
    tenantCache.del(clubIdentifier);
};
