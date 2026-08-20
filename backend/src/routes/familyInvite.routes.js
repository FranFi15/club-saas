import express from 'express';
import {
    createFamilyInvite,
    listFamilyInvites,
    cancelFamilyInvite,
    getPublicFamilyInvite,
    redeemFamilyInvite,
} from '../controllers/familyInvite.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/public/:token', getPublicFamilyInvite);
router.post('/public/:token/redeem', redeemFamilyInvite);

router.get('/', protect, authorize('admin_club', 'administrativo'), listFamilyInvites);
router.post('/', protect, authorize('admin_club', 'administrativo'), createFamilyInvite);
router.patch('/:id/cancel', protect, authorize('admin_club', 'administrativo'), cancelFamilyInvite);

export default router;
