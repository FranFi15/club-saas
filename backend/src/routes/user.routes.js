import express from 'express';
import {
    registerUser,
    updateMyProfile,
    updateUserAsAdmin,
    deactivateAthlete,
    getUsers,
    getMe,
    getMisHijos,
    setTutorAthleteCuotasEnApp,
    getTutorDashboard,
    registerPushToken,
    removePushToken,
} from '../controllers/user.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';


const router = express.Router();

// GET /api/users - Obtener todos los usuarios con paginación
router.get('/', protect, authorize('admin_club', 'administrativo'), getUsers);

// POST /api/users — alta de usuarios por staff del club
router.post('/', protect, authorize('admin_club', 'administrativo'), registerUser);

router.get('/me', protect, getMe);
router.get('/mis-hijos', protect, authorize('tutor'), getMisHijos);
router.patch(
    '/mis-hijos/:atletaId/cuotas-en-app',
    protect,
    authorize('tutor'),
    setTutorAthleteCuotasEnApp,
);
router.get('/tutor-dashboard', protect, authorize('tutor'), getTutorDashboard);

router.post('/push-token', protect, registerPushToken);
router.delete('/push-token', protect, removePushToken);

// Ruta de Autoservicio: Cualquier usuario logueado puede acceder
router.patch('/profile', protect, updateMyProfile);

// Ruta Administrativa: Solo el staff de alto rango
router.patch('/:id', protect, authorize('admin_club', 'administrativo'), updateUserAsAdmin);
router.patch('/atletas/:id/deactivate', protect, authorize('admin_club', 'administrativo'), deactivateAthlete);

export default router;