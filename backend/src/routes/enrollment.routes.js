import express from 'express';
import { enrollAthlete, getAthletesByCategory, getCategoriesByAthlete, updateEnrollmentFinancials, unenrollAthlete } from '../controllers/enrollment.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.route('/')
    .post(protect, authorize('admin_club', 'profe', 'administrativo'), enrollAthlete);

router.route('/:id')
    .delete(protect, authorize('admin_club', 'profe', 'administrativo'), unenrollAthlete);

router.route('/categoria/:categoryId')
    .get(protect, authorize('admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo', 'administrativo'), getAthletesByCategory);

router.route('/atleta/:atletaId')
    .get(protect, authorize('admin_club', 'profe', 'administrativo', 'atleta', 'tutor'), getCategoriesByAthlete);

router.patch('/:id/financials', protect, authorize('admin_club', 'administrativo'), updateEnrollmentFinancials);

export default router;