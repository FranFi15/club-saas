import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import { getUserModel } from '../models/user.model.js';
import { normalizeUserRoles } from '../constants/userRoles.js';

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.club && req.clubIdentifier && decoded.club !== req.clubIdentifier) {
                res.status(401);
                throw new Error('Token no válido para este club');
            }

            const User = getUserModel(req.tenantDB);
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                res.status(401);
                throw new Error('No autorizado, usuario no encontrado en este club');
            }

            if (req.user.estado === 'inactivo') {
                res.status(401);
                throw new Error('Tu cuenta está desactivada. Consultá en administración.');
            }

            const allowed = normalizeUserRoles(req.user);
            const primaryRol = req.user.rol;
            req.user._primaryRol = primaryRol;
            req.user.roles = allowed;

            const activeRol =
                decoded.activeRol && allowed.includes(decoded.activeRol)
                    ? decoded.activeRol
                    : allowed.includes(primaryRol)
                      ? primaryRol
                      : allowed[0] || primaryRol;

            req.user.rol = activeRol;
            if (typeof req.user.unmarkModified === 'function') {
                req.user.unmarkModified('rol');
                req.user.unmarkModified('roles');
            }

            next();
        } catch (error) {
            if (res.statusCode === 401) throw error;
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
