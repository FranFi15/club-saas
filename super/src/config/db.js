// src/config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const pool = Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10);
    const maxPoolSize = Number.isFinite(pool) ? Math.min(50, Math.max(1, pool)) : 10;
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 8_000,
      maxConnecting: 2,
    });
    console.log(`🔥 MongoDB conectado: ${conn.connection.host} (pool ${maxPoolSize})`);
  } catch (error) {
    console.error(`❌ Error conectando a MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export async function closeDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
}

export default connectDB;