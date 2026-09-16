import mongoose from 'mongoose';

/** Cuenta usuarios con rol atleta o socio en la BD del tenant (base de facturación). */
export async function countAthletesInTenant(connectionString) {
    if (!connectionString) return null;
    const cs = String(connectionString).replace(/([^:]\/)\/+/g, '$1');
    let conn;
    try {
        conn = await mongoose.createConnection(cs).asPromise();
        const count = await conn.db.collection('users').countDocuments({
            rol: { $in: ['atleta', 'socio'] },
        });
        return count;
    } catch (e) {
        console.warn('[super] countAthletesInTenant:', e.message);
        return null;
    } finally {
        if (conn) await conn.close();
    }
}
