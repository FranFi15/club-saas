import asyncHandler from 'express-async-handler';

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
    const { titulo, descripcion, fileUrl, tipo, alcance, targetCategoria, targetUsuario } = req.body;
    const { Resource, News } = req.models;

    const normalizedFileUrl = normalizeResourceFileUrl(fileUrl);
    if (!normalizedFileUrl) {
        res.status(400);
        throw new Error('URL de archivo inválida. Usá un enlace http(s) o de YouTube.');
    }

    // 1. Creamos el Recurso (el archivo persistente)
    const resource = await Resource.create({
        titulo,
        descripcion,
        fileUrl: normalizedFileUrl,
        tipo,
        autor: req.user._id,
        alcance,
        targetCategoria,
        targetUsuario
    });

    // 2. MAGIA: Creamos la noticia automática para que al usuario le "vibre" el celu
    const mensajeNoticia = `${req.user.nombre} (${req.user.rol}) ha subido un nuevo recurso de ${tipo}: "${titulo}"`;
    
    await News.create({
        titulo: 'Nuevo Recurso Disponible',
        contenido: mensajeNoticia,
        autor: req.user._id,
        tipo: 'deportivo',
        alcance,
        targetRoles: [],
        targetCategorias: targetCategoria ? [targetCategoria] : [],
        targetUsuarios: targetUsuario ? [targetUsuario] : [],
    });

    res.status(201).json({
        message: 'Recurso subido y atletas notificados',
        resource
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
        const hijo = await User.findById(q).select('tutorPrincipal rol').lean();
        if (!hijo || hijo.rol !== 'atleta') {
            res.status(400);
            throw new Error('Atleta no válido.');
        }
        if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
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
    const userId = await resolveAtletaIdForMember(req, res);

    // Buscamos categorías del atleta
    const inscripciones = await Enrollment.find({ atleta: userId, estado: 'activo' });
    const categoriasIds = inscripciones.map(i => i.categoria);

    const recursos = await Resource.find({
        $or: [
            { alcance: 'usuario', targetUsuario: userId },
            { alcance: 'categoria', targetCategoria: { $in: categoriasIds } },
        ],
    })
        .populate('autor', 'nombre apellido rol')
        .sort({ createdAt: -1 });

    res.json(recursos);
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

    recurso.titulo = req.body.titulo || recurso.titulo;
    recurso.descripcion = req.body.descripcion || recurso.descripcion;
    if (req.body.fileUrl) {
        const normalizedFileUrl = normalizeResourceFileUrl(req.body.fileUrl);
        if (!normalizedFileUrl) {
            res.status(400);
            throw new Error('URL de archivo inválida. Usá un enlace http(s) o de YouTube.');
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

export { uploadResource, getMyResources, updateResource, deleteResource };