import asyncHandler from 'express-async-handler';
import { assertUploadedSize } from '../config/cloudinary.js';
import { findDefaultSocialFeeForRole } from '../services/generateSocialFees.service.js';
import { checkDniPhotosMatchForm } from '../services/dniPhotoCheck.service.js';
import { createSocioAltaMpPreference } from '../services/socioAltaMp.service.js';
import { fulfillSocioAltaById } from '../services/socioAltaFulfill.service.js';
import { isClubMercadoPagoLinked } from '../services/mercadoPagoClub.service.js';
import { normalizeDniDigits } from '../utils/dniPhotos.js';
import { DEFAULT_CLUB_TIMEZONE } from '../utils/timeHelper.js';

const PENDING_TTL_MS = 48 * 60 * 60 * 1000;

async function getOrCreateSettings(models) {
    const { ClubSettings } = models;
    let doc = await ClubSettings.findOne();
    if (!doc) {
        doc = await ClubSettings.create({});
    }
    return doc;
}

async function resolveClubBranding(req) {
    return {
        nombre: req.clubNombre || req.club?.nombre || req.clubIdentifier || 'Club',
        urlIdentifier: req.clubIdentifier || '',
        logoUrl: req.clubLogoUrl || '',
        primaryColor: req.clubPrimaryColor || '#150224',
    };
}

// @route GET /api/socio-alta/public/config
export const getPublicSocioAltaConfig = asyncHandler(async (req, res) => {
    const settings = await getOrCreateSettings(req.models);
    const branding = await resolveClubBranding(req);
    const enabled = settings.altaSocioPublicaEnabled === true;
    const fee = enabled ? await findDefaultSocialFeeForRole(req.models, 'socio') : null;
    const mpLinked =
        (await isClubMercadoPagoLinked(req.models)) ||
        !!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

    const canSignup = enabled && !!fee && Number(fee.monto) > 0 && mpLinked;

    res.json({
        enabled,
        canSignup,
        club: branding,
        fee: fee
            ? {
                  _id: fee._id,
                  nombre: fee.nombre,
                  monto: Number(fee.monto) || 0,
                  descripcion: fee.descripcion || '',
              }
            : null,
        reasons: {
            disabled: !enabled,
            missingFee: enabled && !fee,
            mpNotLinked: enabled && !mpLinked,
        },
        message: !enabled
            ? 'Este club no tiene habilitada el alta pública de socios.'
            : !fee
              ? 'No hay una cuota social activa configurada para socios.'
              : !mpLinked
                ? 'Mercado Pago no está configurado en este club.'
                : null,
    });
});

// @route POST /api/socio-alta/public/photo
export const uploadPublicSocioAltaPhoto = asyncHandler(async (req, res) => {
    const settings = await getOrCreateSettings(req.models);
    if (!settings.altaSocioPublicaEnabled) {
        res.status(403);
        throw new Error('Alta pública de socios deshabilitada.');
    }
    if (!req.file) {
        res.status(400);
        throw new Error('No se recibió ningún archivo válido.');
    }
    try {
        assertUploadedSize(req.file);
    } catch (e) {
        const status = e.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status);
        throw e;
    }
    const url = req.file.path || req.file.secure_url;
    if (!url) {
        res.status(500);
        throw new Error('No se pudo subir la foto.');
    }
    res.json({ url, secureUrl: url });
});

