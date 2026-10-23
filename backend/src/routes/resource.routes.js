import express from 'express';
import {
    uploadResource,
    getSentResources,
    getMyResources,
    updateResource,
    deleteResource,
    recordResourceAccess,
    listResourceAudience,
} from '../controllers/resource.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

const STAFF_ROLES = ['admin_club', 'profe', 'nutricionista', 'psicologo', 'preparador_fisico'];

router.get('/me', protect, authorize('atleta', 'tutor'), getMyResources);
router.get('/', protect, authorize(...STAFF_ROLES), getSentResources);
router.post('/', protect, authorize(...STAFF_ROLES), uploadResource);
router.post('/:id/acceso', protect, authorize('atleta', 'tutor'), recordResourceAccess);
router.get('/:id/accesos', protect, authorize(...STAFF_ROLES), listResourceAudience);
router.put('/:id', protect, authorize(...STAFF_ROLES), updateResource);
router.delete('/:id', protect, authorize(...STAFF_ROLES), deleteResource);

export default router;