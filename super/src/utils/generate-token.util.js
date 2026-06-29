import jwt from 'jsonwebtoken';

const generateToken = (id) => {
    // Genera un token firmado con tu clave secreta que expira en 1 hora
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '1h' 
    });
};

export default generateToken;