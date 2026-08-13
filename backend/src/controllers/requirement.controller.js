import asyncHandler from 'express-async-handler';
import { createAppNotification } from '../services/appNotification.service.js';
import {
    deliverRequirementToChat,
    countSuccessfulDeliveries,
} from '../services/deliveryToChat.service.js';
import { assertDeliveryTargets } from '../services/staffCategoryAccess.service.js';
import { sortPaymentsByAtleta, sortUsersByName } from '../utils/listSort.js';
import { parsePageLimit, paginationMeta } from '../utils/pagination.js';

// @desc    Crear un nuevo requerimiento de documentos
// @route   POST /api/requirements
const createRequirement = asyncHandler(async (req, res) => {
    const { titulo, descripcion, obligatorio, fechaVencimiento, alcance, targetCategoria, targetUsuario } = req.body;
    const { Requirement } = req.models;

    try {
        await assertDeliveryTargets(req, { allowGlobal: true });
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const requirement = await Requirement.create({
        titulo,
        descripcion,
        obligatorio,
        fechaVencimiento,
        alcance,
        targetCategoria,
        targetUsuario,
        creadoPor: req.user._id,
    });

    let chatDelivered = 0;
    try {
        const delivery = await deliverRequirementToChat(req.models, req.user, requirement);
        chatDelivered = countSuccessfulDeliveries(delivery);
    } catch (e) {
        console.warn('[requirements] chat delivery:', e.message);
    }

    res.status(201).json({
        ...requirement.toObject(),
        chatDelivered,
        message:
            chatDelivered > 0
                ? 'Pedido creado y enviado por chat.'
                : 'Pedido creado. No se pudo enviar por chat; el destinatario igual lo ve en Documentación.',
    });
});

// @desc    Subir un documento (Atleta/Tutor)
// @route   POST /api/requirements/submit
const submitDocument = asyncHandler(async (req, res) => {
    const { requirementId, fileUrl, atletaId: atletaIdBody } = req.body;
    const { Submission, Requirement } = req.models;

    const requirement = await Requirement.findById(requirementId).lean();
    if (!requirement || !requirement.activo) {
        res.status(404);
        throw new Error('Pedido de documentación no encontrado.');
    }

    const { recipientId, catIds, includeGlobal } = await resolveRequirementRecipient(req, res, atletaIdBody);

    const applies =
        (requirement.alcance === 'usuario' && String(requirement.targetUsuario) === String(recipientId)) ||
        (includeGlobal && requirement.alcance === 'global') ||
        (requirement.alcance === 'categoria' &&
            catIds.some((id) => String(id) === String(requirement.targetCategoria)));

    if (!applies) {
        res.status(403);
        throw new Error('Este pedido no aplica a tu usuario.');
    }

    // Si ya existía uno rechazado, lo actualizamos. Si no, creamos uno nuevo.
    const submission = await Submission.findOneAndUpdate(
        { requerimiento: requirementId, atleta: recipientId },
        { fileUrl, estado: 'revision', motivoRechazo: '' },
        { upsert: true, new: true }
    );

    if (requirement.creadoPor) {
        try {
            const { Notification, User } = req.models;
            const atleta = await User.findById(recipientId).select('nombre apellido').lean();
            const nombreAtleta = atleta
                ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim()
                : 'Un atleta';
            await createAppNotification(req.models, {
                usuario: requirement.creadoPor,
                tipo: 'documentacion_entregada',
                titulo: 'Documento enviado',
                mensaje: `${nombreAtleta} subió "${requirement.titulo}" y está pendiente de revisión.`,
                referencia: submission._id,
            });
        } catch (e) {
            console.log('Error notificación documentación entregada:', e.message);
        }
    }

    res.status(200).json(submission);
});

async function assertStaffCanReviewSubmission(req, submission) {
    const { Requirement, Enrollment, Category } = req.models;
    const staffRoles = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
    const isAdmin = ['admin_club', 'administrativo'].includes(req.user.rol);

    const requirement = await Requirement.findById(submission.requerimiento).lean();
    if (!requirement) {
        res.status(404);
        throw new Error('Requerimiento no encontrado.');
    }

    if (isAdmin) return requirement;

    if (!staffRoles.includes(req.user.rol)) {
        res.status(403);
        throw new Error('No autorizado.');
    }

    const catIds = await getStaffCategoryIds(req.user._id, req.user.rol, Category);
    const enrolled = await Enrollment.findOne({
        atleta: submission.atleta,
        categoria: { $in: catIds },
        estado: 'activo',
    }).lean();
    if (!enrolled) {
        res.status(403);
        throw new Error('No tenés permiso para revisar esta entrega.');
    }

    const applies =
        requirement.alcance === 'global' ||
        (requirement.alcance === 'categoria' &&
            catIds.some((id) => String(id) === String(requirement.targetCategoria))) ||
        (requirement.alcance === 'usuario' &&
            String(requirement.targetUsuario) === String(submission.atleta));

    if (!applies) {
        res.status(403);
        throw new Error('No tenés permiso para revisar esta entrega.');
    }

    if (requirement.creadoPor && String(requirement.creadoPor) !== String(req.user._id)) {
        res.status(403);
        throw new Error('Solo quien solicitó el documento o un administrador puede aprobarlo o rechazarlo.');
    }

    return requirement;
}

// @desc    Revisar documento (aprobar / rechazar)
// @route   PATCH /api/requirements/submissions/:id/review
const reviewSubmission = asyncHandler(async (req, res) => {
    const { estado, motivoRechazo } = req.body;
    const { Submission } = req.models;

    if (!['aprobado', 'rechazado'].includes(estado)) {
        res.status(400);
        throw new Error('Estado inválido. Usá aprobado o rechazado.');
    }
    if (estado === 'rechazado' && !(motivoRechazo || '').trim()) {
        res.status(400);
        throw new Error('Indicá el motivo del rechazo.');
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
        res.status(404);
        throw new Error('Entrega no encontrada');
    }

    await assertStaffCanReviewSubmission(req, submission);

    submission.estado = estado;
    submission.motivoRechazo = estado === 'rechazado' ? String(motivoRechazo).trim() : '';
    submission.revisadoPor = req.user._id;
    submission.fechaRevision = Date.now();

    await submission.save();

    const updated = await Submission.findById(submission._id)
        .populate('atleta', 'nombre apellido')
        .populate('requerimiento', 'titulo descripcion alcance targetCategoria fechaVencimiento obligatorio creadoPor')
        .lean();

    res.json(updated);
});

// @desc    Requerimientos de documentos que aplican al usuario + su última entrega
// @route   GET /api/requirements/me
async function resolveRequirementRecipient(req, res, atletaIdOverride) {
    const { User, Enrollment } = req.models;

    if (req.user.rol === 'atleta') {
        const inscripciones = await Enrollment.find({ atleta: req.user._id, estado: 'activo' });
        return {
            recipientId: req.user._id,
            catIds: inscripciones.map((i) => i.categoria),
            includeGlobal: true,
        };
    }

    if (req.user.rol === 'tutor') {
        const q = atletaIdOverride || req.query.atletaId;
        if (q) {
            const hijo = await User.findById(q).select('tutorPrincipal rol').lean();
            if (!hijo || hijo.rol !== 'atleta') {
                res.status(400);
                throw new Error('Atleta no válido.');
            }
            if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
                res.status(403);
                throw new Error('No tenés permiso para ver documentos de este atleta.');
            }
            const inscripciones = await Enrollment.find({ atleta: q, estado: 'activo' });
            return {
                recipientId: q,
                catIds: inscripciones.map((i) => i.categoria),
                includeGlobal: true,
            };
        }
        return { recipientId: req.user._id, catIds: [], includeGlobal: false };
    }

    const memberRoles = [
        'profe',
        'preparador_fisico',
        'nutricionista',
        'psicologo',
        'administrativo',
        'admin_club',
        'tutor',
    ];
    if (memberRoles.includes(req.user.rol)) {
        return { recipientId: req.user._id, catIds: [], includeGlobal: false };
    }

    res.status(403);
    throw new Error('No autorizado.');
}

