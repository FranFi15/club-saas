import express from 'express';
import {
    createFamilyInvite,
    listFamilyInvites,
    cancelFamilyInvite,
    getPublicFamilyInvite,
    redeemFamilyInvite,
    uploadPublicFamilyInvitePhoto,
} from '../controllers/familyInvite.controller.js';
import { upload } from '../config/cloudinary.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/public/:token', getPublicFamilyInvite);
router.post('/public/:token/redeem', redeemFamilyInvite);
router.post('/public/:token/photo', (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
        if (err) {
            const msg = err.message || 'Error al subir la foto.';
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({ message: msg });
        }
        return uploadPublicFamilyInvitePhoto(req, res, next);
    });
});

router.get('/', protect, authorize('admin_club', 'administrativo'), listFamilyInvites);
router.post('/', protect, authorize('admin_club', 'administrativo'), createFamilyInvite);
router.patch('/:id/cancel', protect, authorize('admin_club', 'administrativo'), cancelFamilyInvite);

export default router;
