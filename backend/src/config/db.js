import mongoose from 'mongoose';

/**
 * Do not enable mongoose `sanitizeFilter`. It wraps legitimate `$in` / `$lt` / `$gte`
 * in `$eq`, so list endpoints 500 or return nobody (users+family, spaces expire, dates).
 * HTTP payloads are sanitized in index.js with express-mongo-sanitize.
 */

const connectionCache = {};

export const getTenantDB = async (urlIdentifier, connectionString) => {
    if (connectionCache[urlIdentifier]) {
        return connectionCache[urlIdentifier];
    }

    try {
        console.log(`🔌 Conectando a BD dinámica del club: ${urlIdentifier}`);
        const conn = await mongoose.createConnection(connectionString).asPromise();
        connectionCache[urlIdentifier] = conn;
        return conn;
    } catch (error) {
        console.error(`❌ Error BD tenant ${urlIdentifier}:`, error.message);
        throw error;
    }
};