import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './src/config/db.js'; 

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
  res.send('⚙️ Servidor Super-Admin SaaS funcionando correctamente.');
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[Super-Admin] Servidor corriendo en puerto ${PORT}`);
});