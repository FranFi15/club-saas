import { tenantDb } from './tenantDb.js';

/** Cuenta usuarios con rol atleta o socio en la BD del tenant (base de facturación). */
export async function countAthletesInTenant(connectionString) {
    if (!connectionString) return null;
    try {
        const count = await tenantDb(connectionString).db.collection('users').countDocuments({
            rol: { $in: ['atleta', 'socio'] },
        });
        return count;
    } catch (e) {
        console.warn('[super] countAthletesInTenant:', e.message);
        return null;
    }
}
