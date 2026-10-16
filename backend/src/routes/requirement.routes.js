import express from 'express';
const router = express.Router();
import {
    createRequirement,
    submitDocument,
    reviewSubmission,
    getMyRequirements,
    getStaffSubmissions,
    listStaffRequirements,
    listRequirementFolders,
    createRequirementFolder,
    updateRequirementFolder,
    deleteRequirementFolder,
    updateRequirement,
    deleteRequirement,
} from '../controllers/requirement.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const STAFF_DOC_ROLES = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo', 'admin_club', 'administrativo'];
const STAFF_DOC_READ_ROLES = [...STAFF_DOC_ROLES, 'dirigente'];
const STAFF_DOC_MUTATE_ROLES = [
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
    'admin_club',
    'administrativo',
];

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

router.get('/submissions', protect, authorize(...STAFF_DOC_READ_ROLES), getStaffSubmissions);
router.get('/pedidos', protect, authorize(...STAFF_DOC_READ_ROLES), listStaffRequirements);
router.get('/folders', protect, authorize(...STAFF_DOC_READ_ROLES), listRequirementFolders);
router.post('/folders', protect, authorize(...STAFF_DOC_MUTATE_ROLES), createRequirementFolder);
router.patch('/folders/:id', protect, authorize(...STAFF_DOC_MUTATE_ROLES), updateRequirementFolder);
router.delete('/folders/:id', protect, authorize(...STAFF_DOC_MUTATE_ROLES), deleteRequirementFolder);

router.get('/me', protect, authorize(...MEMBER_DOC_ROLES), getMyRequirements);
router.post('/', protect, authorize(...STAFF_DOC_MUTATE_ROLES), createRequirement);
router.patch('/:id', protect, authorize(...STAFF_DOC_MUTATE_ROLES), updateRequirement);
router.delete('/:id', protect, authorize(...STAFF_DOC_MUTATE_ROLES), deleteRequirement);
router.post('/submit', protect, authorize(...MEMBER_DOC_ROLES), submitDocument);
router.patch('/submissions/:id/review', protect, authorize(...STAFF_DOC_ROLES), reviewSubmission);

export default router;
