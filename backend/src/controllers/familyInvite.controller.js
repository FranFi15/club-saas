import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import { assertUploadedSize } from '../config/cloudinary.js';
import { syncFamilyDiscountForTutor, applyFamilyDiscountToEnrollment } from '../services/familyDiscount.service.js';
import { ensureCurrentMonthPaymentForEnrollment } from '../services/generateMonthlyPayments.service.js';
import { syncCategoryGroupChatSafe } from '../services/categoryGroupChat.service.js';
import { syncAthleteCountToSuper } from '../services/athleteQuota.service.js';
import { categorySexoError, applyCategorySexoToAthlete } from '../utils/atletaSexo.js';
import { resolveNewEnrollmentBilling } from '../services/disciplineBilling.service.js';
import { parseTrialCreateFields, enrollmentBillingForTrial } from '../services/trialAthlete.service.js';
import { matchesCategoryAgeLimits } from '../utils/ageHelper.js';
import { resolveAthleteEmail, isAthleteInternalEmail } from '../utils/athleteLoginEmail.js';

const CURRENT_TERMS_VERSION = '2026-08-15';
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const MARKETING_SITE = (process.env.MARKETING_SITE_URL || 'https://hermesclubapp.com').replace(/\/$/, '');

function assertAgeFitsCategory(category, fechaNacimiento, label) {
    if (category.edadMinima == null && category.edadMaxima == null) return;
    if (!fechaNacimiento) {
        const err = new Error(`${label}: indicá la fecha de nacimiento (la categoría tiene límites de edad).`);
        err.statusCode = 400;
        throw err;
    }
    if (!matchesCategoryAgeLimits(category, fechaNacimiento)) {
        const err = new Error(
            `${label}: no cumple el rango de edad de ${category.nombre} (${category.edadMinima ?? '?'}–${category.edadMaxima ?? '?'} años).`,
        );
        err.statusCode = 400;
        throw err;
    }
}

function invitePublicUrl(clubIdentifier, token) {
    return `${MARKETING_SITE}/alta-familia?club=${encodeURIComponent(clubIdentifier)}&token=${encodeURIComponent(token)}`;
}

function serializeInvitePreview(invite, clubNombre) {
    const tutorCount = Number(invite.tutorCount) || 0;
    return {
        estado: invite.estado,
        expiresAt: invite.expiresAt,
        expired: invite.expiresAt < new Date() || invite.estado !== 'pendiente',
        clubNombre: clubNombre || '',
        tutorCount,
        requiereTutor: tutorCount > 0,
        athleteSlots: (invite.athleteSlots || []).map((slot, i) => ({
            index: i,
            slotId: String(slot._id),
            disciplina: slot.disciplina
                ? { _id: slot.disciplina._id, nombre: slot.disciplina.nombre }
                : null,
            categoria: slot.categoria
                ? {
                      _id: slot.categoria._id,
                      nombre: slot.categoria.nombre,
                      edadMinima: slot.categoria.edadMinima,
                      edadMaxima: slot.categoria.edadMaxima,
                      sexo: slot.categoria.sexo || 'ambos',
                  }
                : null,
        })),
        notas: invite.notas || '',
    };
}

