import express from 'express';
import {
    createPreference,
    createMemberPreference,
    createMemberFamilyPreference,
    createRentalPreference,
    webhookReceiver,
    syncMemberPayments,
    getMpIntegration,
    updateMpIntegration,
    clearMpIntegration,
    startMercadoPagoOAuth,
    mercadoPagoOAuthCallback,
} from '../controllers/mercadopago.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/oauth/callback', mercadoPagoOAuthCallback);
router.post('/oauth/start', protect, authorize('admin_club'), startMercadoPagoOAuth);

router.get('/integration', protect, authorize('admin_club', 'administrativo'), getMpIntegration);
router.put('/integration', protect, authorize('admin_club'), updateMpIntegration);
router.delete('/integration', protect, authorize('admin_club'), clearMpIntegration);

router.post('/create-preference', protect, authorize('admin_club', 'administrativo'), createPreference);
router.post('/create-preference-member', protect, authorize('atleta', 'tutor'), createMemberPreference);
router.post('/create-preference-family', protect, authorize('tutor'), createMemberFamilyPreference);
router.post(
    '/create-preference-rental',
    protect,
    authorize('admin_club', 'administrativo'),
    createRentalPreference,
);
router.post('/sync-member-payments', protect, authorize('atleta', 'tutor'), syncMemberPayments);

router.post('/webhook', webhookReceiver);
router.get('/webhook', webhookReceiver);

export default router;
