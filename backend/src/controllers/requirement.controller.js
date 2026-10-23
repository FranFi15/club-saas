import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { createAppNotification } from '../services/appNotification.service.js';
import {
    deliverRequirementToChat,
    countSuccessfulDeliveries,
} from '../services/deliveryToChat.service.js';
import { assertDeliveryTargets } from '../services/staffCategoryAccess.service.js';
import { sortPaymentsByAtleta, sortUsersByName } from '../utils/listSort.js';
import { parsePageLimit, paginationMeta } from '../utils/pagination.js';

const STAFF_DOC_ROLES = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
const ADMIN_DOC_ROLES = ['admin_club', 'administrativo', 'dirigente'];
const MUTATE_DOC_ROLES = ['admin_club', 'administrativo', ...STAFF_DOC_ROLES];

function isDocAdmin(user) {
    return ADMIN_DOC_ROLES.includes(user?.rol) || ['admin_club', 'administrativo'].includes(user?.rol);
}

function canMutateDoc(user) {
    return MUTATE_DOC_ROLES.includes(user?.rol);
}

async function assertFolderAccess(req, folder, { write = false } = {}) {
    if (!folder) {
        const err = new Error('Carpeta no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (isDocAdmin(req.user)) return;
    if (!STAFF_DOC_ROLES.includes(req.user.rol)) {
        const err = new Error('No autorizado.');
        err.statusCode = 403;
        throw err;
    }
    if (String(folder.creadoPor) !== String(req.user._id)) {
        const err = new Error(write ? 'Solo podés modificar tus carpetas.' : 'No tenés acceso a esta carpeta.');
        err.statusCode = 403;
        throw err;
    }
}

async function assertRequirementAccess(req, requirement, { write = false } = {}) {
    if (!requirement || requirement.activo === false) {
        const err = new Error('Pedido no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (isDocAdmin(req.user)) return;
    if (!STAFF_DOC_ROLES.includes(req.user.rol)) {
        const err = new Error('No autorizado.');
        err.statusCode = 403;
        throw err;
    }
    if (String(requirement.creadoPor) !== String(req.user._id)) {
        const err = new Error(write ? 'Solo podés modificar tus pedidos.' : 'No tenés acceso a este pedido.');
        err.statusCode = 403;
        throw err;
    }
}

async function resolveOptionalCarpetaId(req, rawCarpeta) {
    const { RequirementFolder } = req.models;
    if (rawCarpeta === null || rawCarpeta === '' || rawCarpeta === undefined) {
        return null;
    }
    const id = String(rawCarpeta);
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('Carpeta inválida.');
        err.statusCode = 400;
        throw err;
    }
    const folder = await RequirementFolder.findById(id).lean();
    await assertFolderAccess(req, folder, { write: false });
    return folder._id;
}

async function hardDeleteRequirements(models, requirementIds) {
    const { Requirement, Submission } = models;
    const ids = (requirementIds || []).filter(Boolean);
    if (!ids.length) return { requirements: 0, submissions: 0 };
    const subRes = await Submission.deleteMany({ requerimiento: { $in: ids } });
    const reqRes = await Requirement.deleteMany({ _id: { $in: ids } });
    return {
        requirements: reqRes.deletedCount || 0,
        submissions: subRes.deletedCount || 0,
    };
}

// @desc    Crear un nuevo requerimiento de documentos
// @route   POST /api/requirements
const createRequirement = asyncHandler(async (req, res) => {
    const {
        titulo,
        descripcion,
        obligatorio,
        fechaVencimiento,
        alcance,
        targetCategoria,
        targetUsuario,
        archivoAdjuntoUrl,
        archivoAdjuntoNombre,
        carpeta,
    } = req.body;
    const { Requirement } = req.models;

    try {
        await assertDeliveryTargets(req, { allowGlobal: true });
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const adjuntoUrl = typeof archivoAdjuntoUrl === 'string' ? archivoAdjuntoUrl.trim() : '';
    const adjuntoNombre = typeof archivoAdjuntoNombre === 'string' ? archivoAdjuntoNombre.trim() : '';
    let carpetaId = null;
    try {
        carpetaId = await resolveOptionalCarpetaId(req, carpeta);
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
        archivoAdjuntoUrl: adjuntoUrl,
        archivoAdjuntoNombre: adjuntoNombre || (adjuntoUrl ? 'Archivo de referencia' : ''),
        carpeta: carpetaId,
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

/** Pedidos que el staff puede ver: los de sus categorías, no solo los que creó. */
async function staffVisibleRequirementFilter(req, { categoriaId } = {}) {
    const { Category, Enrollment } = req.models;
    let catIds = await getStaffCategoryIds(req.user._id, req.user.rol, Category);
    if (categoriaId && mongoose.Types.ObjectId.isValid(String(categoriaId))) {
        const allowed = catIds.some((id) => String(id) === String(categoriaId));
        if (!allowed) {
            const err = new Error('No tenés acceso a esta categoría.');
            err.statusCode = 403;
            throw err;
        }
        catIds = catIds.filter((id) => String(id) === String(categoriaId));
    }
    if (!catIds.length) return null;

    const enrollments = await Enrollment.find({ categoria: { $in: catIds }, estado: 'activo' })
        .select('atleta')
        .lean();
    const atletaIds = [...new Set(enrollments.map((e) => e.atleta))];
    const or = [
        { alcance: 'global' },
        { alcance: 'categoria', targetCategoria: { $in: catIds } },
    ];
    if (atletaIds.length) {
        or.push({ alcance: 'usuario', targetUsuario: { $in: atletaIds } });
    }
    return { activo: true, $or: or };
}

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

/** Pedidos de documentación visibles para filtros del staff/admin. */
const listStaffRequirements = asyncHandler(async (req, res) => {
    const { Requirement } = req.models;
    const isAdmin = ADMIN_DOC_ROLES.includes(req.user.rol);
    const { carpetaId, sinCarpeta, categoriaId } = req.query;
    let filter = { activo: true };

    if (!isAdmin) {
        if (!STAFF_DOC_ROLES.includes(req.user.rol)) {
            res.status(403);
            throw new Error('No autorizado.');
        }
        try {
            filter = await staffVisibleRequirementFilter(req, { categoriaId });
        } catch (e) {
            res.status(e.statusCode || 403);
            throw e;
        }
        if (!filter) {
            return res.json({ requirements: [] });
        }
    }

    if (sinCarpeta === '1' || sinCarpeta === 'true') {
        const unfiled = { $or: [{ carpeta: null }, { carpeta: { $exists: false } }] };
        filter = { $and: [filter, unfiled] };
    } else if (carpetaId && mongoose.Types.ObjectId.isValid(String(carpetaId))) {
        filter.carpeta = String(carpetaId);
    }

    const requirements = await Requirement.find(filter)
        .select('titulo alcance creadoPor createdAt fechaVencimiento carpeta')
        .populate('carpeta', 'nombre')
        .sort({ createdAt: -1 })
        .limit(300)
        .lean();

    res.json({ requirements });
});

// @desc    Listar carpetas de pedidos
// @route   GET /api/requirements/folders
const listRequirementFolders = asyncHandler(async (req, res) => {
    const { RequirementFolder, Requirement } = req.models;
    if (!canMutateDoc(req.user) && !ADMIN_DOC_ROLES.includes(req.user.rol)) {
        res.status(403);
        throw new Error('No autorizado.');
    }

    if (!isDocAdmin(req.user)) {
        if (!STAFF_DOC_ROLES.includes(req.user.rol)) {
            res.status(403);
            throw new Error('No autorizado.');
        }
        let scope;
        try {
            scope = await staffVisibleRequirementFilter(req, { categoriaId: req.query.categoriaId });
        } catch (e) {
            res.status(e.statusCode || 403);
            throw e;
        }
        if (!scope) {
            return res.json({ folders: [], sinCarpetaCount: 0 });
        }
        const scopedReqs = await Requirement.find(scope).select('carpeta').lean();
        const countMap = new Map();
        let sinCarpetaCount = 0;
        const folderIds = [];
        scopedReqs.forEach((row) => {
            if (!row.carpeta) {
                sinCarpetaCount += 1;
                return;
            }
            const id = String(row.carpeta);
            countMap.set(id, (countMap.get(id) || 0) + 1);
            folderIds.push(row.carpeta);
        });
        const folders = await RequirementFolder.find({
            $or: [{ creadoPor: req.user._id }, { _id: { $in: folderIds } }],
        })
            .sort({ nombre: 1 })
            .lean();
        const visible = folders.filter((folder) => {
            const count = countMap.get(String(folder._id)) || 0;
            return count > 0 || String(folder.creadoPor) === String(req.user._id);
        });
        return res.json({
            folders: visible.map((folder) => ({
                ...folder,
                pedidosCount: countMap.get(String(folder._id)) || 0,
            })),
            sinCarpetaCount,
        });
    }

    const folders = await RequirementFolder.find({}).sort({ nombre: 1 }).lean();
    const folderIds = folders.map((f) => f._id);

    const reqFilter = { activo: true, carpeta: { $in: folderIds } };
    const counts = await Requirement.aggregate([
        { $match: reqFilter },
        { $group: { _id: '$carpeta', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    const unfiledFilter = {
        activo: true,
        $or: [{ carpeta: null }, { carpeta: { $exists: false } }],
    };
    const sinCarpetaCount = await Requirement.countDocuments(unfiledFilter);

    res.json({
        folders: folders.map((f) => ({
            ...f,
            pedidosCount: countMap.get(String(f._id)) || 0,
        })),
        sinCarpetaCount,
    });
});

// @desc    Crear carpeta
// @route   POST /api/requirements/folders
const createRequirementFolder = asyncHandler(async (req, res) => {
    const { RequirementFolder } = req.models;
    if (!canMutateDoc(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
        res.status(400);
        throw new Error('Indicá un nombre para la carpeta.');
    }
    const folder = await RequirementFolder.create({
        nombre,
        creadoPor: req.user._id,
    });
    res.status(201).json({ ...folder.toObject(), pedidosCount: 0 });
});

// @desc    Renombrar carpeta
// @route   PATCH /api/requirements/folders/:id
const updateRequirementFolder = asyncHandler(async (req, res) => {
    const { RequirementFolder } = req.models;
    if (!canMutateDoc(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const folder = await RequirementFolder.findById(req.params.id);
    try {
        await assertFolderAccess(req, folder, { write: true });
    } catch (e) {
        res.status(e.statusCode || 403);
        throw e;
    }
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
        res.status(400);
        throw new Error('Indicá un nombre para la carpeta.');
    }
    folder.nombre = nombre;
    await folder.save();
    res.json(folder);
});

// @desc    Eliminar carpeta + pedidos + entregas
// @route   DELETE /api/requirements/folders/:id
const deleteRequirementFolder = asyncHandler(async (req, res) => {
    const { RequirementFolder, Requirement } = req.models;
    if (!canMutateDoc(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const folder = await RequirementFolder.findById(req.params.id);
    try {
        await assertFolderAccess(req, folder, { write: true });
    } catch (e) {
        res.status(e.statusCode || 403);
        throw e;
    }

    const reqFilter = { carpeta: folder._id };
    if (!isDocAdmin(req.user)) {
        reqFilter.creadoPor = req.user._id;
    }
    const reqIds = (await Requirement.find(reqFilter).select('_id').lean()).map((r) => r._id);
    const deleted = await hardDeleteRequirements(req.models, reqIds);
    await RequirementFolder.deleteOne({ _id: folder._id });

    res.json({
        message: 'Carpeta eliminada.',
        deletedFolders: 1,
        deletedRequirements: deleted.requirements,
        deletedSubmissions: deleted.submissions,
    });
});

// @desc    Mover pedido de carpeta / actualizar carpeta
// @route   PATCH /api/requirements/:id
const updateRequirement = asyncHandler(async (req, res) => {
    const { Requirement } = req.models;
    if (!canMutateDoc(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const requirement = await Requirement.findById(req.params.id);
    try {
        await assertRequirementAccess(req, requirement, { write: true });
    } catch (e) {
        res.status(e.statusCode || 403);
        throw e;
    }

    if ('carpeta' in (req.body || {})) {
        try {
            requirement.carpeta = await resolveOptionalCarpetaId(req, req.body.carpeta);
        } catch (e) {
            res.status(e.statusCode || 400);
            throw e;
        }
    }

    await requirement.save();
    const full = await Requirement.findById(requirement._id).populate('carpeta', 'nombre').lean();
    res.json(full);
});

// @desc    Eliminar pedido + entregas
// @route   DELETE /api/requirements/:id
const deleteRequirement = asyncHandler(async (req, res) => {
    const { Requirement } = req.models;
    if (!canMutateDoc(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const requirement = await Requirement.findById(req.params.id).lean();
    try {
        await assertRequirementAccess(req, requirement, { write: true });
    } catch (e) {
        res.status(e.statusCode || 403);
        throw e;
    }

    const deleted = await hardDeleteRequirements(req.models, [requirement._id]);
    res.json({
        message: 'Pedido eliminado.',
        deletedRequirements: deleted.requirements,
        deletedSubmissions: deleted.submissions,
    });
});

const getStaffSubmissions = asyncHandler(async (req, res) => {
    const { Requirement, Enrollment, Submission, Category } = req.models;
    const { categoriaId, estado, disciplinaId, requerimientoId, carpetaId, sinCarpeta, atletaId } = req.query;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });

    const isAdmin = ['admin_club', 'administrativo'].includes(req.user.rol);
    const reqIdFilter =
        requerimientoId && mongoose.Types.ObjectId.isValid(String(requerimientoId))
            ? String(requerimientoId)
            : null;
    const carpetaFilter =
        carpetaId && mongoose.Types.ObjectId.isValid(String(carpetaId)) ? String(carpetaId) : null;
    const onlyUnfiled = sinCarpeta === '1' || sinCarpeta === 'true';
    const atletaFilter =
        atletaId && mongoose.Types.ObjectId.isValid(String(atletaId)) ? String(atletaId) : null;

    const respondSubmissions = async (subFilter) => {
        const total = await Submission.countDocuments(subFilter);
        const submissions = await Submission.find(subFilter)
            .populate('atleta', 'nombre apellido')
            .populate(
                'requerimiento',
                'titulo descripcion alcance targetCategoria fechaVencimiento obligatorio creadoPor archivoAdjuntoUrl archivoAdjuntoNombre carpeta',
            )
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.json({
            submissions: sortPaymentsByAtleta(submissions),
            ...paginationMeta(page, limit, total),
        });
    };

    const applyCarpetaToReqQuery = (reqQuery) => {
        if (onlyUnfiled) {
            const unfiled = { $or: [{ carpeta: null }, { carpeta: { $exists: false } }] };
            if (reqQuery.$or) {
                reqQuery.$and = [...(reqQuery.$and || []), { $or: reqQuery.$or }, unfiled];
                delete reqQuery.$or;
            } else {
                reqQuery.$and = [...(reqQuery.$and || []), unfiled];
            }
        } else if (carpetaFilter) {
            reqQuery.carpeta = carpetaFilter;
        }
    };

    let catIds = [];
    let atletaIds = [];

    if (isAdmin) {
        const reqQuery = { activo: true };
        if (reqIdFilter) reqQuery._id = reqIdFilter;
        applyCarpetaToReqQuery(reqQuery);
        const reqIds = (await Requirement.find(reqQuery).select('_id').lean()).map((r) => r._id);
        if (!reqIds.length) {
            return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
        }

        const subFilter = {
            requerimiento: reqIdFilter ? reqIdFilter : { $in: reqIds },
        };

        if (categoriaId || disciplinaId) {
            const catAtletaIds = await atletaIdsForCategoryScope(req.models, { categoriaId, disciplinaId });
            if (!catAtletaIds.length) {
                return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
            }
            subFilter.atleta = { $in: catAtletaIds };
        }

        if (atletaFilter) {
            const scoped = subFilter.atleta?.$in;
            if (scoped && !scoped.some((id) => String(id) === atletaFilter)) {
                return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
            }
            subFilter.atleta = atletaFilter;
        }

        if (estado && ['pendiente', 'revision', 'aprobado', 'rechazado'].includes(estado)) {
            subFilter.estado = estado;
        }

        return respondSubmissions(subFilter);
    }

    if (STAFF_DOC_ROLES.includes(req.user.rol)) {
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
        if (atletaFilter) {
            const allowed = atletaIds.some((id) => String(id) === atletaFilter);
            if (!allowed) {
                res.status(403);
                throw new Error('No tenés acceso a este atleta.');
            }
            atletaIds = [atletaFilter];
        }
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

    if (reqIdFilter) {
        reqFilter._id = reqIdFilter;
    }
    applyCarpetaToReqQuery(reqFilter);

    const reqs = await Requirement.find(reqFilter).select('_id').lean();
    const reqIds = reqs.map((r) => r._id);
    if (!reqIds.length) {
        return res.json({ submissions: [], ...paginationMeta(page, limit, 0) });
    }

    const subFilter = {
        atleta: { $in: atletaIds },
        requerimiento: reqIdFilter ? reqIdFilter : { $in: reqIds },
    };
    if (estado && ['pendiente', 'revision', 'aprobado', 'rechazado'].includes(estado)) {
        subFilter.estado = estado;
    }

    return respondSubmissions(subFilter);
});

export {
    createRequirement,
    submitDocument,
    reviewSubmission,
    getMyRequirements,
    getStaffSubmissions,
    listStaffRequirements,
    listRequirementFolders,
    createRequirementFolder,
    updateRequirementFolder,
    deleteRequirementFolder,
    updateRequirement,
    deleteRequirement,
};