async function loadInviteOrThrow(FamilyInvite, token, { forRedeem = false } = {}) {
    const invite = await FamilyInvite.findOne({ token })
        .populate('athleteSlots.disciplina', 'nombre planDefault')
        .populate({
            path: 'athleteSlots.categoria',
            select: 'nombre disciplina planDefault edadMinima edadMaxima edadCorteDesde edadCorteHasta sexo',
            populate: { path: 'disciplina', select: 'nombre planDefault' },
        });

    if (!invite) {
        const err = new Error('Invitación no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (invite.estado === 'cancelada') {
        const err = new Error('Esta invitación fue cancelada por el club.');
        err.statusCode = 410;
        throw err;
    }
    if (invite.estado === 'completada') {
        const err = new Error('Esta invitación ya fue utilizada.');
        err.statusCode = 410;
        throw err;
    }
    if (invite.expiresAt < new Date()) {
        if (forRedeem) {
            const err = new Error('Esta invitación expiró. Pedile al club un enlace nuevo.');
            err.statusCode = 410;
            throw err;
        }
    }
    return invite;
}

// @desc    Crear invitación de familia (admin)
// @route   POST /api/family-invites
const createFamilyInvite = asyncHandler(async (req, res) => {
    const { FamilyInvite, Category } = req.models;
    const {
        athleteSlots,
        notas,
        expiresInHours,
        includeTutor,
        tutorCount: tutorCountRaw,
        esPrueba,
        diasPrueba,
    } = req.body;

    if (!Array.isArray(athleteSlots) || athleteSlots.length < 1 || athleteSlots.length > 10) {
        res.status(400);
        throw new Error('Indicá entre 1 y 10 atletas con disciplina y categoría.');
    }

    let tutorCount = 1;
    if (typeof includeTutor === 'boolean') {
        tutorCount = includeTutor ? 1 : 0;
    } else if (tutorCountRaw !== undefined && tutorCountRaw !== null && tutorCountRaw !== '') {
        tutorCount = Number(tutorCountRaw) > 0 ? 1 : 0;
    }

    let trialInvite = { esPrueba: false, diasPrueba: null };
    if (esPrueba === true || esPrueba === 'true') {
        try {
            const parsed = parseTrialCreateFields({ esPrueba: true, diasPrueba, rol: 'atleta' });
            trialInvite = { esPrueba: true, diasPrueba: Math.min(365, Math.max(1, Math.floor(Number(diasPrueba)))) };
            void parsed;
        } catch (e) {
            res.status(e.statusCode || 400);
            throw e;
        }
    }

    const normalized = [];
    for (let i = 0; i < athleteSlots.length; i += 1) {
        const slot = athleteSlots[i];
        const categoriaId = slot?.categoria || slot?.categoriaId;
        if (!categoriaId) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: falta la categoría.`);
        }
        const cat = await Category.findById(categoriaId).populate('disciplina', 'nombre');
        if (!cat) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: categoría no encontrada.`);
        }
        normalized.push({
            disciplina: cat.disciplina?._id || cat.disciplina,
            categoria: cat._id,
        });
    }

    const hours = Math.min(Math.max(Number(expiresInHours) || 72, 1), 168);
    const token = crypto.randomBytes(24).toString('hex');
    const invite = await FamilyInvite.create({
        token,
        creadoPor: req.user._id,
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
        tutorCount,
        esPrueba: trialInvite.esPrueba,
        diasPrueba: trialInvite.diasPrueba,
        athleteSlots: normalized,
        notas: typeof notas === 'string' ? notas.trim().slice(0, 300) : '',
    });

    const populated = await FamilyInvite.findById(invite._id)
        .populate('athleteSlots.disciplina', 'nombre')
        .populate('athleteSlots.categoria', 'nombre edadMinima edadMaxima sexo');

    res.status(201).json({
        _id: invite._id,
        token: invite.token,
        url: invitePublicUrl(req.clubIdentifier, invite.token),
        expiresAt: invite.expiresAt,
        tutorCount,
        esPrueba: invite.esPrueba,
        diasPrueba: invite.diasPrueba,
        preview: serializeInvitePreview(populated, req.clubIdentifier),
    });
});

// @desc    Listar invitaciones recientes (admin)
// @route   GET /api/family-invites
const listFamilyInvites = asyncHandler(async (req, res) => {
    const { FamilyInvite } = req.models;
    const list = await FamilyInvite.find({})
        .sort({ createdAt: -1 })
        .limit(40)
        .populate('athleteSlots.disciplina', 'nombre')
        .populate('athleteSlots.categoria', 'nombre')
        .populate('creadoPor', 'nombre apellido')
        .lean();

    res.json(
        list.map((inv) => ({
            _id: inv._id,
            estado: inv.estado,
            expiresAt: inv.expiresAt,
            expired: inv.expiresAt < new Date() && inv.estado === 'pendiente',
            athleteCount: inv.athleteSlots?.length || 0,
            tutorCount: Number(inv.tutorCount) || 0,
            esPrueba: Boolean(inv.esPrueba),
            diasPrueba: inv.diasPrueba ?? null,
            requiereTutor: (Number(inv.tutorCount) || 0) > 0,
            slots: (inv.athleteSlots || []).map((s) => ({
                disciplina: s.disciplina?.nombre,
                categoria: s.categoria?.nombre,
            })),
            url: inv.estado === 'pendiente' ? invitePublicUrl(req.clubIdentifier, inv.token) : null,
            creadoPor: inv.creadoPor,
            createdAt: inv.createdAt,
            completedAt: inv.completedAt,
        })),
    );
});

