import asyncHandler from 'express-async-handler';
import { isTutorOf } from '../utils/userQuery.js';
import mongoose from 'mongoose';
import { parsePageLimit, paginationMeta } from '../utils/pagination.js';
import {
    deliverResourceToChat,
    countSuccessfulDeliveries,
} from '../services/deliveryToChat.service.js';
import { assertDeliveryTargets, resolveTargetUsuarioIds } from '../services/staffCategoryAccess.service.js';

function parseYouTubeVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const raw = url.trim();
    try {
        const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const u = new URL(withProto);
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (host === 'youtu.be') {
            return u.pathname.replace(/^\//, '').split('/')[0] || null;
        }
        if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
            if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
            return u.searchParams.get('v');
        }
    } catch {
        /* ignore */
    }
    return null;
}

function normalizeResourceFileUrl(fileUrl) {
    if (!fileUrl || typeof fileUrl !== 'string') return null;
    const trimmed = fileUrl.trim();
    if (!trimmed) return null;

    const ytId = parseYouTubeVideoId(trimmed);
    if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;

    try {
        const u = new URL(trimmed);
        if (!['http:', 'https:'].includes(u.protocol)) return null;
        return u.toString();
    } catch {
        return null;
    }
}

// @desc    Subir un recurso y notificar automáticamente
// @route   POST /api/resources
const uploadResource = asyncHandler(async (req, res) => {
    const { titulo, descripcion, fileUrl, tipo, alcance, targetCategoria } = req.body;
    const { Resource } = req.models;

    try {
        await assertDeliveryTargets(req, { allowGlobal: false });
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const normalizedFileUrl = normalizeResourceFileUrl(fileUrl);
    if (!normalizedFileUrl) {
        res.status(400);
        throw new Error('URL de archivo inválida. Usá un enlace http(s) o un archivo subido.');
    }

    const basePayload = {
        titulo,
        descripcion,
        fileUrl: normalizedFileUrl,
        tipo,
        autor: req.user._id,
        alcance,
        targetCategoria: alcance === 'categoria' ? targetCategoria : undefined,
    };

    const created = [];
    let chatDelivered = 0;

    if (alcance === 'usuario') {
        const athleteIds = resolveTargetUsuarioIds(req.body);
        for (const athleteId of athleteIds) {
            const resource = await Resource.create({
                ...basePayload,
                targetUsuario: athleteId,
            });
            created.push(resource);
            try {
                const delivery = await deliverResourceToChat(req.models, req.user, resource);
                chatDelivered += countSuccessfulDeliveries(delivery);
            } catch (e) {
                console.warn('[resources] chat delivery:', e.message);
            }
        }
    } else {
        const resource = await Resource.create(basePayload);
        created.push(resource);
        try {
            const delivery = await deliverResourceToChat(req.models, req.user, resource);
            chatDelivered += countSuccessfulDeliveries(delivery);
        } catch (e) {
            console.warn('[resources] chat delivery:', e.message);
        }
    }

    const n = created.length;
    res.status(201).json({
        message:
            chatDelivered > 0
                ? n > 1
                    ? `Recurso enviado a ${n} atletas por chat.`
                    : 'Recurso subido y enviado por chat.'
                : n > 1
                  ? `Recurso creado para ${n} atletas. No se pudo enviar por chat; igual queda en Recursos.`
                  : 'Recurso subido. No se pudo enviar por chat; igual queda en Recursos.',
        resource: created[0],
        resources: created,
        chatDelivered,
    });
});

// @desc    Historial de recursos enviados (staff / admin)
// @route   GET /api/resources
const getSentResources = asyncHandler(async (req, res) => {
    const { Resource } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });

    const filter = req.user.rol === 'admin_club' ? {} : { autor: req.user._id };
    const tipos = ['rutina', 'nutricion', 'estudio_medico', 'tactico', 'stats', 'highlights', 'playbook', 'otro'];
    if (tipos.includes(req.query.tipo)) filter.tipo = req.query.tipo;

    const categoriaId = String(req.query.categoriaId || '');
    if (mongoose.Types.ObjectId.isValid(categoriaId)) {
        const { Enrollment } = req.models;
        const enrollments = await Enrollment.find({ categoria: categoriaId, estado: 'activo' })
            .select('atleta')
            .lean();
        const atletaIds = enrollments.map((row) => row.atleta).filter(Boolean);
        const destino = [{ alcance: 'categoria', targetCategoria: categoriaId }];
        if (atletaIds.length) destino.push({ alcance: 'usuario', targetUsuario: { $in: atletaIds } });
        filter.$or = destino;
    }

    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const text = { $or: [{ titulo: rx }, { descripcion: rx }] };
        if (filter.$or) {
            const destino = filter.$or;
            delete filter.$or;
            filter.$and = [{ $or: destino }, text];
        } else {
            Object.assign(filter, text);
        }
    }

    const total = await Resource.countDocuments(filter);
    const resources = await Resource.find(filter)
        .populate('autor', 'nombre apellido rol')
        .populate('targetCategoria', 'nombre')
        .populate('targetUsuario', 'nombre apellido')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const { ResourceAccess, Enrollment } = req.models;
    const ids = resources.map((r) => r._id);
    const accessCounts = ids.length
        ? await ResourceAccess.aggregate([
              { $match: { recurso: { $in: ids } } },
              {
                  $group: {
                      _id: '$recurso',
                      vieron: { $sum: { $cond: [{ $ne: ['$vistoAt', null] }, 1, 0] } },
                      descargaron: { $sum: { $cond: [{ $ne: ['$descargaAt', null] }, 1, 0] } },
                  },
              },
          ])
        : [];
    const countByResource = new Map(accessCounts.map((row) => [String(row._id), row]));

    const categoryIds = [
        ...new Set(
            resources
                .filter((r) => r.alcance === 'categoria' && r.targetCategoria)
                .map((r) => r.targetCategoria._id || r.targetCategoria),
        ),
    ];
    const enrollmentCounts = categoryIds.length
        ? await Enrollment.aggregate([
              { $match: { categoria: { $in: categoryIds }, estado: 'activo' } },
              { $group: { _id: '$categoria', total: { $sum: 1 } } },
          ])
        : [];
    const audienceByCategory = new Map(enrollmentCounts.map((row) => [String(row._id), row.total]));

    const withAudience = resources.map((resource) => {
        const counts = countByResource.get(String(resource._id)) || { vieron: 0, descargaron: 0 };
        const categoriaId = resource.targetCategoria?._id || resource.targetCategoria;
        const audiencia =
            resource.alcance === 'usuario'
                ? 1
                : audienceByCategory.get(String(categoriaId)) || 0;
        return {
            ...resource,
            vieron: counts.vieron,
            descargaron: counts.descargaron,
            audiencia,
        };
    });

    res.json({
        resources: withAudience,
        ...paginationMeta(page, limit, total),
    });
});

