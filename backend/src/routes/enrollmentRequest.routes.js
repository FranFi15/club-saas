import express from 'express';
import {
    getAvailableAthletesForCategory,
    createEnrollmentRequest,
    getPendingEnrollmentRequests,
    resolveEnrollmentRequest,
} from '../controllers/enrollmentRequest.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get(
    '/categoria/:categoriaId/disponibles',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    getAvailableAthletesForCategory,
);

router.post(
    '/',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    createEnrollmentRequest,
);

router.get(
    '/pendientes',
    protect,
    authorize('admin_club', 'administrativo'),
    getPendingEnrollmentRequests,
);

router.patch(
    '/:id/resolver',
    protect,
    authorize('admin_club', 'administrativo'),
    resolveEnrollmentRequest,
);

export default router;
