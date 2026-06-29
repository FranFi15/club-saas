import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

function normalizeConnectionString(connectionString) {
    return String(connectionString).replace(/([^:]\/)\/+/g, '$1');
}

/**
 * Crea el primer usuario admin_club en la BD del tenant.
 */
export async function createClubAdminInTenant(connectionString, admin) {
    const { nombre, apellido, email, password } = admin || {};
    if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password) {
        throw new Error('Faltan datos del administrador del club.');
    }
    if (String(password).length < 6) {
        throw new Error('La contraseña del administrador debe tener al menos 6 caracteres.');
    }

    const cs = normalizeConnectionString(connectionString);
    let conn;
    try {
        conn = await mongoose.createConnection(cs).asPromise();
        const users = conn.db.collection('users');

        const normalizedEmail = String(email).trim().toLowerCase();
        const exists = await users.findOne({ email: normalizedEmail });
        if (exists) {
            throw new Error('Ya existe un usuario con ese email en el club.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(String(password), salt);
        const now = new Date();

        const doc = {
            nombre: String(nombre).trim(),
            apellido: String(apellido).trim(),
            email: normalizedEmail,
            password: hashed,
            rol: 'admin_club',
            estado: 'activo',
            fotoPerfil: '',
            sexo: '',
            dismissedNotificationIds: [],
            expoPushTokens: [],
            createdAt: now,
            updatedAt: now,
        };

        const result = await users.insertOne(doc);
        return {
            _id: result.insertedId,
            nombre: doc.nombre,
            apellido: doc.apellido,
            email: doc.email,
            rol: doc.rol,
        };
    } finally {
        if (conn) await conn.close();
    }
}
