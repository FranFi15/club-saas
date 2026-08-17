import 'dotenv/config';
import { initSentry } from './src/config/sentry.js';

function cleanEnvValue(raw) {
    if (raw == null) return '';
    return String(raw).trim().replace(/^["']|["']$/g, '').trim();
}

/** Render/dashboard values a veces llegan con comillas o espacios. */
const ENV_KEYS_TO_CLEAN = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'FRONTEND_URL',
    'MP_WEBHOOK_SECRET',
    'MERCADOPAGO_WEBHOOK_SECRET',
    'CLUB_ENTRY_TOKEN_SECRET',
    'SUPER_ADMIN_URL',
    'INTERNAL_ADMIN_API_KEY',
    'PUBLIC_API_URL',
    'BACKEND_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'SENTRY_DSN',
];

for (const key of ENV_KEYS_TO_CLEAN) {
    if (process.env[key] == null) continue;
    process.env[key] = cleanEnvValue(process.env[key]);
}

initSentry();