// @desc    Cancelar invitación pendiente
// @route   PATCH /api/family-invites/:id/cancel
const cancelFamilyInvite = asyncHandler(async (req, res) => {
    const { FamilyInvite } = req.models;
    const invite = await FamilyInvite.findById(req.params.id);
    if (!invite) {
        res.status(404);
        throw new Error('Invitación no encontrada.');
    }
    if (invite.estado !== 'pendiente') {
        res.status(400);
        throw new Error('Solo se pueden cancelar invitaciones pendientes.');
    }
    invite.estado = 'cancelada';
    await invite.save();
    res.json({ success: true, estado: invite.estado });
});

// @desc    Vista pública de la invitación (sin auth)
// @route   GET /api/family-invites/public/:token
const getPublicFamilyInvite = asyncHandler(async (req, res) => {
    const { FamilyInvite } = req.models;
    const invite = await loadInviteOrThrow(FamilyInvite, req.params.token);
    const clubNombre = req.clubIdentifier || '';
    res.json(serializeInvitePreview(invite, clubNombre));
});

// @desc    Completar alta de familia (tutor + atletas + inscripciones)
// @route   POST /api/family-invites/public/:token/redeem
const redeemFamilyInvite = asyncHandler(async (req, res) => {
    const { FamilyInvite, User, Enrollment, Category } = req.models;
    const invite = await loadInviteOrThrow(FamilyInvite, req.params.token, { forRedeem: true });
    const requiereTutor = (Number(invite.tutorCount) || 0) > 0;

    const { tutor, atletas, acceptTerms } = req.body || {};
    if (!acceptTerms) {
        res.status(400);
        throw new Error('Tenés que aceptar los Términos y la Política de privacidad.');
    }
    if (!Array.isArray(atletas) || atletas.length !== invite.athleteSlots.length) {
        res.status(400);
        throw new Error(`Debés cargar exactamente ${invite.athleteSlots.length} atleta(s).`);
    }

    let tutorEmail = null;
    if (requiereTutor) {
        if (!tutor?.email || !tutor?.password || !tutor?.nombre || !tutor?.apellido) {
            res.status(400);
            throw new Error('Completá los datos del tutor (nombre, apellido, email y contraseña).');
        }
        if (String(tutor.password).length < 6) {
            res.status(400);
            throw new Error('La contraseña del tutor debe tener al menos 6 caracteres.');
        }
        if (!String(tutor.direccion || '').trim()) {
            res.status(400);
            throw new Error('Indicá la dirección del tutor.');
        }
        if (!String(tutor.fotoPerfil || '').trim()) {
            res.status(400);
            throw new Error('Subí una foto del tutor (cámara o galería).');
        }
        tutorEmail = String(tutor.email).trim().toLowerCase();
        if (await User.findOne({ email: tutorEmail })) {
            res.status(400);
            throw new Error('Ese email del tutor ya está registrado en el club.');
        }
    }

    const athleteEmails = new Set(tutorEmail ? [tutorEmail] : []);
    const resolvedAthleteEmails = [];
    for (let i = 0; i < atletas.length; i += 1) {
        const a = atletas[i];
        if (!a?.nombre || !a?.apellido || !a?.password || !a?.fechaNacimiento) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: faltan nombre, apellido, contraseña o fecha de nacimiento.`);
        }
        if (String(a.password).length < 6) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: la contraseña debe tener al menos 6 caracteres.`);
        }
        if (!String(a.fotoPerfil || '').trim()) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: subí una foto (cámara o galería).`);
        }
        if (!requiereTutor && !String(a.direccion || '').trim()) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: indicá la dirección.`);
        }

        let emailResolved;
        try {
            emailResolved = await resolveAthleteEmail(User, {
                email: a.email,
                nombre: a.nombre,
                apellido: a.apellido,
                clubIdentifier: req.clubIdentifier,
                reservedEmails: athleteEmails,
            });
        } catch (e) {
            res.status(e.statusCode || 400);
            throw new Error(`Atleta ${i + 1}: ${e.message}`);
        }
        if (athleteEmails.has(emailResolved.email)) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: el email/usuario está duplicado en el formulario.`);
        }
        athleteEmails.add(emailResolved.email);
        if (!emailResolved.generated && (await User.findOne({ email: emailResolved.email }))) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: el email ya está registrado en el club.`);
        }
        resolvedAthleteEmails.push(emailResolved);

        const slot = invite.athleteSlots[i];
        const category = await Category.findById(slot.categoria._id || slot.categoria).populate(
            'disciplina',
            'planDefault nombre',
        );
        if (!category) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: la categoría de la invitación ya no existe.`);
        }
        assertAgeFitsCategory(category, a.fechaNacimiento, `Atleta ${i + 1}`);
        const sexo = a.sexo === 'M' || a.sexo === 'F' ? a.sexo : '';
        const sexoErr = categorySexoError(category, { sexo });
        if (sexoErr) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: ${sexoErr}`);
        }
    }

    const termsAt = new Date();
    let createdTutor = null;
    if (requiereTutor) {
        createdTutor = await User.create({
            nombre: String(tutor.nombre).trim(),
            apellido: String(tutor.apellido).trim(),
            email: tutorEmail,
            password: tutor.password,
            telefono: tutor.telefono ? String(tutor.telefono).trim() : undefined,
            dni: tutor.dni ? String(tutor.dni).trim() : undefined,
            direccion: String(tutor.direccion).trim(),
            fotoPerfil: String(tutor.fotoPerfil).trim(),
            rol: 'tutor',
            acceptedTermsVersion: CURRENT_TERMS_VERSION,
            acceptedTermsAt: termsAt,
        });
    }

    const createdAthletes = [];
    const enrollments = [];

    try {
        for (let i = 0; i < atletas.length; i += 1) {
            const a = atletas[i];
            const slot = invite.athleteSlots[i];
            const category = await Category.findById(slot.categoria._id || slot.categoria).populate(
                'disciplina',
                'planDefault nombre',
            );

            const trialFields = invite.esPrueba
                ? parseTrialCreateFields({
                      esPrueba: true,
                      diasPrueba: invite.diasPrueba,
                      rol: 'atleta',
                  })
                : parseTrialCreateFields({ esPrueba: false, rol: 'atleta' });

            const atleta = await User.create({
                nombre: String(a.nombre).trim(),
                apellido: String(a.apellido).trim(),
                email: resolvedAthleteEmails[i].email,
                password: a.password,
                dni: a.dni ? String(a.dni).trim() : undefined,
                fechaNacimiento: a.fechaNacimiento,
                sexo: a.sexo === 'M' || a.sexo === 'F' ? a.sexo : '',
                telefono: a.telefono ? String(a.telefono).trim() : undefined,
                direccion: !createdTutor && a.direccion ? String(a.direccion).trim() : undefined,
                fotoPerfil: String(a.fotoPerfil || '').trim(),
                rol: 'atleta',
                tutorPrincipal: createdTutor?._id || undefined,
                cuotasEnApp: true,
                esPrueba: trialFields.esPrueba,
                pruebaHasta: trialFields.pruebaHasta || undefined,
                exentoCuotaSocial: trialFields.esPrueba ? true : false,
                acceptedTermsVersion: CURRENT_TERMS_VERSION,
                acceptedTermsAt: termsAt,
            });
            atleta._loginHint = resolvedAthleteEmails[i].loginHint;
            atleta._emailGenerado = resolvedAthleteEmails[i].generated;

            await applyCategorySexoToAthlete(atleta, category);

            const billing = await resolveNewEnrollmentBilling(req.models, {
                atletaId: atleta._id,
                category,
                autoKeepOnConflict: true,
            });
            const trialBilling = enrollmentBillingForTrial(billing, trialFields.esPrueba);
            const enrollment = await Enrollment.create({
                atleta: atleta._id,
                categoria: category._id,
                aptoMedico: false,
                plan: trialBilling.plan,
                esFacturacion: trialBilling.esFacturacion,
            });
            if (trialBilling.previousBillingId) {
                const prev = await Enrollment.findById(trialBilling.previousBillingId);
                if (prev) {
                    prev.esFacturacion = false;
                    prev.plan = null;
                    await prev.save();
                }
            }
            await syncCategoryGroupChatSafe(req.models, category._id);

            createdAthletes.push(atleta);
            enrollments.push(enrollment);
        }

        // Descuento familiar solo con 2+ atletas; aplicar después de crear a todos.
        if (createdTutor) {
            try {
                await syncFamilyDiscountForTutor(req.models, createdTutor._id);
                for (let i = 0; i < enrollments.length; i += 1) {
                    enrollments[i] = await applyFamilyDiscountToEnrollment(
                        req.models,
                        createdAthletes[i]._id,
                        enrollments[i],
                    );
                }
            } catch (e) {
                console.warn('[family-invite] descuento:', e.message);
            }
        }

        for (const enrollment of enrollments) {
            if (!enrollment.esFacturacion || !enrollment.plan) continue;
            try {
                await ensureCurrentMonthPaymentForEnrollment(req.models, enrollment, req.clubTimezone);
            } catch (e) {
                console.warn('[family-invite] cuota:', e.message);
            }
        }
    } catch (e) {
        const toDelete = [...createdAthletes.map((u) => u._id)];
        if (createdTutor) toDelete.push(createdTutor._id);
        await User.deleteMany({ _id: { $in: toDelete } });
        await Enrollment.deleteMany({ atleta: { $in: createdAthletes.map((u) => u._id) } });
        throw e;
    }

    invite.estado = 'completada';
    invite.completedAt = new Date();
    invite.tutorCreado = createdTutor?._id;
    invite.atletasCreados = createdAthletes.map((u) => u._id);
    await invite.save();

    await syncAthleteCountToSuper(req.models, req.clubIdentifier);

    res.status(201).json({
        success: true,
        message: requiereTutor
            ? 'Familia registrada. Ya pueden ingresar a la app con el código del club.'
            : 'Registro listo. Ya podés ingresar a la app con el código del club.',
        requiereTutor,
        tutor: createdTutor
            ? {
                  _id: createdTutor._id,
                  email: createdTutor.email,
                  nombre: createdTutor.nombre,
                  apellido: createdTutor.apellido,
              }
            : null,
        atletas: createdAthletes.map((u) => ({
            _id: u._id,
            email: u.email,
            loginHint: u._loginHint || (isAthleteInternalEmail(u.email, req.clubIdentifier)
                ? String(u.email).split('@')[0]
                : u.email),
            emailGenerado: Boolean(u._emailGenerado),
            nombre: u.nombre,
            apellido: u.apellido,
        })),
        enrollments: enrollments.length,
        clubIdentifier: req.clubIdentifier,
    });
});

