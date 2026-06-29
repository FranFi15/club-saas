import express from 'express';
import {
    submitWellness,
    getTeamWellness,
    getSessionWellness,
    getMyWellnessToday,
    getAthleteWellnessHistory,
    getCategoryWellnessHistory,
} from '../controllers/wellness.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, submitWellness);
router.get('/mi-hoy', protect, authorize('atleta', 'tutor'), getMyWellnessToday);
router.get(
    '/equipo/:categoriaId',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    getTeamWellness,
);
router.get(
    '/sesion/:sessionId',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    getSessionWellness,
);
router.get(
    '/categoria/:categoriaId/historial',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    getCategoryWellnessHistory,
);
router.get(
    '/atleta/:atletaId/historial',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo', 'administrativo'),
    getAthleteWellnessHistory,
);

export default router;