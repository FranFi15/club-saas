import mongoose from 'mongoose';

/**
 * Do not enable mongoose `sanitizeFilter`. It wraps legitimate `$in` / `$lt` / `$gte`
 * in `$eq`, so list endpoints 500 or return nobody (users+family, spaces expire, dates).
 * HTTP payloads are sanitized in index.js with express-mongo-sanitize.
 *
 * Every club lives on the same Atlas cluster, in its own database. A separate
 * mongoose connection per club used to open its own pool (default max 100 per
 * server) and never give those sockets back. M0 caps the cluster at 500
 * connections, so a few clubs plus a restart overflowed it.
 * One client per cluster, then `useDb` for the club database.
 */

const POOL_OPTIONS = {
    maxPoolSize: readPoolSize(),
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 8_000,
    maxConnecting: 2,
};

const pools = new Map();
const announcedDbs = new Set();

function readPoolSize() {
    const n = Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10);
    if (!Number.isFinite(n)) return 10;
    return Math.min(50, Math.max(1, n));
}

export function parseTenantConnectionString(connectionString) {
    const sanitized = String(connectionString || '').trim().replace(/([^:]\/)\/+/g, '$1');
    const match = sanitized.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^/?]+)(\?.*)?$/i);
    if (!match) {
        throw new Error('Connection string de tenant inválida.');
    }
    let dbName = match[2];
    try {
        dbName = decodeURIComponent(dbName);
    } catch {
        /* keep the raw segment */
    }
    return {
        base: match[1],
        dbName,
        query: match[3] || '',
    };
}

function clusterHost(base) {
    const at = base.lastIndexOf('@');
    return at >= 0 ? base.slice(at + 1) : base;
}

async function getClusterPool(base, query) {
    const key = `${base}${query}`;
    const existing = pools.get(key);
    if (existing) {
        const conn = await existing;
        if (conn.readyState === 1 || conn.readyState === 2) return conn;
        pools.delete(key);
    }

    const connecting = mongoose
        .createConnection(`${base}/${query}`, POOL_OPTIONS)
        .asPromise()
        .then((conn) => {
            console.log(`🔌 Pool Mongo compartido (${clusterHost(base)}), máximo ${POOL_OPTIONS.maxPoolSize} por servidor`);
            return conn;
        })
        .catch((error) => {
            pools.delete(key);
            throw error;
        });
    pools.set(key, connecting);
    return connecting;
}

export const getTenantDB = async (urlIdentifier, connectionString) => {
    const { base, dbName, query } = parseTenantConnectionString(connectionString);
    try {
        const pool = await getClusterPool(base, query);
        const tenant = pool.useDb(dbName, { useCache: true });
        if (!announcedDbs.has(dbName)) {
            announcedDbs.add(dbName);
            console.log(`🔌 Base del club lista: ${urlIdentifier}`);
        }
        return tenant;
    } catch (error) {
        console.error(`❌ Error BD tenant ${urlIdentifier}:`, error.message);
        throw error;
    }
};

export async function closeTenantDBs() {
    const pending = [...pools.values()];
    pools.clear();
    announcedDbs.clear();
    await Promise.all(
        pending.map(async (promise) => {
            try {
                const conn = await promise;
                await conn.close();
            } catch (error) {
                console.error('Error cerrando pool Mongo:', error.message);
            }
        }),
    );
}
