import express from 'express';
import {
    createCategory,
    getCategoriesByDiscipline,
    getAllCategories,
    updateCategory,
    deleteCategory,
    getMisCategoriasCoach,
    getMisAtletasStaff,
    getCategoryPlantel,
    putCategoryPlantel,
    postDelegarCategoryPlantel,
    getPlantelPendientesCoach,
} from '../controllers/category.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin_club'), createCategory);
router.get('/', protect, getAllCategories);
router.get('/mis-categorias', protect, authorize('profe', 'preparador_fisico', 'nutricionista', 'psicologo'), getMisCategoriasCoach);
router.get('/mis-atletas', protect, authorize('profe', 'preparador_fisico', 'nutricionista', 'psicologo'), getMisAtletasStaff);
router.get('/plantel-pendientes', protect, authorize('profe', 'preparador_fisico'), getPlantelPendientesCoach);
router.get('/disciplina/:disciplineId', protect, getCategoriesByDiscipline);
router.get('/:id/plantel', protect, authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico'), getCategoryPlantel);
router.put('/:id/plantel', protect, authorize('admin_club', 'administrativo', 'profe', 'preparador_fisico'), putCategoryPlantel);
router.post('/:id/plantel/delegar', protect, authorize('admin_club', 'administrativo'), postDelegarCategoryPlantel);
router.put('/:id', protect, authorize('admin_club', 'administrativo'), updateCategory); // Edición
router.delete('/:id', protect, authorize('admin_club'), deleteCategory); // Baja

export default router;