// @route POST /api/socio-alta/public/submit
export const submitPublicSocioAlta = asyncHandler(async (req, res) => {
    const { User, SocioAltaPending } = req.models;
    const settings = await getOrCreateSettings(req.models);
    if (!settings.altaSocioPublicaEnabled) {
        res.status(403);
        throw new Error('Alta pública de socios deshabilitada.');
    }

    const fee = await findDefaultSocialFeeForRole(req.models, 'socio');
    if (!fee || !(Number(fee.monto) > 0)) {
        res.status(400);
        throw new Error('No hay una cuota social activa para socios en este club.');
    }

    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    const apellido = String(body.apellido || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const dni = normalizeDniDigits(body.dni);
    const telefono = String(body.telefono || '').trim();
    const direccion = String(body.direccion || '').trim();
    const sexo = body.sexo === 'M' || body.sexo === 'F' ? body.sexo : '';
    const dniFotoFrente = String(body.dniFotoFrente || '').trim();
    const dniFotoDorso = String(body.dniFotoDorso || '').trim();
    const fechaNacimiento = body.fechaNacimiento ? new Date(body.fechaNacimiento) : null;

    if (!nombre || !apellido) {
        res.status(400);
        throw new Error('Nombre y apellido son obligatorios.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400);
        throw new Error('Ingresá un email válido.');
    }
    if (dni.length < 7 || dni.length > 9) {
        res.status(400);
        throw new Error('Ingresá un DNI válido (7 a 9 dígitos).');
    }
    if (!dniFotoFrente || !dniFotoDorso) {
        res.status(400);
        throw new Error('Subí las fotos del frente y dorso del DNI.');
    }

    const emailTaken = await User.findOne({ email }).select('_id').lean();
    if (emailTaken) {
        res.status(400);
        throw new Error('Ese email ya está registrado en este club.');
    }
    const dniTaken = await User.findOne({ dni }).select('_id').lean();
    if (dniTaken) {
        res.status(400);
        throw new Error('Ese DNI ya está registrado en este club.');
    }

    const openPending = await SocioAltaPending.findOne({
        estado: 'pendiente_pago',
        expiresAt: { $gt: new Date() },
        $or: [{ email }, { dni }],
    })
        .select('_id')
        .lean();
    if (openPending) {
        res.status(400);
        throw new Error(
            'Ya hay un alta en curso con ese email o DNI. Completá el pago o esperá a que expire (48 h).',
        );
    }

    const ocr = await checkDniPhotosMatchForm({
        dniFotoFrente,
        dniFotoDorso,
        dni,
        nombre,
        apellido,
    });
    if (!ocr.ok) {
        res.status(400);
        throw new Error(ocr.reason || 'Las fotos del DNI no coinciden con los datos.');
    }

    const pending = await SocioAltaPending.create({
        nombre,
        apellido,
        email,
        dni,
        telefono,
        direccion,
        fechaNacimiento:
            fechaNacimiento && !Number.isNaN(fechaNacimiento.getTime()) ? fechaNacimiento : null,
        sexo,
        dniFotoFrente,
        dniFotoDorso,
        socialFee: fee._id,
        monto: Number(fee.monto) || 0,
        estado: 'pendiente_pago',
        expiresAt: new Date(Date.now() + PENDING_TTL_MS),
        ocrMeta: ocr.meta || {},
    });

    const branding = await resolveClubBranding(req);
    let pref;
    try {
        pref = await createSocioAltaMpPreference(req.models, req.clubIdentifier, pending, {
            clubNombre: branding.nombre,
            feeNombre: fee.nombre,
        });
    } catch (e) {
        pending.estado = 'cancelado';
        await pending.save();
        res.status(e.statusCode || 500);
        throw e;
    }

    pending.mpPreferenceId = pref.idPreferencia || '';
    await pending.save();

    res.status(201).json({
        pendingId: pending._id,
        monto: pref.monto,
        idPreferencia: pref.idPreferencia,
        linkDePago: pref.linkDePago,
        message: 'Datos validados. Continuá con el pago de la cuota social.',
    });
});

function clampCorteDia(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return Math.min(28, Math.max(1, n));
}

function serializeSocioAltaSettings(settings, fee, club) {
    const marketing = String(process.env.MARKETING_SITE_URL || 'https://hermesclubapp.com')
        .trim()
        .replace(/\/$/, '');
    const corte = clampCorteDia(settings?.altaSocioCorteDia) || 28;
    return {
        altaSocioPublicaEnabled: settings?.altaSocioPublicaEnabled === true,
        altaSocioCorteDia: corte,
        publicUrl: club ? `${marketing}/alta-socio?club=${encodeURIComponent(club)}` : '',
        fee: fee
            ? { _id: fee._id, nombre: fee.nombre, monto: Number(fee.monto) || 0 }
            : null,
    };
}

// @route GET /api/socio-alta/settings (admin)
export const getSocioAltaSettings = asyncHandler(async (req, res) => {
    const settings = await getOrCreateSettings(req.models);
    const fee = await findDefaultSocialFeeForRole(req.models, 'socio');
    res.json(serializeSocioAltaSettings(settings, fee, req.clubIdentifier || ''));
});

// @route PATCH /api/socio-alta/settings (admin_club only)
export const patchSocioAltaSettings = asyncHandler(async (req, res) => {
    const hasEnabled = req.body?.altaSocioPublicaEnabled !== undefined;
    const hasCorte = req.body?.altaSocioCorteDia !== undefined;
    if (!hasEnabled && !hasCorte) {
        res.status(400);
        throw new Error('Indicá altaSocioPublicaEnabled y/o altaSocioCorteDia.');
    }

    const { ClubSettings } = req.models;
    const update = {};
    if (hasEnabled) {
        update.altaSocioPublicaEnabled =
            req.body.altaSocioPublicaEnabled === true || req.body.altaSocioPublicaEnabled === 'true';
    }
    if (hasCorte) {
        const corte = clampCorteDia(req.body.altaSocioCorteDia);
        if (corte == null) {
            res.status(400);
            throw new Error('El día de corte debe ser un número entre 1 y 28.');
        }
        update.altaSocioCorteDia = corte;
    }

    const settings = await ClubSettings.findOneAndUpdate({}, update, {
        upsert: true,
        new: true,
    });
    const fee = await findDefaultSocialFeeForRole(req.models, 'socio');
    const payload = serializeSocioAltaSettings(settings, fee, req.clubIdentifier || '');

    let message = 'Configuración de alta pública actualizada.';
    if (hasEnabled && !hasCorte) {
        message = payload.altaSocioPublicaEnabled
            ? 'Alta pública de socios activada.'
            : 'Alta pública de socios desactivada.';
    } else if (hasCorte && !hasEnabled) {
        message = `Día de corte de primera cuota: ${payload.altaSocioCorteDia}.`;
    }

    res.json({ ...payload, message });
});

function serializeAltaRow(doc) {
    const lean = doc?.toObject ? doc.toObject() : doc;
    if (!lean) return null;
    const user = lean.userId && typeof lean.userId === 'object' ? lean.userId : null;
    return {
        _id: lean._id,
        nombre: lean.nombre,
        apellido: lean.apellido,
        email: lean.email,
        dni: lean.dni,
        telefono: lean.telefono || '',
        direccion: lean.direccion || '',
        fechaNacimiento: lean.fechaNacimiento || null,
        sexo: lean.sexo || '',
        dniFotoFrente: lean.dniFotoFrente || '',
        dniFotoDorso: lean.dniFotoDorso || '',
        monto: Number(lean.monto) || 0,
        estado: lean.estado,
        mpPaymentId: lean.mpPaymentId || '',
        createdAt: lean.createdAt,
        updatedAt: lean.updatedAt,
        revisadoAt: lean.revisadoAt || null,
        revisadoPor: lean.revisadoPor || null,
        userId: user
            ? {
                  _id: user._id,
                  nombre: user.nombre,
                  apellido: user.apellido,
                  email: user.email,
                  dni: user.dni,
                  fotoPerfil: user.fotoPerfil || '',
                  telefono: user.telefono || '',
                  estado: user.estado,
                  dniFotoFrente: user.dniFotoFrente || lean.dniFotoFrente || '',
                  dniFotoDorso: user.dniFotoDorso || lean.dniFotoDorso || '',
              }
            : lean.userId || null,
    };
}

// @route GET /api/socio-alta/altas (admin) — altas públicas pagadas para revisar
export const listSocioAltas = asyncHandler(async (req, res) => {
    const { SocioAltaPending } = req.models;
    const filter = { estado: 'pagado' };
    const revisado = String(req.query.revisado || '').toLowerCase();
    if (revisado === 'false' || revisado === '0' || revisado === 'pendiente') {
        filter.revisadoAt = null;
    } else if (revisado === 'true' || revisado === '1') {
        filter.revisadoAt = { $ne: null };
    }
    const rows = await SocioAltaPending.find(filter)
        .populate('userId', 'nombre apellido email dni fotoPerfil telefono estado dniFotoFrente dniFotoDorso')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    res.json(rows.map(serializeAltaRow));
});

// @route PATCH /api/socio-alta/altas/:id/revisar (admin)
export const markSocioAltaRevisada = asyncHandler(async (req, res) => {
    const { SocioAltaPending } = req.models;
    const pending = await SocioAltaPending.findById(req.params.id);
    if (!pending) {
        res.status(404);
        throw new Error('Alta no encontrada.');
    }
    if (pending.estado !== 'pagado') {
        res.status(400);
        throw new Error('Solo se pueden revisar altas ya pagadas.');
    }
    pending.revisadoAt = new Date();
    pending.revisadoPor = req.user?._id || null;
    await pending.save();
    const populated = await SocioAltaPending.findById(pending._id)
        .populate('userId', 'nombre apellido email dni fotoPerfil telefono estado dniFotoFrente dniFotoDorso')
        .lean();
    res.json({
        ...serializeAltaRow(populated),
        message: 'Alta marcada como revisada.',
    });
});

/** Used by MP webhook apply path. */
export async function applySocioAltaPayment(models, pendingId, paymentData, reqMeta = {}) {
    return fulfillSocioAltaById(models, pendingId, {
        mpPaymentId: String(paymentData?.id || ''),
        clubIdentifier: reqMeta.clubIdentifier || '',
        clubNombre: reqMeta.clubNombre || '',
        clubTimezone: reqMeta.clubTimezone || DEFAULT_CLUB_TIMEZONE,
    });
}
