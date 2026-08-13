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

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'video/webm',
]);

const IMAGE_MAX = 5 * 1024 * 1024;
const PDF_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 25 * 1024 * 1024;

function classifyFile(file) {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();

    const isPdf =
        mime === 'application/pdf' ||
        name.endsWith('.pdf') ||
        (mime === 'application/octet-stream' && name.endsWith('.pdf'));
    if (isPdf) return { kind: 'pdf', resource_type: 'raw', max: PDF_MAX };

    if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(name)) {
        return { kind: 'video', resource_type: 'video', max: VIDEO_MAX };
    }
    if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) {
        return { kind: 'image', resource_type: 'image', max: IMAGE_MAX };
    }
    return null;
}

function fileFilter(req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    const okMime =
        ALLOWED_MIME.has(mime) ||
        (mime === 'application/octet-stream' && name.endsWith('.pdf'));
    if (!okMime) {
        return cb(new Error('Tipo de archivo no permitido. Usá imagen, PDF o video.'));
    }
    if (!classifyFile(file)) {
        return cb(new Error('Tipo de archivo no permitido. Usá imagen, PDF o video.'));
    }
    return cb(null, true);
}

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const classified = classifyFile(file);
        if (!classified) {
            throw new Error('Tipo de archivo no permitido.');
        }
        return {
            folder: 'gpsports_uploads',
            resource_type: classified.resource_type,
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf', 'mp4', 'mov', 'webm'],
        };
    },
});

/** Límite duro global (video); fileFilter + post-check afinan por tipo. */
export const upload = multer({
    storage,
    limits: { fileSize: VIDEO_MAX, files: 1 },
    fileFilter,
});

export function assertUploadedSize(file) {
    if (!file) return;
    const classified = classifyFile(file);
    const bytes = file.bytes ?? file.size ?? 0;
    if (classified && bytes > classified.max) {
        const mb = Math.round(classified.max / (1024 * 1024));
        const err = new Error(
            classified.kind === 'image'
                ? `La imagen supera el máximo de ${mb} MB.`
                : classified.kind === 'pdf'
                  ? `El PDF supera el máximo de ${mb} MB.`
                  : `El video supera el máximo de ${mb} MB.`,
        );
        err.code = 'LIMIT_FILE_SIZE';
        throw err;
    }
}

export { cloudinary };
