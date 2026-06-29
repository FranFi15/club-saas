import express from 'express';
import { createTrainingPlan, getTrainingPlan, getTacticalAnalytics } from '../controllers/training.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/plans', protect, authorize('admin_club', 'profe', 'preparador_fisico'), createTrainingPlan);
router.get('/plans/:id', protect, getTrainingPlan);
router.get('/analytics/:categoriaId', protect, authorize('admin_club', 'profe', 'preparador_fisico'), getTacticalAnalytics);

// Si en el futuro querés agregar PUT o DELETE para los planes, van acá.

export default router;