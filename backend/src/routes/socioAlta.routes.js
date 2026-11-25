import express from 'express';
import {
    getPublicSocioAltaConfig,
    uploadPublicSocioAltaPhoto,
    submitPublicSocioAlta,
    getSocioAltaSettings,
    patchSocioAltaSettings,
    listSocioAltas,
    markSocioAltaRevisada,
} from '../controllers/socioAlta.controller.js';
import { upload } from '../config/cloudinary.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/public/config', getPublicSocioAltaConfig);
router.post('/public/photo', (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
        if (err) {
            const msg = err.message || 'Error al subir la foto.';
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({ message: msg });
        }
        return uploadPublicSocioAltaPhoto(req, res, next);
    });
});
router.post('/public/submit', submitPublicSocioAlta);

router.get(
    '/settings',
    protect,
    authorize('admin_club'),
    getSocioAltaSettings,
);
router.patch(
    '/settings',
    protect,
    authorize('admin_club'),
    patchSocioAltaSettings,
);

router.get(
    '/altas',
    protect,
    authorize('admin_club', 'administrativo'),
    listSocioAltas,
);
router.patch(
    '/altas/:id/revisar',
    protect,
    authorize('admin_club', 'administrativo'),
    markSocioAltaRevisada,
);

export default router;
