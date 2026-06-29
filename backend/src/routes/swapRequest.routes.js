import express from 'express';
import {
    proposeSpaceSwap,
    listMySwapRequests,
    acceptSpaceSwap,
    rejectSpaceSwap,
    cancelSpaceSwap,
} from '../controllers/swapRequest.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin_club', 'administrativo', 'profe'), proposeSpaceSwap);
router.get('/', protect, authorize('admin_club', 'administrativo', 'profe'), listMySwapRequests);
router.patch('/:id/accept', protect, authorize('admin_club', 'administrativo', 'profe'), acceptSpaceSwap);
router.patch('/:id/reject', protect, authorize('admin_club', 'administrativo', 'profe'), rejectSpaceSwap);
router.patch('/:id/cancel', protect, authorize('admin_club', 'administrativo', 'profe'), cancelSpaceSwap);

export default router;