const getMyRequirements = asyncHandler(async (req, res) => {
    const { Requirement, Submission } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });
    const { recipientId, catIds, includeGlobal } = await resolveRequirementRecipient(req, res);

    const orConditions = [{ alcance: 'usuario', targetUsuario: recipientId }];
    if (includeGlobal) {
        orConditions.push({ alcance: 'global' });
    }
    if (catIds.length) {
        orConditions.push({ alcance: 'categoria', targetCategoria: { $in: catIds } });
    }

    const filter = {
        activo: true,
        $or: orConditions,
    };

    const total = await Requirement.countDocuments(filter);
    const reqs = await Requirement.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const reqIds = reqs.map((r) => r._id);
    const subs = await Submission.find({
        atleta: recipientId,
        requerimiento: { $in: reqIds },
    }).lean();
    const subByReq = new Map(subs.map((s) => [String(s.requerimiento), s]));

    const requirements = reqs.map((r) => ({
        ...r,
        miEntrega: subByReq.get(String(r._id)) || null,
    }));

    res.json({
        requirements,
        ...paginationMeta(page, limit, total),
    });
});

async function getStaffCategoryIds(userId, rol, Category) {
    let query;
    if (rol === 'profe') query = { profesores: userId };
    else if (rol === 'preparador_fisico') query = { preparadoresFisicos: userId };
    else if (rol === 'nutricionista') query = { nutricionistas: userId };
    else if (rol === 'psicologo') query = { psicologos: userId };
    else return [];

    const cats = await Category.find(query).select('_id').lean();
    return cats.map((c) => c._id);
}

