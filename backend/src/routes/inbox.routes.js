import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js';
import { getPendingInbox } from '../controllers/inbox.controller.js';

const router = express.Router();

router.get('/pending', protect, authorize('admin_club', 'administrativo'), getPendingInbox);

export default router;
