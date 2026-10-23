import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js';
import { isClubMercadoPagoLinked } from '../services/mercadoPagoClub.service.js';
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
    publicQuote,
    publicCheckout,
    listMemberEvents,
    quoteMemberEvent,
    memberCheckout,
    myTickets,
    getPublicOrderTickets,
    listScanTargets,
    scanEventTicket,
    confirmEventTicketScan,
    listEventDoorLog,
    ADMIN_WRITE,
    EVENT_MANAGE,
    ADMIN_READ,
    MEMBER_ROLES,
} from '../controllers/event.controller.js';
import {
    listStadiums,
    createStadium,
    updateStadium,
    deleteStadium,
} from '../controllers/stadium.controller.js';
import {
    listDiscounts,
    createDiscount,
    updateDiscount,
    deleteDiscount,
} from '../controllers/discount.controller.js';

const router = express.Router();

router.use(async (req, res, next) => {
    try {
        if (await isClubMercadoPagoLinked(req.models)) return next();
        return res.status(403).json({
            message: 'El club todavía no vinculó Mercado Pago.',
        });
    } catch (error) {
        return next(error);
    }
});

// Public (no JWT) — static paths before :slug
router.get('/public', listPublicEvents);
router.get('/public/orders/:orderId', getPublicOrderTickets);
router.get('/public/:slug', getPublicEvent);
router.post('/public/:slug/quote', publicQuote);
router.post('/public/:slug/checkout', publicCheckout);

// Scan
router.get('/scan-targets', protect, listScanTargets);
router.get('/door', protect, listScanTargets);
router.post('/tickets/scan', protect, scanEventTicket);
router.post('/tickets/scan/confirm', protect, confirmEventTicketScan);
router.get('/door-log', protect, listEventDoorLog);

// Member
router.get('/tickets/mine', protect, authorize(...MEMBER_ROLES), myTickets);
router.get('/', protect, authorize(...MEMBER_ROLES, ...ADMIN_READ), listMemberEvents);
router.post('/:id/quote', protect, authorize(...MEMBER_ROLES), quoteMemberEvent);
router.post('/:id/checkout', protect, authorize(...MEMBER_ROLES), memberCheckout);

// Admin
router.get('/admin/pricing-pickers', protect, authorize(...EVENT_MANAGE), listPricingPickers);
router.get('/admin/stadiums', protect, authorize(...EVENT_MANAGE), listStadiums);
router.post('/admin/stadiums', protect, authorize(...EVENT_MANAGE), createStadium);
router.patch('/admin/stadiums/:id', protect, authorize(...EVENT_MANAGE), updateStadium);
router.delete('/admin/stadiums/:id', protect, authorize(...EVENT_MANAGE), deleteStadium);
router.get('/admin/discounts', protect, authorize(...EVENT_MANAGE), listDiscounts);
router.post('/admin/discounts', protect, authorize(...EVENT_MANAGE), createDiscount);
router.patch('/admin/discounts/:id', protect, authorize(...EVENT_MANAGE), updateDiscount);
router.delete('/admin/discounts/:id', protect, authorize(...EVENT_MANAGE), deleteDiscount);
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
