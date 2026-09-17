import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import {
    ensureUserRolesPersisted,
    normalizeUserRoles,
} from '../constants/userRoles.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
/** Debe coincidir con frontend/src/constants/legal.js → TERMS_VERSION */
const CURRENT_TERMS_VERSION = '2026-08-15';

const generateAccessToken = (id, club, activeRol) => {
    const payload = { id };
    if (club) payload.club = club;
    if (activeRol) payload.activeRol = activeRol;
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
};

const generateRefreshToken = (id, club, activeRol) => {
    const payload = { id };
    if (club) payload.club = club;
    if (activeRol) payload.activeRol = activeRol;
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

function resolveActiveRol(user, preferred) {
    const roles = normalizeUserRoles(user);
    if (preferred && roles.includes(preferred)) return preferred;
    return user.rol && roles.includes(user.rol) ? user.rol : roles[0];
}

function authUserPayload(user, activeRol, accessToken, refreshToken) {
    const roles = normalizeUserRoles(user);
    return {
        _id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: activeRol || user.rol,
        roles,
        fotoPerfil: user.fotoPerfil || '',
        token: accessToken,
        refreshToken,
        acceptedTermsVersion: user.acceptedTermsVersion || '',
        acceptedTermsAt: user.acceptedTermsAt || null,
        currentTermsVersion: CURRENT_TERMS_VERSION,
        needsTermsAcceptance: (user.acceptedTermsVersion || '') !== CURRENT_TERMS_VERSION,
    };
}

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { User } = req.models;
    const club = req.clubIdentifier;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        assertActiveUser(user, res);
        await ensureUserRolesPersisted(user);

        const activeRol = resolveActiveRol(user, user.rol);
        const accessToken = generateAccessToken(user._id, club, activeRol);
        const refreshToken = generateRefreshToken(user._id, club, activeRol);

        sendRefreshCookie(res, refreshToken);

        res.json(authUserPayload(user, activeRol, accessToken, refreshToken));
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
        await ensureUserRolesPersisted(user);

        const activeRol = resolveActiveRol(user, decoded.activeRol);
        const club = req.clubIdentifier;
        const accessToken = generateAccessToken(user._id, club, activeRol);
        const newRefreshToken = generateRefreshToken(user._id, club, activeRol);

        sendRefreshCookie(res, newRefreshToken);

        res.json({
            token: accessToken,
            refreshToken: newRefreshToken,
            rol: activeRol,
            roles: normalizeUserRoles(user),
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

const selectRole = asyncHandler(async (req, res) => {
    const requested = String(req.body?.rol || '').trim();
    if (!requested) {
        res.status(400);
        throw new Error('Falta el rol');
    }

    const user = req.user;
    await ensureUserRolesPersisted(user);
    const roles = normalizeUserRoles(user);
    if (!roles.includes(requested)) {
        res.status(400);
        throw new Error('Ese rol no está asignado a tu usuario');
    }

    const club = req.clubIdentifier;
    const accessToken = generateAccessToken(user._id, club, requested);
    const refreshToken = generateRefreshToken(user._id, club, requested);
    sendRefreshCookie(res, refreshToken);

    res.json(authUserPayload(user, requested, accessToken, refreshToken));
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
    const primary = user._primaryRol;
    const active = user.rol;
    if (primary) {
        user.rol = primary;
    }
    user.acceptedTermsVersion = version;
    user.acceptedTermsAt = new Date();
    await user.save();
    if (active) {
        user.rol = active;
        user._primaryRol = primary || user.rol;
        if (typeof user.unmarkModified === 'function') user.unmarkModified('rol');
    }

    res.json({
        ok: true,
        acceptedTermsVersion: user.acceptedTermsVersion,
        acceptedTermsAt: user.acceptedTermsAt,
        currentTermsVersion: CURRENT_TERMS_VERSION,
    });
});

export { loginUser, refreshAccessToken, selectRole, logoutUser, acceptTerms };
