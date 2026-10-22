import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB, { closeDB } from './src/config/db.js'; 

// Importamos las rutas
import adminRoutes from './src/routes/admin.routes.js';
import clubRoutes from './src/routes/club.routes.js';

// Conectamos a la base de datos principal (la tuya, la del Super-Admin)
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Endpoints
app.use('/api/admin', adminRoutes);
app.use('/api/clubs', clubRoutes);

app.get('/', (req, res) => {
  res.status(200).send('⚙️ Servidor Super-Admin SaaS funcionando correctamente.');
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'club-super' });
});

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Super-Admin] Servidor corriendo en puerto ${PORT}`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[Super-Admin] Cerrando Mongo (${signal})`);
  server.close();
  const force = setTimeout(() => process.exit(0), 5_000);
  force.unref();
  try {
    await closeDB();
  } catch (err) {
    console.error('[Super-Admin] No se pudo cerrar Mongo:', err.message);
  }
  clearTimeout(force);
  process.exit(0);
}
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
