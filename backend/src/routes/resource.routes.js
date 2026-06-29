import express from 'express';
import { uploadResource, getMyResources, updateResource, deleteResource } from '../controllers/resource.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/me', protect, authorize('atleta', 'tutor'), getMyResources);
router.post('/', protect, authorize('admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), uploadResource);
router.put('/:id', protect, authorize('admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), updateResource);
router.delete('/:id', protect, authorize('admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'), deleteResource);

export default router;