// @desc    Obtener mis recursos (Atleta)
// @route   GET /api/resources/me
async function resolveAtletaIdForMember(req, res) {
    const { User } = req.models;
    let atletaId = req.user._id;

    if (req.user.rol === 'tutor') {
        const q = req.query.atletaId;
        if (!q) {
            res.status(400);
            throw new Error('Indicá el atleta (atletaId).');
        }
        const hijo = await User.findById(q).select('tutorPrincipal tutores rol').lean();
        if (!hijo || hijo.rol !== 'atleta') {
            res.status(400);
            throw new Error('Atleta no válido.');
        }
        if (!isTutorOf(hijo, req.user._id)) {
            res.status(403);
            throw new Error('No tenés permiso para ver recursos de este atleta.');
        }
        atletaId = q;
    } else if (req.user.rol !== 'atleta') {
        res.status(403);
        throw new Error('No autorizado.');
    }

    return atletaId;
}

const getMyResources = asyncHandler(async (req, res) => {
    const { Resource, Enrollment } = req.models;
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 30, maxLimit: 100 });
    const userId = await resolveAtletaIdForMember(req, res);

    const inscripciones = await Enrollment.find({ atleta: userId, estado: 'activo' });
    const categoriasIds = inscripciones.map((i) => i.categoria);

    const clauses = [
        {
            $or: [
                { alcance: 'usuario', targetUsuario: userId },
                { alcance: 'categoria', targetCategoria: { $in: categoriasIds } },
            ],
        },
    ];
    const tipos = ['rutina', 'nutricion', 'estudio_medico', 'tactico', 'stats', 'highlights', 'playbook', 'otro'];
    if (tipos.includes(req.query.tipo)) clauses.push({ tipo: req.query.tipo });
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        clauses.push({ $or: [{ titulo: rx }, { descripcion: rx }] });
    }
    const filter = clauses.length === 1 ? clauses[0] : { $and: clauses };

    const total = await Resource.countDocuments(filter);
    const recursos = await Resource.find(filter)
        .populate('autor', 'nombre apellido rol')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    res.json({
        resources: recursos,
        ...paginationMeta(page, limit, total),
    });
});

// @desc    Editar un recurso (Ej: corregir el título o actualizar el PDF)
// @route   PUT /api/resources/:id
const updateResource = asyncHandler(async (req, res) => {
    const { Resource } = req.models;
    const recurso = await Resource.findById(req.params.id);

    if (!recurso) {
        res.status(404);
        throw new Error('Recurso no encontrado');
    }

    if (recurso.autor.toString() !== req.user._id.toString() && req.user.rol !== 'admin_club') {
        res.status(403);
        throw new Error('Solo el autor puede editar este recurso');
    }

    if (req.body.titulo !== undefined) recurso.titulo = String(req.body.titulo || '').trim() || recurso.titulo;
    if (req.body.descripcion !== undefined) recurso.descripcion = String(req.body.descripcion || '').trim();
    if (req.body.tipo) recurso.tipo = req.body.tipo;
    if (req.body.fileUrl) {
        const normalizedFileUrl = normalizeResourceFileUrl(req.body.fileUrl);
        if (!normalizedFileUrl) {
            res.status(400);
            throw new Error('URL de archivo inválida. Usá un enlace http(s) o un archivo subido.');
        }
        recurso.fileUrl = normalizedFileUrl;
    }

    const updatedResource = await recurso.save();
    res.json(updatedResource);
});

