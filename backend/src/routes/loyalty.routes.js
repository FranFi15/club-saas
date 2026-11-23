import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js';
import {
    getSettings,
    updateSettings,
    getMyLoyalty,
    listRewards,
    adminListRewards,
    createReward,
    updateReward,
    deleteReward,
    adjustPoints,
    setCanRedeem,
    redeem,
    getRedemption,
    partnerScan,
    partnerScanConfirm,
    partnerRedeemByCode,
    partnerLookupMember,
    partnerReportSale,
    partnerListRewards,
    runExpire,
    listRedemptions,
} from '../controllers/loyalty.controller.js';

const router = express.Router();

router.get('/settings', protect, getSettings);
router.patch('/settings', protect, authorize('admin_club', 'administrativo'), updateSettings);

router.get('/me', protect, getMyLoyalty);
router.get('/rewards', protect, listRewards);
router.post('/rewards/:id/redeem', protect, redeem);
router.get('/redemptions/:id', protect, getRedemption);

router.get('/admin/rewards', protect, authorize('admin_club', 'dirigente', 'administrativo'), adminListRewards);
router.post('/admin/rewards', protect, authorize('admin_club', 'administrativo'), createReward);
router.patch('/admin/rewards/:id', protect, authorize('admin_club', 'administrativo'), updateReward);
router.delete('/admin/rewards/:id', protect, authorize('admin_club', 'administrativo'), deleteReward);
router.post('/admin/adjust', protect, authorize('admin_club', 'administrativo'), adjustPoints);
router.post('/admin/can-redeem', protect, authorize('admin_club', 'administrativo'), setCanRedeem);
router.get('/admin/redemptions', protect, authorize('admin_club', 'dirigente', 'administrativo'), listRedemptions);
router.post('/admin/expire', protect, authorize('admin_club'), runExpire);

router.get('/partner/rewards', protect, authorize('partner'), partnerListRewards);
router.post('/partner/scan', protect, authorize('partner'), partnerScan);
router.post('/partner/scan/confirm', protect, authorize('partner'), partnerScanConfirm);
router.post('/partner/redeem-by-code', protect, authorize('partner'), partnerRedeemByCode);
router.get('/partner/lookup', protect, authorize('partner'), partnerLookupMember);
router.post('/partner/sales', protect, authorize('partner'), partnerReportSale);

export default router;
