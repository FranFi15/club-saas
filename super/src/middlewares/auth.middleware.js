import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import Admin from '../models/admin.model.js';

const protectAdmin = asyncHandler(async (req, res, next) => {
    let token;

    // 1. Buscamos el token en los headers (formato: "Bearer el_token_largo")
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Separamos la palabra "Bearer" del token en sí
            token = req.headers.authorization.split(' ')[1];

            // 2. Desencriptamos el token (Necesitás tener JWT_SECRET en tu .env)
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Buscamos al admin en la base de datos y lo guardamos en 'req'
            // (Asumo que tu utils/generate-token.util.js guarda el ID como 'id' o 'userId' o el valor directo)
            // .select('-password') es para que no viaje la contraseña en la request
            req.admin = await Admin.findById(decoded.id || decoded.userId || decoded).select('-password');

            if (!req.admin) {
                res.status(401);
                throw new Error('Administrador no encontrado');
            }

            // Todo en orden, lo dejamos pasar a la ruta
            next();
            
        } catch (error) {
            console.error('Error de token:', error);
            res.status(401);
            throw new Error('No autorizado. Token inválido o expirado.');
        }
    }

    if (!token) {
        res.status(401);
        throw new Error('No autorizado. No se envió ningún token de acceso.');
    }
});

export { protectAdmin };