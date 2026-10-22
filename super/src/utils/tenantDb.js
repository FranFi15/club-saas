import mongoose from 'mongoose';

export function tenantDbName(connectionString) {
    const sanitized = String(connectionString || '').trim().replace(/([^:]\/)\/+/g, '$1');
    const match = sanitized.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/i);
    if (!match?.[1]) return '';
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

/** Same Atlas client as the super-admin database. Does not open a new pool. */
export function tenantDb(connectionString) {
    const name = tenantDbName(connectionString);
    if (!name) {
        throw new Error('Connection string del club sin nombre de base.');
    }
    if (mongoose.connection.readyState !== 1) {
        throw new Error('La base central todavía no está conectada.');
    }
    return mongoose.connection.useDb(name, { useCache: true });
}
