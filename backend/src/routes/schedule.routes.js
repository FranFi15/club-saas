import express from 'express';
import {
    addSchedule,
    getFullGrid,
    updateSchedule,
    deleteSchedule,
    getSchedulesBySpace,
    previewPartialMonths,
} from '../controllers/schedule.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.route('/')
    .post(protect, authorize('admin_club', 'profe'), addSchedule)
    .get(protect, getFullGrid);

router.post(
    '/preview-partial-months',
    protect,
    authorize('admin_club', 'profe'),
    previewPartialMonths,
);

router.get('/espacio/:spaceId', protect, getSchedulesBySpace);

router.route('/:id')
    .put(protect, authorize('admin_club', 'profe'), updateSchedule)
    .delete(protect, authorize('admin_club'), deleteSchedule);

export default router;
