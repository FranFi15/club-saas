import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import { syncFamilyDiscountForTutor, applyFamilyDiscountToEnrollment } from '../services/familyDiscount.service.js';
import { ensureCurrentMonthPaymentForEnrollment } from '../services/generateMonthlyPayments.service.js';
import { syncCategoryGroupChatSafe } from '../services/categoryGroupChat.service.js';
import { syncAthleteCountToSuper } from '../services/athleteQuota.service.js';
import { categorySexoError, applyCategorySexoToAthlete } from '../utils/atletaSexo.js';

const CURRENT_TERMS_VERSION = '2026-08-15';
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const MARKETING_SITE = (process.env.MARKETING_SITE_URL || 'https://hermesclubapp.com').replace(/\/$/, '');

function calcAge(fechaNacimiento) {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nac = new Date(fechaNacimiento);
    if (Number.isNaN(nac.getTime())) return null;
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad -= 1;
    return edad;
}

function assertAgeFitsCategory(category, fechaNacimiento, label) {
    if (!category.edadMinima && !category.edadMaxima) return;
    if (!fechaNacimiento) {
        const err = new Error(`${label}: indicá la fecha de nacimiento (la categoría tiene límites de edad).`);
        err.statusCode = 400;
        throw err;
    }
    const edad = calcAge(fechaNacimiento);
    if (edad == null) {
        const err = new Error(`${label}: fecha de nacimiento inválida.`);
        err.statusCode = 400;
        throw err;
    }
    if (category.edadMinima && edad < category.edadMinima) {
        const err = new Error(
            `${label}: no cumple la edad mínima de ${category.nombre} (${category.edadMinima} años).`,
        );
        err.statusCode = 400;
        throw err;
    }
    if (category.edadMaxima && edad > category.edadMaxima) {
        const err = new Error(
            `${label}: supera la edad máxima de ${category.nombre} (${category.edadMaxima} años).`,
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
            select: 'nombre disciplina planDefault edadMinima edadMaxima sexo',
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
    const { athleteSlots, notas, expiresInHours, includeTutor, tutorCount: tutorCountRaw } = req.body;

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
        tutorEmail = String(tutor.email).trim().toLowerCase();
        if (await User.findOne({ email: tutorEmail })) {
            res.status(400);
            throw new Error('Ese email del tutor ya está registrado en el club.');
        }
    }

    const athleteEmails = new Set(tutorEmail ? [tutorEmail] : []);
    for (let i = 0; i < atletas.length; i += 1) {
        const a = atletas[i];
        if (!a?.nombre || !a?.apellido || !a?.email || !a?.password || !a?.fechaNacimiento) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: faltan nombre, apellido, email, contraseña o fecha de nacimiento.`);
        }
        if (String(a.password).length < 6) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: la contraseña debe tener al menos 6 caracteres.`);
        }
        const email = String(a.email).trim().toLowerCase();
        if (athleteEmails.has(email)) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: el email está duplicado en el formulario.`);
        }
        athleteEmails.add(email);
        if (await User.findOne({ email })) {
            res.status(400);
            throw new Error(`Atleta ${i + 1}: el email ya está registrado en el club.`);
        }
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

            const atleta = await User.create({
                nombre: String(a.nombre).trim(),
                apellido: String(a.apellido).trim(),
                email: String(a.email).trim().toLowerCase(),
                password: a.password,
                dni: a.dni ? String(a.dni).trim() : undefined,
                fechaNacimiento: a.fechaNacimiento,
                sexo: a.sexo === 'M' || a.sexo === 'F' ? a.sexo : '',
                telefono: a.telefono ? String(a.telefono).trim() : undefined,
                rol: 'atleta',
                tutorPrincipal: createdTutor?._id || undefined,
                cuotasEnApp: true,
                acceptedTermsVersion: CURRENT_TERMS_VERSION,
                acceptedTermsAt: termsAt,
            });

            await applyCategorySexoToAthlete(atleta, category);

            const planAuto = category.planDefault || category.disciplina?.planDefault || undefined;
            const enrollment = await Enrollment.create({
                atleta: atleta._id,
                categoria: category._id,
                aptoMedico: false,
                plan: planAuto,
            });
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
            try {
                await ensureCurrentMonthPaymentForEnrollment(req.models, enrollment);
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
            nombre: u.nombre,
            apellido: u.apellido,
        })),
        enrollments: enrollments.length,
        clubIdentifier: req.clubIdentifier,
    });
});

export {
    createFamilyInvite,
    listFamilyInvites,
    cancelFamilyInvite,
    getPublicFamilyInvite,
    redeemFamilyInvite,
    INVITE_TTL_MS,
};
