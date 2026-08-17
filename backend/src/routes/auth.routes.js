import express from 'express';
import { loginUser, refreshAccessToken, logoutUser, acceptTerms } from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logoutUser);
router.post('/accept-terms', protect, acceptTerms);

export default router;
