import asyncHandler from 'express-async-handler';
import { v2 as cloudinary } from 'cloudinary';
import { hijosDelTutorFilter } from '../utils/userQuery.js';
import {
    buildNewsFeedOrConditions,
    buildStaffMuroListFilter,
} from '../services/notificationFeed.service.js';

const ADMIN_NEWS_VIEW = ['admin_club', 'administrativo'];
const STAFF_NEWS_AUTHOR_ROLES = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];

async function assertProfeNewsScope(req) {
    const { Category, Enrollment } = req.models;
    const { alcance, targetCategorias = [], targetUsuarios = [] } = req.body;

    const misCats = await Category.find({ profesores: req.user._id }).select('_id');
    const coachCatIds = misCats.map((c) => c._id);

    if (alcance === 'categoria') {
        const ids = Array.isArray(targetCategorias) ? targetCategorias : [];
        if (ids.length === 0) {
            res.status(400);
            throw new Error('Elegí al menos una de tus categorías.');
        }
        const allowed = new Set(coachCatIds.map((id) => id.toString()));
        for (const cid of ids) {
            if (!allowed.has(String(cid))) {
                res.status(403);
                throw new Error('No podés dirigir comunicaciones a categorías que no entrenás.');
            }
        }
        return;
    }

    if (alcance === 'usuario') {
        const ids = Array.isArray(targetUsuarios) ? targetUsuarios : [];
        if (ids.length === 0) {
            res.status(400);
            throw new Error('Elegí al menos un atleta.');
        }
        if (coachCatIds.length === 0) {
            res.status(403);
            throw new Error('No tenés categorías asignadas.');
        }
        for (const uid of ids) {
            const ok = await Enrollment.findOne({
                atleta: uid,
                categoria: { $in: coachCatIds },
                estado: 'activo',
            });
            if (!ok) {
                res.status(403);
                throw new Error('Solo podés enviar mensajes directos a atletas de tus categorías.');
            }
        }
    }
}

function staffCategoriesQuery(rol, userId) {
    if (rol === 'preparador_fisico') return { preparadoresFisicos: userId };
    if (rol === 'nutricionista') return { nutricionistas: userId };
    if (rol === 'psicologo') return { psicologos: userId };
    return { profesores: userId };
}

async function assertStaffTutorNewsScope(req, tutorIds) {
    const { Category, Enrollment, User } = req.models;
    const rol = req.user?.rol;
    if (!STAFF_NEWS_AUTHOR_ROLES.includes(rol)) {
        res.status(403);
        throw new Error('No autorizado.');
    }

    const ids = Array.isArray(tutorIds) ? tutorIds : [];
    if (!ids.length) {
        res.status(400);
        throw new Error('Elegí al menos un tutor.');
    }

    const cats = await Category.find(staffCategoriesQuery(rol, req.user._id)).select('_id').lean();
    if (!cats.length) {
        res.status(403);
        throw new Error('No tenés equipos asignados.');
    }

    const catIds = cats.map((c) => c._id);
    const enrollments = await Enrollment.find({
        categoria: { $in: catIds },
        estado: 'activo',
    })
        .populate('atleta', 'tutorPrincipal')
        .lean();

    const allowedTutorIds = new Set(
        enrollments
            .map((e) => e?.atleta?.tutorPrincipal)
            .filter(Boolean)
            .map((t) => String(t)),
    );

    const requested = [...new Set(ids.map((t) => String(t)).filter(Boolean))];
    for (const tid of requested) {
        if (!allowedTutorIds.has(String(tid))) {
            res.status(403);
            throw new Error('Solo podés enviar a tutores de atletas de tus equipos.');
        }
    }

    const countTutors = await User.countDocuments({ _id: { $in: requested }, rol: 'tutor' });
    if (countTutors !== requested.length) {
        res.status(400);
        throw new Error('Solo podés dirigir comunicados a usuarios con rol tutor.');
    }
}

// @desc    Crear una nueva noticia/aviso
// @route   POST /api/news
const createNews = asyncHandler(async (req, res) => {
    const { titulo, contenido, tipo, alcance, targetRoles, targetCategorias, targetUsuarios, imagen } = req.body;
    const { News } = req.models;

    if (req.user.rol !== 'admin_club' && alcance === 'global') {
        res.status(403);
        throw new Error('Solo los administradores pueden enviar comunicados globales.');
    }

    if (req.user.rol === 'profe') {
        if (!['categoria', 'usuario'].includes(alcance)) {
            res.status(400);
            throw new Error(
                'Como profesor solo podés enviar comunicaciones a tus categorías o a atletas puntuales.'
            );
        }
        await assertProfeNewsScope(req);
    }

    if (alcance === 'rol') {
        if (!ADMIN_NEWS_VIEW.includes(req.user.rol)) {
            res.status(403);
            throw new Error('No tenés permiso para enviar comunicados por rol.');
        }
        if (!Array.isArray(targetRoles) || targetRoles.length === 0) {
            res.status(400);
            throw new Error('Elegí al menos un rol destinatario.');
        }
    }

    const tutorIds = Array.isArray(targetUsuarios) ? targetUsuarios : [];

    if (alcance === 'tutor' && ADMIN_NEWS_VIEW.includes(req.user.rol)) {
        if (tutorIds.length === 0) {
            res.status(400);
            throw new Error('Elegí al menos un tutor.');
        }
        const { User } = req.models;
        const count = await User.countDocuments({ _id: { $in: tutorIds }, rol: 'tutor' });
        if (count !== tutorIds.length) {
            res.status(400);
            throw new Error('Solo podés dirigir comunicados a usuarios con rol tutor.');
        }
    } else if (alcance === 'tutor' && STAFF_NEWS_AUTHOR_ROLES.includes(req.user.rol)) {
        await assertStaffTutorNewsScope(req, tutorIds);
    } else if (alcance === 'tutor') {
        res.status(403);
        throw new Error('No tenés permiso para enviar comunicados a tutores.');
    }

    const newsData = {
        titulo,
        contenido,
        autor: req.user._id,
        tipo: tipo || 'general',
        alcance,
        origen: 'muro',
        targetRoles: req.user.rol === 'profe' ? [] : (Array.isArray(targetRoles) ? targetRoles : []),
        targetCategorias: Array.isArray(targetCategorias) ? targetCategorias : [],
        targetUsuarios: alcance === 'tutor' ? tutorIds : (Array.isArray(targetUsuarios) ? targetUsuarios : []),
    };
    if (imagen && imagen.url) {
        newsData.imagen = { url: imagen.url, publicId: imagen.publicId };
    }

    const news = await News.create(newsData);
    await news.populate('autor', 'nombre apellido rol fotoPerfil');
    res.status(201).json(news);
});

