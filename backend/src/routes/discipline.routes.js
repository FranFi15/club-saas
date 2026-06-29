import express from 'express';
import { 
    createDiscipline, 
    getDisciplines, 
    updateDiscipline, 
    deleteDiscipline 
} from '../controllers/discipline.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin_club'), createDiscipline);
router.get('/', protect, getDisciplines);
router.put('/:id', protect, authorize('admin_club'), updateDiscipline);
router.delete('/:id', protect, authorize('admin_club'), deleteDiscipline); // La ruta destructiva

export default router;