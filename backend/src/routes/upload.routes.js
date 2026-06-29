import express from 'express';
import { upload } from '../config/cloudinary.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

function handleUpload(req, res) {
    if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo válido.' });
    }

    const f = req.file;
    const url = f.path || f.secure_url;

    if (!url) {
        return res.status(500).json({ message: 'Cloudinary no devolvió una URL pública.' });
    }

    res.status(200).json({
        message: 'Archivo subido con éxito',
        url,
        secureUrl: url,
        publicId: f.filename || f.public_id,
        format: f.format,
        resourceType: f.resource_type,
        formato: f.format,
        tamaño: f.bytes ?? f.size,
    });
}

// @desc    Subir un archivo a Cloudinary y obtener la URL
// @route   POST /api/upload
router.post('/', protect, (req, res) => {
    upload.single('archivo')(req, res, (err) => {
        if (err) {
            const msg = err.message || 'Error al subir el archivo.';
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({ message: msg });
        }
        return handleUpload(req, res);
    });
});

export default router;