// @desc    Obtener el muro de noticias personalizado para el usuario logueado
// @route   GET /api/news/feed
const getMyNewsFeed = asyncHandler(async (req, res) => {
    const { News } = req.models;

    // Solo el muro (publicados desde Noticias). Avisos de sistema → notificaciones.
    const SISTEMA_TITULOS_LEGACY = [
        'Tu asistencia',
        'Asistencia de la sesión',
        'Parte Médico Actualizado',
        'Nueva consulta de nutrición',
        'Nueva consulta de psicología',
    ];
    await News.updateMany(
        { titulo: { $in: SISTEMA_TITULOS_LEGACY }, origen: { $ne: 'sistema' } },
        { $set: { origen: 'sistema' } },
    );

    const feedFilter = await buildNewsFeedOrConditions(req.user, req.models);
    const feed = await News.find(feedFilter)
        .sort({ createdAt: -1 })
        .populate('autor', 'nombre apellido rol fotoPerfil')
        .limit(40);

    // Defensa: una noticia multi-categoría no debe aparecer duplicada.
    const seen = new Set();
    const unique = [];
    for (const item of feed) {
        const id = String(item._id);
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(item);
    }

    res.json(unique);
});

const STAFF_AUTHOR_NEWS_VIEW = ['profe', 'nutricionista', 'psicologo', 'preparador_fisico'];

// @desc    Listado admin (todas) o staff (muro visible + propias, sin duplicar)
// @route   GET /api/news
const getAllNews = asyncHandler(async (req, res) => {
    const { News } = req.models;
    const rol = req.user?.rol;

    let query = { origen: { $ne: 'sistema' } };
    if (!ADMIN_NEWS_VIEW.includes(rol)) {
        if (STAFF_AUTHOR_NEWS_VIEW.includes(rol)) {
            query = await buildStaffMuroListFilter(req.user, req.models);
        } else {
            res.status(403);
            throw new Error('No tenés permiso para este listado de noticias.');
        }
    }

    const news = await News.find(query)
        .sort({ createdAt: -1 })
        .populate('autor', 'nombre apellido rol fotoPerfil');

    const seen = new Set();
    const unique = [];
    for (const item of news) {
        const id = String(item._id);
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(item);
    }

    res.json(unique);
});

// @desc    Editar una noticia
// @route   PUT /api/news/:id
const updateNews = asyncHandler(async (req, res) => {
    const { News } = req.models;
    const noticia = await News.findById(req.params.id);

    if (!noticia) {
        res.status(404);
        throw new Error('Noticia no encontrada');
    }

    // Solo el autor original o el admin pueden editar
    if (noticia.autor.toString() !== req.user._id.toString() && req.user.rol !== 'admin_club') {
        res.status(403);
        throw new Error('No tenés permiso para editar esta noticia');
    }

    noticia.titulo = req.body.titulo || noticia.titulo;
    noticia.contenido = req.body.contenido || noticia.contenido;
    noticia.tipo = req.body.tipo || noticia.tipo;

    const updatedNews = await noticia.save();
    res.json(updatedNews);
});

// @desc    Eliminar una noticia
// @route   DELETE /api/news/:id
const deleteNews = asyncHandler(async (req, res) => {
    const { News } = req.models;
    const noticia = await News.findById(req.params.id);

    if (!noticia) {
        res.status(404);
        throw new Error('Noticia no encontrada');
    }

    if (noticia.autor.toString() !== req.user._id.toString() && req.user.rol !== 'admin_club') {
        res.status(403);
        throw new Error('No tenés permiso para eliminar esta noticia');
    }

    // Si la noticia tiene imagen en Cloudinary, la borramos
    if (noticia.imagen && noticia.imagen.publicId) {
        try { await cloudinary.uploader.destroy(noticia.imagen.publicId); } catch(e) { console.log('Error borrando imagen de Cloudinary', e); }
    }

    await noticia.deleteOne();
    res.json({ message: 'Noticia eliminada correctamente' });
});

export { createNews, getMyNewsFeed, getAllNews, updateNews, deleteNews };