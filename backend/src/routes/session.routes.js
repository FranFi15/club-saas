import express from 'express';
import {
    createSession,
    takeAttendance,
    getSessionsByCategory,
    getSessionsBySpace,
    reprogramarSession,
    cancelSession,
    reopenSession,
    generateSessionsFromSchedule,
    attachTrainingPlanToSession,
    finishSession,
    getCoachAgenda,
    getCoachSessionStats,
    getPendingRelocations,
    bulkRelocateSessions,
    getRestorableSessions,
    bulkRestoreSessions,
    getSessionStatsById,
    getNutricionistaAgenda,
    getPsicologoAgenda,
    getSessionById,
    confirmConsultAttendance,
    cambiarAtletaConsulta,
} from '../controllers/session.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Creación y generación
router.post('/', protect, authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'), createSession);
router.post('/generate', protect, authorize('admin_club', 'administrativo'), generateSessionsFromSchedule);

// Consultas
router.get('/categoria/:categoryId', protect, getSessionsByCategory);
router.get('/espacio/:spaceId', protect, getSessionsBySpace);
router.get('/profe/agenda', protect, authorize('profe', 'preparador_fisico'), getCoachAgenda);
router.get('/reubicacion-pendiente', protect, authorize('profe', 'preparador_fisico', 'admin_club', 'administrativo'), getPendingRelocations);
router.patch('/reubicacion/bulk', protect, authorize('profe', 'preparador_fisico', 'admin_club', 'administrativo'), bulkRelocateSessions);
router.get('/restauracion-disponible', protect, authorize('profe', 'preparador_fisico', 'admin_club', 'administrativo'), getRestorableSessions);
router.patch('/restauracion/bulk', protect, authorize('profe', 'preparador_fisico', 'admin_club', 'administrativo'), bulkRestoreSessions);
router.get('/profe/stats', protect, authorize('profe', 'preparador_fisico'), getCoachSessionStats);
router.get('/nutricionista/agenda', protect, authorize('nutricionista'), getNutricionistaAgenda);
router.get('/psicologo/agenda', protect, authorize('psicologo'), getPsicologoAgenda);
router.patch('/:id/confirmar-asistencia', protect, authorize('atleta', 'tutor'), confirmConsultAttendance);
router.patch(
    '/:id/cambiar-atleta',
    protect,
    authorize('admin_club', 'nutricionista', 'psicologo'),
    cambiarAtletaConsulta,
);
router.get(
    '/:id/stats',
    protect,
    authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    getSessionStatsById
);
router.get('/:id', protect, getSessionById);

// Modificaciones y Operativa
router.put('/:id/asistencia', protect, authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'), takeAttendance);
router.patch('/:id/reprogramar', protect, authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo', 'administrativo'), reprogramarSession);
router.patch(
    '/:id/cancel',
    protect,
    authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'),
    cancelSession
);
router.patch('/:id/reopen', protect, authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'), reopenSession);
router.patch(
    '/:id/plan',
    protect,
    authorize('admin_club', 'profe', 'preparador_fisico'),
    attachTrainingPlanToSession
);

// El cierre de la sesión (Cronómetro PF)
router.patch('/:id/finish', protect, authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'), finishSession);

export default router;