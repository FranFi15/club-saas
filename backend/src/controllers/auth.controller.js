import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
/** Debe coincidir con frontend/src/constants/legal.js → TERMS_VERSION */
const CURRENT_TERMS_VERSION = '2026-08-15';

const generateAccessToken = (id, club) => {
    const payload = { id };
    if (club) payload.club = club;
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
};

const generateRefreshToken = (id, club) => {
    const payload = { id };
    if (club) payload.club = club;
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
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

function assertActiveUser(user, res) {
    if (!user) {
        res.status(401);
        throw new Error('Usuario no encontrado');
    }
    if (user.estado === 'inactivo') {
        res.status(401);
        throw new Error('Tu cuenta está desactivada. Consultá en administración.');
    }
}

function assertClubClaim(decoded, req, res) {
    if (decoded.club && req.clubIdentifier && decoded.club !== req.clubIdentifier) {
        res.status(401);
        throw new Error('Token no válido para este club');
    }
}

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { User } = req.models;
    const club = req.clubIdentifier;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        assertActiveUser(user, res);

        const accessToken = generateAccessToken(user._id, club);
        const refreshToken = generateRefreshToken(user._id, club);

        sendRefreshCookie(res, refreshToken);

        res.json({
            _id: user._id,
            nombre: user.nombre,
            apellido: user.apellido,
            rol: user.rol,
            fotoPerfil: user.fotoPerfil || '',
            token: accessToken,
            refreshToken,
            acceptedTermsVersion: user.acceptedTermsVersion || '',
            acceptedTermsAt: user.acceptedTermsAt || null,
            currentTermsVersion: CURRENT_TERMS_VERSION,
            needsTermsAcceptance: (user.acceptedTermsVersion || '') !== CURRENT_TERMS_VERSION,
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
        assertClubClaim(decoded, req, res);

        const { User } = req.models;
        const user = await User.findById(decoded.id);
        assertActiveUser(user, res);

        const club = req.clubIdentifier;
        const accessToken = generateAccessToken(user._id, club);
        const newRefreshToken = generateRefreshToken(user._id, club);

        sendRefreshCookie(res, newRefreshToken);

        res.json({
            token: accessToken,
            refreshToken: newRefreshToken,
            acceptedTermsVersion: user.acceptedTermsVersion || '',
            acceptedTermsAt: user.acceptedTermsAt || null,
            currentTermsVersion: CURRENT_TERMS_VERSION,
            needsTermsAcceptance: (user.acceptedTermsVersion || '') !== CURRENT_TERMS_VERSION,
        });
    } catch (error) {
        if (res.statusCode === 401) throw error;
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

const acceptTerms = asyncHandler(async (req, res) => {
    const version = String(req.body?.version || '').trim();
    if (!version) {
        res.status(400);
        throw new Error('Falta la versión de los términos.');
    }
    if (version !== CURRENT_TERMS_VERSION) {
        res.status(400);
        throw new Error('La versión de términos no es la vigente. Actualizá la app e intentá de nuevo.');
    }

    const user = req.user;
    user.acceptedTermsVersion = version;
    user.acceptedTermsAt = new Date();
    await user.save();

    res.json({
        ok: true,
        acceptedTermsVersion: user.acceptedTermsVersion,
        acceptedTermsAt: user.acceptedTermsAt,
        currentTermsVersion: CURRENT_TERMS_VERSION,
    });
});

export { loginUser, refreshAccessToken, logoutUser, acceptTerms };
