import './instrument.js';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';

import { resolveTenant } from './src/middlewares/tenant.middleware.js';
import { notFound, errorHandler } from './src/middlewares/error.middleware.js';
import { captureException } from './src/config/sentry.js';

import authRoutes from './src/routes/auth.routes.js';
import userRoutes from './src/routes/user.routes.js';
import disciplineRoutes from './src/routes/discipline.routes.js';
import categoryRoutes from './src/routes/category.routes.js';
import scheduleRoutes from './src/routes/schedule.routes.js';
import enrollmentRoutes from './src/routes/enrollment.routes.js';
import sessionRoutes from './src/routes/session.routes.js';
import financialRoutes from './src/routes/financial.routes.js';
import rentalRoutes from './src/routes/rental.routes.js';
import mercadopagoRoutes from './src/routes/mercadopago.routes.js';
import newsRoutes from './src/routes/news.routes.js';
import resourceRoutes from './src/routes/resource.routes.js';
import uploadRoutes from './src/routes/upload.routes.js';
import wellnessRoutes from './src/routes/wellness.routes.js';
import requirementRoutes from './src/routes/requirement.routes.js';
import performanceRoutes from './src/routes/performance.routes.js';
import spaceRoutes from './src/routes/space.routes.js';
import trainingRoutes from './src/routes/training.routes.js';
import medicalRoutes from './src/routes/medical.routes.js';
import notificationRoutes from './src/routes/notification.routes.js';
import badgeRoutes from './src/routes/badge.routes.js';
import swapRequestRoutes from './src/routes/swapRequest.routes.js';
import enrollmentRequestRoutes from './src/routes/enrollmentRequest.routes.js';
import clubEntryRoutes from './src/routes/clubEntry.routes.js';
import chatRoutes from './src/routes/chat.routes.js';
import inboxRoutes from './src/routes/inbox.routes.js';
import statsRoutes from './src/routes/stats.routes.js';

import { startSessionGenerationCron } from './src/cron/sessionGeneration.cron.js';
import { startPaymentGenerationCron } from './src/cron/paymentGeneration.cron.js';
import { startOverduePaymentsCron } from './src/cron/overduePayments.cron.js';
import { startPaymentRemindersCron } from './src/cron/paymentReminders.cron.js';
import {
    backfillAllClubsMpSellers,
    runMpSellerBackfillOnStart,
} from './src/services/backfillMpSellerMapping.service.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

if (isProd && !process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL = 'https://app.hermesclubapp.com';
    console.warn('[Club-Backend] FRONTEND_URL vacío — usando https://app.hermesclubapp.com');
}

console.log('[Club-Backend] boot', {
    node: process.version,
    cwd: process.cwd(),
    port: process.env.PORT || '(default 5000)',
    NODE_ENV: process.env.NODE_ENV || '',
    JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'MISSING',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ? 'set' : 'MISSING',
    FRONTEND_URL: process.env.FRONTEND_URL ? 'set' : 'MISSING',
});

if (isProd) {
    const missing = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
    if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');
    if (missing.length) {
        console.error(`[Club-Backend] Variables requeridas en producción: ${missing.join(', ')}`);
        console.error('[Club-Backend] En Render → club-backend → Environment, esas keys tienen que tener valor (no solo existir). Guardá y hacé Manual Deploy.');
        process.exit(1);
    }
    if (!process.env.MP_WEBHOOK_SECRET && !process.env.MERCADOPAGO_WEBHOOK_SECRET) {
        console.warn('[Club-Backend] MP_WEBHOOK_SECRET no configurado — los webhooks de Mercado Pago se rechazarán.');
    }
    if (!process.env.CLUB_ENTRY_TOKEN_SECRET) {
        console.warn('[Club-Backend] CLUB_ENTRY_TOKEN_SECRET no configurado — el QR de ingreso fallará hasta setearlo.');
    }
} else if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.warn('[Club-Backend] Faltan JWT_SECRET o JWT_REFRESH_SECRET en .env');
}

function parseFrontendOrigins() {
    return String(process.env.FRONTEND_URL || '')
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/\/$/, ''))
        .filter(Boolean);
}

