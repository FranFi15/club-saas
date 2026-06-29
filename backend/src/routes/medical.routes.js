import express from 'express';
import { reportInjury, updateRecoveryStage } from '../controllers/medical.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/injuries', protect, authorize('admin_club'), reportInjury);
router.patch('/injuries/:id/next-stage', protect, authorize('admin_club'), updateRecoveryStage);

export default router;