// @desc    Eliminar un recurso
// @route   DELETE /api/resources/:id
const deleteResource = asyncHandler(async (req, res) => {
    const { Resource } = req.models;
    const recurso = await Resource.findById(req.params.id);

    if (!recurso) {
        res.status(404);
        throw new Error('Recurso no encontrado');
    }

    if (recurso.autor.toString() !== req.user._id.toString() && req.user.rol !== 'admin_club') {
        res.status(403);
        throw new Error('Solo el autor puede eliminar este recurso');
    }

    await recurso.deleteOne();
    res.json({ message: 'Recurso eliminado correctamente' });
});

async function athleteCanSeeResource(models, atletaId, resource) {
    if (!resource) return false;
    if (resource.alcance === 'usuario') {
        return String(resource.targetUsuario) === String(atletaId);
    }
    if (resource.alcance !== 'categoria' || !resource.targetCategoria) return false;
    const { Enrollment } = models;
    const enrollment = await Enrollment.findOne({
        atleta: atletaId,
        categoria: resource.targetCategoria,
        estado: 'activo',
    })
        .select('_id')
        .lean();
    return !!enrollment;
}

// @desc    El atleta marca que vio o descargó un material
// @route   POST /api/resources/:id/acceso
const recordResourceAccess = asyncHandler(async (req, res) => {
    const { Resource, ResourceAccess } = req.models;
    const accion = req.body?.accion === 'descarga' ? 'descarga' : req.body?.accion === 'visto' ? 'visto' : null;
    if (!accion) {
        res.status(400);
        throw new Error('Indicá si lo vio o lo descargó.');
    }

    const atletaId = await resolveAtletaIdForMember(req, res);
    const resource = await Resource.findById(req.params.id)
        .select('alcance targetCategoria targetUsuario')
        .lean();
    if (!resource) {
        res.status(404);
        throw new Error('Recurso no encontrado');
    }
    if (!(await athleteCanSeeResource(req.models, atletaId, resource))) {
        res.status(403);
        throw new Error('No tenés acceso a este material.');
    }

    const now = new Date();
    const existing = await ResourceAccess.findOne({ recurso: resource._id, usuario: atletaId });
    if (!existing) {
        await ResourceAccess.create({
            recurso: resource._id,
            usuario: atletaId,
            vistoAt: now,
            descargaAt: accion === 'descarga' ? now : null,
        });
    } else {
        if (!existing.vistoAt) existing.vistoAt = now;
        if (accion === 'descarga') existing.descargaAt = now;
        await existing.save();
    }
    res.json({ ok: true });
});

// @desc    Quién de la categoría vio o descargó el material
// @route   GET /api/resources/:id/accesos
const listResourceAudience = asyncHandler(async (req, res) => {
    const { Resource, ResourceAccess, Enrollment, User } = req.models;
    const resource = await Resource.findById(req.params.id).lean();
    if (!resource) {
        res.status(404);
        throw new Error('Recurso no encontrado');
    }
    if (String(resource.autor) !== String(req.user._id) && req.user.rol !== 'admin_club') {
        res.status(403);
        throw new Error('Solo quien lo envió puede ver quién lo abrió.');
    }

    let people = [];
    if (resource.alcance === 'categoria' && resource.targetCategoria) {
        const enrollments = await Enrollment.find({
            categoria: resource.targetCategoria,
            estado: 'activo',
        })
            .populate('atleta', 'nombre apellido')
            .lean();
        people = enrollments.map((row) => row.atleta).filter(Boolean);
    } else if (resource.targetUsuario) {
        const user = await User.findById(resource.targetUsuario).select('nombre apellido').lean();
        if (user) people = [user];
    }

    const accesses = people.length
        ? await ResourceAccess.find({
              recurso: resource._id,
              usuario: { $in: people.map((person) => person._id) },
          }).lean()
        : [];
    const byUser = new Map(accesses.map((row) => [String(row.usuario), row]));
    const audiencia = people
        .map((person) => {
            const access = byUser.get(String(person._id));
            return {
                _id: person._id,
                nombre: person.nombre,
                apellido: person.apellido,
                vistoAt: access?.vistoAt || null,
                descargaAt: access?.descargaAt || null,
            };
        })
        .sort((a, b) =>
            `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(`${b.apellido || ''} ${b.nombre || ''}`, 'es'),
        );

    res.json({
        titulo: resource.titulo,
        alcance: resource.alcance,
        total: audiencia.length,
        vieron: audiencia.filter((row) => row.vistoAt).length,
        descargaron: audiencia.filter((row) => row.descargaAt).length,
        audiencia,
    });
});

export {
    uploadResource,
    getSentResources,
    getMyResources,
    updateResource,
    deleteResource,
    recordResourceAccess,
    listResourceAudience,
};