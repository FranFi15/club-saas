import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
    findUserByLoginIdentifier,
    isAthleteInternalEmail,
} from '../utils/athleteLoginEmail.js';
import {
    ensureUserRolesPersisted,
    normalizeUserRoles,
} from '../constants/userRoles.js';
import { sendEmail, isEmailConfigured } from '../services/email.service.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Debe coincidir con frontend/src/constants/legal.js → TERMS_VERSION */
const CURRENT_TERMS_VERSION = '2026-08-15';

function hashResetToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function frontendAppBaseUrl() {
    const raw = String(process.env.FRONTEND_URL || 'https://app.hermesclubapp.com')
        .split(',')[0]
        .trim()
        .replace(/\/$/, '');
    return raw || 'https://app.hermesclubapp.com';
}

function buildPasswordResetUrl(clubIdentifier, token) {
    const base = frontendAppBaseUrl();
    const q = new URLSearchParams({
        club: clubIdentifier,
        token,
    });
    return `${base}/reset-password?${q.toString()}`;
}
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

    const user = await findUserByLoginIdentifier(User, email, club);

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

const GENERIC_FORGOT_MSG =
    'Si existe una cuenta con ese email en este club, te enviamos un enlace para restablecer la contraseña. Revisá tu bandeja de entrada y spam.';

// @desc    Solicitar email de restablecimiento de contraseña
// @route   POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
    const identifier = String(req.body?.email || '').trim();
    const club = req.clubIdentifier;
    const { User } = req.models;

    if (!identifier) {
        res.status(400);
        throw new Error('Indicá tu email.');
    }

    // Siempre misma respuesta (no filtrar existencia de cuentas).
    const respondOk = () => res.json({ ok: true, message: GENERIC_FORGOT_MSG });

    if (!isEmailConfigured()) {
        console.error('[auth] forgot-password: RESEND_API_KEY no configurada');
        return respondOk();
    }

    const user = await findUserByLoginIdentifier(User, identifier, club);
    if (!user) {
        return respondOk();
    }

    if (user.estado === 'inactivo') {
        return respondOk();
    }

    // Cuentas con email interno (login por usuario) no pueden recibir mail.
    if (isAthleteInternalEmail(user.email, club) || !String(user.email || '').includes('@')) {
        return respondOk();
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = hashResetToken(rawToken);
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save({ validateBeforeSave: false });

    const resetUrl = buildPasswordResetUrl(club, rawToken);
    const nombre = [user.nombre, user.apellido].filter(Boolean).join(' ').trim() || 'Hola';

    try {
        await sendEmail({
            to: user.email,
            subject: 'Restablecé tu contraseña — Hermes Club',
            text: `${nombre},\n\nRecibimos un pedido para restablecer tu contraseña del club.\n\nAbrí este enlace (válido 1 hora):\n${resetUrl}\n\nSi no pediste esto, ignorá el mensaje.`,
            html: `
              <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
                <p style="font-size:16px;margin:0 0 12px">${nombre},</p>
                <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
                  Recibimos un pedido para restablecer tu contraseña en <strong>Hermes Club</strong>.
                </p>
                <p style="margin:0 0 24px">
                  <a href="${resetUrl}" style="display:inline-block;background:#150224;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
                    Elegir nueva contraseña
                  </a>
                </p>
                <p style="font-size:13px;color:#555;line-height:1.4;margin:0 0 8px">
                  El enlace vence en 1 hora. Si no pediste este cambio, podés ignorar este email.
                </p>
                <p style="font-size:12px;color:#888;word-break:break-all;margin:16px 0 0">${resetUrl}</p>
              </div>
            `,
        });
    } catch (e) {
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        await user.save({ validateBeforeSave: false });
        console.error('[auth] forgot-password send failed:', e.message);
        res.status(e.statusCode || 502);
        throw new Error('No pudimos enviar el email. Probá de nuevo en unos minutos.');
    }

    return respondOk();
});

// @desc    Restablecer contraseña con token del email
// @route   POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
    const rawToken = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    const { User } = req.models;

    if (!rawToken) {
        res.status(400);
        throw new Error('Falta el token de restablecimiento.');
    }
    if (password.length < 6) {
        res.status(400);
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }

    const hashed = hashResetToken(rawToken);
    const user = await User.findOne({
        passwordResetToken: hashed,
        passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
        res.status(400);
        throw new Error('El enlace no es válido o ya venció. Pedí uno nuevo desde Olvidé mi contraseña.');
    }

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({
        ok: true,
        message: 'Contraseña actualizada. Ya podés iniciar sesión.',
    });
});

export {
    loginUser,
    refreshAccessToken,
    selectRole,
    logoutUser,
    acceptTerms,
    forgotPassword,
    resetPassword,
};
