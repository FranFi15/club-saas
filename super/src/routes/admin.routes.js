import express from 'express';
import { authAdmin, setupAdmin } from '../controllers/admin.controller.js';

const router = express.Router();

// Ruta para loguearse al panel
// POST /api/admin/login
router.post('/login', authAdmin);

// Ruta oculta para crear el primer superadmin o resetear la contraseña
// POST /api/admin/setup
router.post('/setup', setupAdmin);

export default router;