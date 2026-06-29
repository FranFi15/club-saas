import express from 'express';
import {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    dismissAllNotifications,
} from '../controllers/notification.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/', protect, getMyNotifications);
router.patch('/read-all', protect, markAllAsRead);
router.delete('/', protect, dismissAllNotifications);
router.patch('/:id/read', protect, markAsRead);
router.delete('/:id', protect, dismissNotification);

export default router;
