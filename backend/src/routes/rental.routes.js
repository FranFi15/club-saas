import express from 'express';
import { createRental, getRentals, updateRental, deleteRental, getRentalsBySpaceAndDate, payRentalBalance, getRentalBalance } from '../controllers/rental.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin_club', 'administrativo'), createRental);
router.get('/balance', protect, authorize('admin_club', 'administrativo'), getRentalBalance);
router.get('/', protect, authorize('admin_club', 'administrativo'), getRentals);
router.get('/espacio/:spaceId', protect, authorize('admin_club', 'administrativo'), getRentalsBySpaceAndDate);
router.post('/:id/pagar-total', protect, authorize('admin_club', 'administrativo'), payRentalBalance);
router.put('/:id', protect, authorize('admin_club', 'administrativo'), updateRental);
router.delete('/:id', protect, authorize('admin_club', 'administrativo'), deleteRental); 

export default router;