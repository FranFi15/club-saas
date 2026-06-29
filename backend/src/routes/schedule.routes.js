import express from 'express';
import {
    addSchedule,
    getFullGrid,
    updateSchedule,
    deleteSchedule,
    getSchedulesBySpace,
} from '../controllers/schedule.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.route('/')
    .post(protect, authorize('admin_club', 'profe'), addSchedule) // Profes y Admin pueden setear horarios
    .get(protect, getFullGrid);

router.get('/espacio/:spaceId', protect, getSchedulesBySpace);

router.route('/:id')
    .put(protect, authorize('admin_club', 'profe'), updateSchedule)
    .delete(protect, authorize('admin_club'), deleteSchedule);

export default router;