import asyncHandler from 'express-async-handler';
import { hijosDelTutorFilter } from '../utils/userQuery.js';
import { buildClubEntryToken, parseClubEntryToken } from '../services/clubEntryToken.service.js';

const MEMBER_QR_ROLES = [
    'atleta',
    'tutor',
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
    'admin_club',
    'administrativo',
];
const SCANNER_ROLES = ['admin_club', 'administrativo', 'control_ingreso'];
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

function entryUserPayload(user) {
    return {
        _id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: user.rol,
        fotoPerfil: user.fotoPerfil || '',
        dni: user.dni || '',
        estado: user.estado,
    };
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// @route GET /api/club-entry/my-qr?forUserId=
const getMyClubEntryQr = asyncHandler(async (req, res) => {
    const { User } = req.models;
    let targetUser = req.user;

    if (req.query.forUserId) {
        if (req.user.rol !== 'tutor') {
            res.status(403);
            throw new Error('Solo un tutor puede mostrar el QR de un atleta vinculado.');
        }
        const hijo = await User.findOne({
            _id: req.query.forUserId,
            ...hijosDelTutorFilter(req.user._id),
            rol: 'atleta',
        }).select('-password');
        if (!hijo) {
            res.status(404);
            throw new Error('Atleta no encontrado en tu familia.');
        }
        targetUser = hijo;
    } else if (!MEMBER_QR_ROLES.includes(req.user.rol)) {
        res.status(403);
        throw new Error('Tu rol no puede generar un QR de ingreso.');
    }

    const { token, expiresAt } = buildClubEntryToken(req.clubIdentifier, targetUser._id);

    res.json({
        qrValue: `gpsports:entry:${token}`,
        token,
        expiresAt,
        member: entryUserPayload(targetUser),
    });
});

// @route POST /api/club-entry/scan
const scanClubEntryQr = asyncHandler(async (req, res) => {
    const { token } = req.body || {};
    const { User, ClubEntry } = req.models;

    const parsed = parseClubEntryToken(token, req.clubIdentifier);
    const member = await User.findById(parsed.userId).select('-password');
    if (!member) {
        res.status(404);
        throw new Error('Socio no encontrado en este club.');
    }

    const warnings = [];
    if (member.estado === 'inactivo') {
        res.status(403);
        throw new Error('El usuario está inactivo y no puede ingresar.');
    }
    if (member.estado === 'moroso') {
        warnings.push('El usuario figura como moroso.');
    }

    const alreadyUsed = await ClubEntry.findOne({ tokenNonce: parsed.nonce }).select('_id').lean();
    if (alreadyUsed) {
        res.status(409);
        throw new Error('Este QR ya fue utilizado. Pedile al socio que actualice su pantalla.');
    }

    const recentCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const recent = await ClubEntry.findOne({
        user: member._id,
        scannedAt: { $gte: recentCutoff },
        duplicate: false,
    })
        .sort({ scannedAt: -1 })
        .lean();

    const duplicate = !!recent;

    let entry;
    try {
        entry = await ClubEntry.create({
            user: member._id,
            scannedBy: req.user._id,
            tokenNonce: parsed.nonce,
            duplicate,
        });
    } catch (e) {
        if (e?.code === 11000) {
            res.status(409);
            throw new Error('Este QR ya fue utilizado. Pedile al socio que actualice su pantalla.');
        }
        throw e;
    }

    res.json({
        ok: true,
        duplicate,
        duplicateMinutesAgo: duplicate
            ? Math.max(1, Math.round((Date.now() - new Date(recent.scannedAt).getTime()) / 60000))
            : null,
        warnings,
        scannedAt: entry.scannedAt,
        member: entryUserPayload(member),
        scannedBy: {
            _id: req.user._id,
            nombre: req.user.nombre,
            apellido: req.user.apellido,
        },
    });
});

// @route GET /api/club-entry/today
const getTodayClubEntries = asyncHandler(async (req, res) => {
    const { ClubEntry } = req.models;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);

    const entries = await ClubEntry.find({ scannedAt: { $gte: startOfToday() } })
        .sort({ scannedAt: -1 })
        .limit(limit)
        .populate('user', 'nombre apellido rol fotoPerfil dni estado')
        .populate('scannedBy', 'nombre apellido')
        .lean();

    res.json(
        entries.map((e) => ({
            _id: e._id,
            scannedAt: e.scannedAt,
            duplicate: e.duplicate,
            member: e.user
                ? {
                      _id: e.user._id,
                      nombre: e.user.nombre,
                      apellido: e.user.apellido,
                      rol: e.user.rol,
                      fotoPerfil: e.user.fotoPerfil || '',
                      dni: e.user.dni || '',
                      estado: e.user.estado,
                  }
                : null,
            scannedBy: e.scannedBy
                ? { nombre: e.scannedBy.nombre, apellido: e.scannedBy.apellido }
                : null,
        })),
    );
});

export { getMyClubEntryQr, scanClubEntryQr, getTodayClubEntries, MEMBER_QR_ROLES, SCANNER_ROLES };
