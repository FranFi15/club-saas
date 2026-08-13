import express from 'express';
import { getClubStats } from '../controllers/stats.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/club', protect, authorize('admin_club', 'administrativo'), getClubStats);

export default router;
