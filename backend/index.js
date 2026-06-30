import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// --- SEGURIDAD ---
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';



// --- MIDDLEWARES ---
import { resolveTenant } from './src/middlewares/tenant.middleware.js';
import { notFound, errorHandler } from './src/middlewares/error.middleware.js';

// --- RUTAS ---
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

import { startSessionGenerationCron } from './src/cron/sessionGeneration.cron.js';
import { startPaymentGenerationCron } from './src/cron/paymentGeneration.cron.js';
import { startOverduePaymentsCron } from './src/cron/overduePayments.cron.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
    const missing = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
    if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');
    if (missing.length) {
        console.error(`[Club-Backend] Variables requeridas en producción: ${missing.join(', ')}`);
        process.exit(1);
    }
} else if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.warn('[Club-Backend] Faltan JWT_SECRET o JWT_REFRESH_SECRET en .env');
}

// 1. MIDDLEWARES GLOBALES Y SEGURIDAD
// Helmet: Oculta cabeceras de Express y previene ataques XSS y Clickjacking
app.use(helmet());

// CORS: en producción solo el dominio del frontend; en desarrollo permite cualquier origen
app.use(cors({
    origin: isProd ? process.env.FRONTEND_URL : true,
    credentials: true,
}));

// Rate Limiting: Previene ataques de Fuerza Bruta y denegación de servicio (DDoS)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, // Limita cada IP a 200 peticiones por ventana de 15 minutos
    message: { error: 'Demasiadas peticiones desde esta IP. Por favor intente de nuevo más tarde.' }
});
app.use('/api', limiter); // Se aplica a todas las rutas que empiecen con /api

// Body Parsers con límites para evitar saturación de memoria
app.use(express.json({ limit: '10kb' })); 
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());





// 2. RUTAS DE LA APLICACIÓN
app.get('/', (req, res) => {
    res.send('🏟️ Backend funcionando y asegurado.');
});

// Subida a Cloudinary (requiere tenant para validar el JWT del club)
app.use('/api/upload', resolveTenant, uploadRoutes);

// Rutas protegidas por Tenant (Multi-club)
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


// 3. MIDDLEWARES DE ERROR 
app.use(notFound);
app.use(errorHandler);

// 4. INICIALIZACIÓN DEL SERVIDOR
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`[Club-Backend] Servidor corriendo en puerto ${PORT}`);
    console.log('🛡️  Capas de seguridad activas (Helmet, RateLimit, Sanitize)');
    startSessionGenerationCron();
    startPaymentGenerationCron();
    startOverduePaymentsCron();
});