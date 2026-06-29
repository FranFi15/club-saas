import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js';
import {
    getMyClubEntryQr,
    scanClubEntryQr,
    getTodayClubEntries,
    MEMBER_QR_ROLES,
    SCANNER_ROLES,
} from '../controllers/clubEntry.controller.js';

const router = express.Router();

router.get('/my-qr', protect, authorize(...MEMBER_QR_ROLES), getMyClubEntryQr);
router.post('/scan', protect, authorize(...SCANNER_ROLES), scanClubEntryQr);
router.get('/today', protect, authorize(...SCANNER_ROLES), getTodayClubEntries);

export default router;
