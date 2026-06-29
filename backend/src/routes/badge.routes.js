import express from 'express';
import { getBadgeSummary, markContentSeen } from '../controllers/badge.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/summary', protect, getBadgeSummary);
router.patch('/seen', protect, markContentSeen);

export default router;