/** Subida pública de foto de perfil durante el alta por invitación (sin login). */
const uploadPublicFamilyInvitePhoto = asyncHandler(async (req, res) => {
    const { FamilyInvite } = req.models;
    await loadInviteOrThrow(FamilyInvite, req.params.token, { forRedeem: true });

    if (!req.file) {
        res.status(400);
        throw new Error('No se recibió ninguna foto.');
    }

    try {
        assertUploadedSize(req.file);
    } catch (e) {
        res.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
        throw e;
    }

    const mime = String(req.file.mimetype || '').toLowerCase();
    const name = String(req.file.originalname || '').toLowerCase();
    const isImage =
        mime.startsWith('image/') ||
        /\.(jpe?g|png|gif|webp|hei[cf])$/i.test(name);
    if (!isImage) {
        res.status(400);
        throw new Error('Solo se permiten imágenes.');
    }

    const url = req.file.path || req.file.secure_url;
    if (!url) {
        res.status(500);
        throw new Error('No se pudo subir la foto.');
    }

    res.status(200).json({
        message: 'Foto subida',
        url,
        secureUrl: url,
        publicId: req.file.filename || req.file.public_id,
    });
});

export {
    createFamilyInvite,
    listFamilyInvites,
    cancelFamilyInvite,
    getPublicFamilyInvite,
    redeemFamilyInvite,
    uploadPublicFamilyInvitePhoto,
    INVITE_TTL_MS,
};
