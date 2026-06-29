import express from 'express';
const router = express.Router();
import {
    createRequirement,
    submitDocument,
    reviewSubmission,
    getMyRequirements,
    getStaffSubmissions,
} from '../controllers/requirement.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const STAFF_DOC_ROLES = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo', 'admin_club', 'administrativo'];

router.get('/submissions', protect, authorize(...STAFF_DOC_ROLES), getStaffSubmissions);
const MEMBER_DOC_ROLES = [
    'atleta',
    'tutor',
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
    'administrativo',
    'admin_club',
];

router.get('/me', protect, authorize(...MEMBER_DOC_ROLES), getMyRequirements);
router.post('/', protect, authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'), createRequirement);
router.post('/submit', protect, authorize(...MEMBER_DOC_ROLES), submitDocument);
router.patch('/submissions/:id/review', protect, authorize(...STAFF_DOC_ROLES), reviewSubmission);

export default router;