// @desc    Entregas de documentación de atletas del equipo del staff
// @route   GET /api/requirements/submissions
async function atletaIdsForCategoryScope(models, { categoriaId, disciplinaId }) {
    const { Enrollment, Category } = models;

    if (categoriaId) {
        if (disciplinaId) {
            const cat = await Category.findById(categoriaId).select('disciplina').lean();
            if (!cat || String(cat.disciplina) !== String(disciplinaId)) {
                return [];
            }
        }
        const enrollments = await Enrollment.find({ categoria: categoriaId, estado: 'activo' })
            .select('atleta')
            .lean();
        return [...new Set(enrollments.map((e) => e.atleta))];
    }

    if (disciplinaId) {
        const cats = await Category.find({ disciplina: disciplinaId }).select('_id').lean();
        const catIds = cats.map((c) => c._id);
        if (!catIds.length) {
            return [];
        }
        const enrollments = await Enrollment.find({ categoria: { $in: catIds }, estado: 'activo' })
            .select('atleta')
            .lean();
        return [...new Set(enrollments.map((e) => e.atleta))];
    }

    return null;
}

const getStaffSubmissions = asyncHandler(async (req, res) => {
    const { Requirement, Enrollment, Submission, Category } = req.models;
    const { categoriaId, estado, disciplinaId } = req.query;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });

    const staffRoles = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
    const isAdmin = ['admin_club', 'administrativo'].includes(req.user.rol);

    const respondSubmissions = async (subFilter) => {
        const total = await Submission.countDocuments(subFilter);
        const submissions = await Submission.find(subFilter)
            .populate('atleta', 'nombre apellido')
            .populate('requerimiento', 'titulo descripcion alcance targetCategoria fechaVencimiento obligatorio creadoPor')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.json({
            submissions: sortPaymentsByAtleta(submissions),
            ...paginationMeta(page, limit, total),
        });
    };

    let catIds = [];
    let atletaIds = [];

    if (isAdmin) {
        const reqIds = (await Requirement.find({ activo: true }).select('_id').lean()).map((r) => r._id);
        if (!reqIds.length) {
            return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
        }

        const subFilter = { requerimiento: { $in: reqIds } };

        if (categoriaId || disciplinaId) {
            const catAtletaIds = await atletaIdsForCategoryScope(req.models, { categoriaId, disciplinaId });
            if (!catAtletaIds.length) {
                return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
            }
            subFilter.atleta = { $in: catAtletaIds };
        }

        if (estado && ['pendiente', 'revision', 'aprobado', 'rechazado'].includes(estado)) {
            subFilter.estado = estado;
        }

        return respondSubmissions(subFilter);
    }

    if (staffRoles.includes(req.user.rol)) {
        catIds = await getStaffCategoryIds(req.user._id, req.user.rol, Category);
        if (!catIds.length) {
            return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
        }

        if (disciplinaId) {
            const discCats = await Category.find({ disciplina: disciplinaId, _id: { $in: catIds } })
                .select('_id')
                .lean();
            catIds = discCats.map((c) => c._id);
            if (!catIds.length) {
                return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
            }
        }

        const enrollmentFilter = { categoria: { $in: catIds }, estado: 'activo' };
        if (categoriaId) {
            const allowed = catIds.some((id) => String(id) === String(categoriaId));
            if (!allowed) {
                res.status(403);
                throw new Error('No tenés acceso a esta categoría.');
            }
            if (disciplinaId) {
                const cat = await Category.findById(categoriaId).select('disciplina').lean();
                if (!cat || String(cat.disciplina) !== String(disciplinaId)) {
                    res.status(403);
                    throw new Error('La categoría no pertenece a esa disciplina.');
                }
            }
            enrollmentFilter.categoria = categoriaId;
        }
        const enrollments = await Enrollment.find(enrollmentFilter).select('atleta').lean();
        atletaIds = [...new Set(enrollments.map((e) => e.atleta))];
    } else {
        res.status(403);
        throw new Error('No autorizado.');
    }

    if (!atletaIds.length) {
        return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
    }

    const reqFilter = {
        activo: true,
        $or: [
            { alcance: 'global' },
            { alcance: 'categoria', targetCategoria: { $in: catIds } },
            { alcance: 'usuario', targetUsuario: { $in: atletaIds } },
        ],
    };

    if (!isAdmin && staffRoles.includes(req.user.rol)) {
        reqFilter.creadoPor = req.user._id;
    }

    const reqs = await Requirement.find(reqFilter).select('_id').lean();
    const reqIds = reqs.map((r) => r._id);
    if (!reqIds.length) {
        return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
    }

    const subFilter = {
        atleta: { $in: atletaIds },
        requerimiento: { $in: reqIds },
    };
    if (estado && ['pendiente', 'revision', 'aprobado', 'rechazado'].includes(estado)) {
        subFilter.estado = estado;
    }

    return respondSubmissions(subFilter);
});

export { createRequirement, submitDocument, reviewSubmission, getMyRequirements, getStaffSubmissions };