import express from 'express';
import { createRental, getRentals, updateRental, deleteRental, getRentalsBySpaceAndDate } from '../controllers/rental.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin_club', 'administrativo'), createRental);
router.get('/', protect, authorize('admin_club', 'administrativo'), getRentals);
router.get('/espacio/:spaceId', protect, authorize('admin_club', 'administrativo'), getRentalsBySpaceAndDate);
router.put('/:id', protect, authorize('admin_club', 'administrativo'), updateRental);
router.delete('/:id', protect, authorize('admin_club', 'administrativo'), deleteRental); 

export default router;