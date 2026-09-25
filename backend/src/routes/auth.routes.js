import express from 'express';
import {
    loginUser,
    refreshAccessToken,
    selectRole,
    logoutUser,
    acceptTerms,
    forgotPassword,
    resetPassword,
} from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/refresh', refreshAccessToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/select-role', protect, selectRole);
router.post('/logout', logoutUser);
router.post('/accept-terms', protect, acceptTerms);

export default router;
