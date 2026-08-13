import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
    const dsn = String(process.env.SENTRY_DSN || '').trim();
    if (!dsn) {
        if (process.env.NODE_ENV === 'production') {
            console.warn('[Sentry] SENTRY_DSN no configurado — errores no se reportan.');
        }
        return false;
    }

    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
        sendDefaultPii: false,
    });
    initialized = true;
    console.log('[Sentry] inicializado');
    return true;
}

export function captureException(err, context) {
    if (!initialized || !err) return;
    Sentry.withScope((scope) => {
        if (context) {
            Object.entries(context).forEach(([k, v]) => {
                if (v != null) scope.setExtra(k, v);
            });
        }
        Sentry.captureException(err);
    });
}

export { Sentry };
