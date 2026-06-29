import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

const generateAccessToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
};

const generateRefreshToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
};

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
};

function readRefreshToken(req) {
    return req.cookies?.refreshToken || req.body?.refreshToken || null;
}

function sendRefreshCookie(res, refreshToken) {
    res.cookie('refreshToken', refreshToken, cookieOptions);
}

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { User } = req.models;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        sendRefreshCookie(res, refreshToken);

        res.json({
            _id: user._id,
            nombre: user.nombre,
            apellido: user.apellido,
            rol: user.rol,
            fotoPerfil: user.fotoPerfil || '',
            token: accessToken,
            refreshToken,
        });
    } else {
        res.status(401);
        throw new Error('Email o contraseña incorrectos');
    }
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) {
        res.status(401);
        throw new Error('No hay refresh token');
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const { User } = req.models;
        const user = await User.findById(decoded.id);

        if (!user) {
            res.status(401);
            throw new Error('Usuario no encontrado');
        }

        const accessToken = generateAccessToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        sendRefreshCookie(res, newRefreshToken);

        res.json({
            token: accessToken,
            refreshToken: newRefreshToken,
        });
    } catch (error) {
        res.status(403);
        throw new Error('Refresh token inválido o expirado');
    }
});

const logoutUser = asyncHandler(async (req, res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });
    res.json({ ok: true });
});

export { loginUser, refreshAccessToken, logoutUser };
