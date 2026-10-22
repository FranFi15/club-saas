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
    searchEventBuyers,
    adminCashQuote,
    adminCashSale,
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
    EVENT_MANAGE,
    ADMIN_READ,
    MEMBER_ROLES,
} from '../controllers/event.controller.js';

const router = express.Router();

// Public (no JWT) — static paths before :slug
router.get('/public', listPublicEvents);
router.get('/public/orders/:orderId', getPublicOrderTickets);
router.get('/public/:slug', getPublicEvent);
router.post('/public/:slug/checkout', publicCheckout);

// Scan
router.get('/scan-targets', protect, listScanTargets);
router.get('/door', protect, listScanTargets);
router.post('/tickets/scan', protect, scanEventTicket);

// Member
router.get('/tickets/mine', protect, authorize(...MEMBER_ROLES), myTickets);
router.get('/', protect, authorize(...MEMBER_ROLES, ...ADMIN_READ), listMemberEvents);
router.post('/:id/quote', protect, authorize(...MEMBER_ROLES), quoteMemberEvent);
router.post('/:id/checkout', protect, authorize(...MEMBER_ROLES), memberCheckout);

// Admin
router.get('/admin/pricing-pickers', protect, authorize(...EVENT_MANAGE), listPricingPickers);
router.get('/admin/user-search', protect, authorize(...ADMIN_WRITE), searchEventBuyers);
router.get('/admin', protect, authorize(...ADMIN_READ), listAdminEvents);
router.post('/admin/:id/cash-quote', protect, authorize(...ADMIN_WRITE), adminCashQuote);
router.post('/admin/:id/cash-sale', protect, authorize(...ADMIN_WRITE), adminCashSale);
router.get('/admin/:id/orders', protect, authorize(...ADMIN_READ), listEventOrders);
router.get('/admin/:id', protect, authorize(...ADMIN_READ), getAdminEvent);
router.post('/admin', protect, authorize(...EVENT_MANAGE), createEvent);
router.patch('/admin/:id', protect, authorize(...EVENT_MANAGE), updateEvent);
router.delete('/admin/:id', protect, authorize(...EVENT_MANAGE), deleteEvent);
router.post('/admin/:id/publish', protect, authorize(...EVENT_MANAGE), publishEvent);
router.post('/admin/:id/cancel', protect, authorize(...EVENT_MANAGE), cancelEvent);

export default router;
