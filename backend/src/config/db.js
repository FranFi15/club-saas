import mongoose from 'mongoose';

mongoose.set('sanitizeFilter', true);

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