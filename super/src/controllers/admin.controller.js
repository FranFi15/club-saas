import asyncHandler from 'express-async-handler';
import Admin from '../models/admin.model.js';
import generateToken from '../utils/generate-token.util.js';

const authAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (admin && (await admin.matchPassword(password))) {
        res.json({
            _id: admin._id,
            email: admin.email,
            role: admin.role,
            token: generateToken(admin._id)
        });
    } else {
        res.status(401);
        throw new Error('Email o contraseña inválidos');
    }
});

const setupAdmin = asyncHandler(async (req, res) => {
    const { email, password, secretKey } = req.body;

    if (secretKey !== process.env.INTERNAL_ADMIN_API_KEY) {
        res.status(401);
        throw new Error('No autorizado para realizar esta acción.');
    }

    if (!email || !password) {
        res.status(400);
        throw new Error('Proporcione email y contraseña.');
    }

    const admin = await Admin.findOne({ email });

    if (admin) {
        admin.password = password;
        await admin.save();
        res.status(200).json({
            message: `Contraseña actualizada para ${email}`,
            email: admin.email,
        });
    } else {
        const newAdmin = await Admin.create({
            email,
            password,
            role: 'superadmin'
        });
        res.status(201).json({
            message: `Administrador creado exitosamente.`,
            email: newAdmin.email,
        });
    }
});

export { authAdmin, setupAdmin };