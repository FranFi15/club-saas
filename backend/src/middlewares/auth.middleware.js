import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import { getUserModel } from '../models/user.model.js';

const protect = asyncHandler(async (req, res, next) => {
    let token;

    // El token debería venir en el header Authorization: Bearer <token>
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // 1. Obtenemos el token del string "Bearer XXXXXX"
            token = req.headers.authorization.split(' ')[1];

            // 2. Decodificamos el token usando el secreto de acceso
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Obtenemos el modelo de usuario de la DB del club actual
            const User = getUserModel(req.tenantDB);

            // 4. Buscamos al usuario y lo inyectamos en la petición (sin el password)
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                res.status(401);
                throw new Error('No autorizado, usuario no encontrado en este club');
            }

            next();
        } catch (error) {
            console.error('Error en la validación del token:', error.message);
            res.status(401);
            throw new Error('No autorizado, token fallido o expirado');
        }
    }

    if (!token) {
        res.status(401);
        throw new Error('No autorizado, falta el token de acceso');
    }
});

// Middleware extra para filtrar por ROLES
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.rol)) {
            res.status(403);
            throw new Error(`El rol ${req.user?.rol || 'desconocido'} no tiene permiso para esta acción`);
        }
        next();
    };
};

export { protect, authorize };