const allowedOrigins = isProd ? parseFrontendOrigins() : null;

app.use(cors({
    origin: isProd
        ? (origin, callback) => {
            if (!origin) return callback(null, true);
            const ok = allowedOrigins.includes(origin.replace(/\/$/, ''));
            callback(null, ok ? origin : false);
        }
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-club-identifier'],
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 900,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones desde esta IP. Por favor intente de nuevo más tarde.' },
    skip: (req) => req.method === 'OPTIONS',
});
app.use('/api', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
    skip: (req) => req.method === 'OPTIONS',
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas subidas. Probá de nuevo más tarde.' },
    skip: (req) => req.method === 'OPTIONS',
});
app.use('/api/upload', uploadLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(
    mongoSanitize({
        replaceWith: '_',
        allowDots: true,
    }),
);

app.get('/', (req, res) => {
    res.status(200).send('🏟️ Backend funcionando y asegurado.');
});

/** Health check para Render (rápido, sin deps). */
app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'club-backend' });
});

/** Backfill MP seller → club (todos los tenants). Header: x-internal-api-key */
app.post('/api/internal/mp-seller-backfill', async (req, res) => {
    if (req.headers['x-internal-api-key'] !== process.env.INTERNAL_ADMIN_API_KEY) {
        return res.status(401).json({ message: 'No autorizado.' });
    }
    try {
        const result = await backfillAllClubsMpSellers();
        return res.json(result);
    } catch (e) {
        console.error('[mp-seller-backfill] endpoint:', e.message);
        return res.status(500).json({ message: 'Error en backfill de vendedores MP.' });
    }
});

app.use('/api/upload', resolveTenant, uploadRoutes);
app.use('/api/auth', resolveTenant, authRoutes);
app.use('/api/users', resolveTenant, userRoutes);
app.use('/api/disciplines', resolveTenant, disciplineRoutes);
app.use('/api/categories', resolveTenant, categoryRoutes);
app.use('/api/schedules', resolveTenant, scheduleRoutes);
app.use('/api/enrollments', resolveTenant, enrollmentRoutes);
app.use('/api/sessions', resolveTenant, sessionRoutes);
app.use('/api/financial', resolveTenant, financialRoutes);
app.use('/api/rentals', resolveTenant, rentalRoutes);
app.use('/api/mercadopago', resolveTenant, mercadopagoRoutes);
app.use('/api/news', resolveTenant, newsRoutes);
app.use('/api/resources', resolveTenant, resourceRoutes);
app.use('/api/wellness', resolveTenant, wellnessRoutes);
app.use('/api/requirements', resolveTenant, requirementRoutes);
app.use('/api/performance', resolveTenant, performanceRoutes);
app.use('/api/spaces', resolveTenant, spaceRoutes);
app.use('/api/training', resolveTenant, trainingRoutes);
app.use('/api/medical', resolveTenant, medicalRoutes);
app.use('/api/notifications', resolveTenant, notificationRoutes);
app.use('/api/badges', resolveTenant, badgeRoutes);
app.use('/api/session-swaps', resolveTenant, swapRequestRoutes);
app.use('/api/enrollment-requests', resolveTenant, enrollmentRequestRoutes);
app.use('/api/club-entry', resolveTenant, clubEntryRoutes);
app.use('/api/chat', resolveTenant, chatRoutes);
app.use('/api/inbox', resolveTenant, inboxRoutes);
app.use('/api/stats', resolveTenant, statsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
    console.log(`[Club-Backend] Servidor corriendo en ${HOST}:${PORT}`, server.address());
    if (isProd) {
        console.log(`[Club-Backend] CORS origins: ${allowedOrigins.join(', ') || '(ninguno)'}`);
    }
    console.log('🛡️  Capas de seguridad activas (Helmet, RateLimit, Sanitize)');
    try {
        startSessionGenerationCron();
        startPaymentGenerationCron();
        startOverduePaymentsCron();
        startPaymentRemindersCron();
        runMpSellerBackfillOnStart();
    } catch (err) {
        captureException(err, { area: 'cron_start' });
        console.error('[Club-Backend] Error iniciando crons:', err.message);
    }
});
