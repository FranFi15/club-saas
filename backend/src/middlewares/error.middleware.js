
// 1. Atrapa rutas que no existen (Ej: GET /api/pepito)
const notFound = (req, res, next) => {
    const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
    res.status(404);
    next(error); // Le pasa la pelota al manejador principal de abajo
};

// 2. El Atrapa-Errores Principal
const errorHandler = (err, req, res, next) => {
    // Prefer explicit err.statusCode (usado por services); si no hay, respetar res.status ya seteado.
    let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
    let message = err.message;

    // --- TRADUCTORES DE ERRORES DE BASE DE DATOS (MONGODB) ---

    // A. Error de Mongoose: Buscar un ID que no tiene el formato correcto (CastError)
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404;
        message = 'Recurso no encontrado. El ID proporcionado no es válido.';
    }

    // B. Error de Mongoose: Clave Duplicada (Código 11000) - Ej: Mismo Email o DNI
    if (err.code === 11000) {
        statusCode = 400;
        // Extraemos qué campo causó el duplicado (ej: 'email')
        const campo = Object.keys(err.keyValue)[0];
        message = `El valor ingresado para '${campo}' ya está registrado en el club.`;
    }

    // C. Error de Mongoose: Faltan campos obligatorios (ValidationError)
    if (err.name === 'ValidationError') {
        statusCode = 400;
        // Agarramos todos los mensajes de error y los unimos con una coma
        const errores = Object.values(err.errors).map(val => val.message);
        message = `Datos incompletos o inválidos: ${errores.join(', ')}`;
    }

    // --- TRADUCTORES DE ERRORES DE SEGURIDAD (JWT) ---

    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Acceso denegado. Token inválido o adulterado.';
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Tu sesión ha expirado. Por favor, iniciá sesión nuevamente.';
    }

    // --- RESPUESTA FINAL AL FRONTEND ---
    res.status(statusCode).json({
        success: false,
        message: message,
        // MAGIA DE SEGURIDAD: Solo mostramos la "pila" de errores (archivos y líneas de código) 
        // si estamos programando en nuestra PC. En producción, lo ocultamos.
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

export { notFound, errorHandler };