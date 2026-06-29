import express from 'express';
import { createSpace, getSpaces, getAffectedSessions, getFreeSpacesForSlot, getFreeSpacesForSessions, updateSpace, updateSpaceStatus } from '../controllers/space.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin_club'), createSpace);
router.get('/', protect, getSpaces);
router.get('/libres', protect, getFreeSpacesForSlot);
router.post('/libres-para-sesiones', protect, authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico'), getFreeSpacesForSessions);
router.get('/:id/sesiones-afectadas', protect, authorize('admin_club', 'administrativo'), getAffectedSessions);
router.put('/:id', protect, authorize('admin_club'), updateSpace);
router.patch('/:id/estado', protect, authorize('admin_club', 'administrativo'), updateSpaceStatus); // Mantenimiento/Clausura

export default router;