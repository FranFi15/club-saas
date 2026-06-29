import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import 'dotenv/config';

function env(key) {
    return String(process.env[key] || '').replace(/^["']|["']$/g, '').trim();
}

const cloudName = env('CLOUDINARY_CLOUD_NAME');
const apiKey = env('CLOUDINARY_API_KEY');
const apiSecret = env('CLOUDINARY_API_SECRET');

if (!cloudName || !apiKey || !apiSecret) {
    console.warn('[Cloudinary] Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET en .env');
}

cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const mime = file.mimetype || '';
        const name = (file.originalname || '').toLowerCase();

        const isPdf =
            mime === 'application/pdf' ||
            name.endsWith('.pdf') ||
            (mime === 'application/octet-stream' && name.endsWith('.pdf'));

        let resource_type = 'image';
        if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(name)) {
            resource_type = 'video';
        } else if (isPdf) {
            resource_type = 'raw';
        } else if (mime.startsWith('image/')) {
            resource_type = 'image';
        } else {
            resource_type = 'auto';
        }

        return {
            folder: 'gpsports_uploads',
            resource_type,
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf', 'mp4', 'mov', 'webm'],
        };
    },
});

export const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
});

export { cloudinary };
