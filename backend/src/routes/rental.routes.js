import express from 'express';
import { createRental, getRentals, updateRental, deleteRental, getRentalsBySpaceAndDate, payRentalBalance, getRentalBalance } from '../controllers/rental.controller.js';
import {
    listOnlineSpaces,
    getOnlineAvailability,
    bookOnlineRental,
    listMyOnlineRentals,
    cancelMyOnlineRental,
} from '../controllers/onlineRental.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

const MEMBER_ROLES = ['atleta', 'tutor', 'socio'];

router.get('/online/spaces', protect, authorize(...MEMBER_ROLES), listOnlineSpaces);
router.get('/online/availability', protect, authorize(...MEMBER_ROLES), getOnlineAvailability);
router.post('/online/book', protect, authorize(...MEMBER_ROLES), bookOnlineRental);
router.get('/online/mine', protect, authorize(...MEMBER_ROLES), listMyOnlineRentals);
router.delete('/online/:id', protect, authorize(...MEMBER_ROLES), cancelMyOnlineRental);

router.post('/', protect, authorize('admin_club', 'administrativo'), createRental);
router.get('/balance', protect, authorize('admin_club', 'administrativo'), getRentalBalance);
router.get('/', protect, authorize('admin_club', 'administrativo'), getRentals);
router.get('/espacio/:spaceId', protect, authorize('admin_club', 'administrativo'), getRentalsBySpaceAndDate);
router.post('/:id/pagar-total', protect, authorize('admin_club', 'administrativo'), payRentalBalance);
router.put('/:id', protect, authorize('admin_club', 'administrativo'), updateRental);
router.delete('/:id', protect, authorize('admin_club', 'administrativo'), deleteRental); 

export default router;
