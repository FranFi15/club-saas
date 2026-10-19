import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js';
import {
    listAdminEvents,
    getAdminEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    publishEvent,
    cancelEvent,
    listEventOrders,
    listPricingPickers,
    listPublicEvents,
    getPublicEvent,
    publicCheckout,
    listMemberEvents,
    quoteMemberEvent,
    memberCheckout,
    myTickets,
    getPublicOrderTickets,
    listScanTargets,
    scanEventTicket,
    ADMIN_WRITE,
    ADMIN_READ,
    SCAN_ROLES,
    MEMBER_ROLES,
} from '../controllers/event.controller.js';

const router = express.Router();

// Public (no JWT) — static paths before :slug
router.get('/public', listPublicEvents);
router.get('/public/orders/:orderId', getPublicOrderTickets);
router.get('/public/:slug', getPublicEvent);
router.post('/public/:slug/checkout', publicCheckout);

// Scan
router.get('/scan-targets', protect, authorize(...SCAN_ROLES), listScanTargets);
router.post('/tickets/scan', protect, authorize(...SCAN_ROLES), scanEventTicket);

// Member
router.get('/tickets/mine', protect, authorize(...MEMBER_ROLES), myTickets);
router.get('/', protect, authorize(...MEMBER_ROLES, ...ADMIN_READ), listMemberEvents);
router.post('/:id/quote', protect, authorize(...MEMBER_ROLES), quoteMemberEvent);
router.post('/:id/checkout', protect, authorize(...MEMBER_ROLES), memberCheckout);

// Admin
router.get('/admin/pricing-pickers', protect, authorize(...ADMIN_WRITE, 'dirigente'), listPricingPickers);
router.get('/admin', protect, authorize(...ADMIN_READ), listAdminEvents);
router.get('/admin/:id/orders', protect, authorize(...ADMIN_READ), listEventOrders);
router.get('/admin/:id', protect, authorize(...ADMIN_READ), getAdminEvent);
router.post('/admin', protect, authorize(...ADMIN_WRITE), createEvent);
router.patch('/admin/:id', protect, authorize(...ADMIN_WRITE), updateEvent);
router.delete('/admin/:id', protect, authorize(...ADMIN_WRITE), deleteEvent);
router.post('/admin/:id/publish', protect, authorize(...ADMIN_WRITE), publishEvent);
router.post('/admin/:id/cancel', protect, authorize(...ADMIN_WRITE), cancelEvent);

export default router;
