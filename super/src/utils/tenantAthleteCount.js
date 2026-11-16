import { tenantDb } from './tenantDb.js';

const BILLABLE_MEMBER_ROLES = ['atleta', 'socio'];

/**
 * Cuenta usuarios con rol atleta o socio en la BD del tenant (base de facturación).
 * Incluye `roles[]` (multirol) además del campo legacy `rol`.
 */
export async function countAthletesInTenant(connectionString) {
    if (!connectionString) return null;
    try {
        const count = await tenantDb(connectionString).db.collection('users').countDocuments({
            $or: [
                { rol: { $in: BILLABLE_MEMBER_ROLES } },
                { roles: { $in: BILLABLE_MEMBER_ROLES } },
            ],
        });
        return count;
    } catch (e) {
        console.warn('[super] countAthletesInTenant:', e.message);
        return null;
    }
}
