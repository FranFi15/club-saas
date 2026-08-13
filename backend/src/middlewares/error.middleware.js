import { captureException } from '../config/sentry.js';

const notFound = (req, res, next) => {
    const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
    let message = err.message;

    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404;
        message = 'Recurso no encontrado. El ID proporcionado no es válido.';
    }

    if (err.code === 11000) {
        statusCode = 400;
        const campo = Object.keys(err.keyValue || {})[0] || 'campo';
        if (campo === 'tokenNonce') {
            message = 'Este QR ya fue utilizado. Pedile al socio que actualice su pantalla.';
            statusCode = 409;
        } else {
            message = `El valor ingresado para '${campo}' ya está registrado en el club.`;
        }
    }

    if (err.name === 'ValidationError') {
        statusCode = 400;
        const errores = Object.values(err.errors).map((val) => val.message);
        message = `Datos incompletos o inválidos: ${errores.join(', ')}`;
    }

    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Acceso denegado. Token inválido o adulterado.';
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Tu sesión ha expirado. Por favor, iniciá sesión nuevamente.';
    }

    if (statusCode >= 500) {
        captureException(err, {
            path: req.originalUrl,
            method: req.method,
            club: req.clubIdentifier,
            userId: req.user?._id ? String(req.user._id) : undefined,
        });
    }

    res.status(statusCode).json({
        success: false,
        message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

export { notFound, errorHandler };
