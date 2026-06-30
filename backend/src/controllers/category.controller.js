import asyncHandler from 'express-async-handler';
import { sortByField, compareUserByName } from '../utils/listSort.js';
import { parsePageLimit, paginationMeta } from '../utils/pagination.js';
import {
    getCategoryRosterContext,
    syncCategoryAthletes,
    delegateCategoryRosterToCoach,
    listRosterPendingForCoach,
} from '../services/categoryRoster.service.js';
import { getCoachCategoryAlertCounts } from '../services/coachCategoryAlerts.service.js';

// @desc    Crear nueva categoría dentro de una disciplina
// @route   POST /api/categories
const createCategory = asyncHandler(async (req, res) => {
    const { nombre, disciplina, profesores, descripcion, edadMinima, edadMaxima, planDefault, sexo } = req.body;
    
    const { Category } = req.models;

    const category = await Category.create({
        nombre,
        disciplina,
        profesores: profesores || [],
        descripcion,
        edadMinima,
        edadMaxima,
        sexo: sexo === 'M' || sexo === 'F' ? sexo : 'ambos',
        planDefault: planDefault || undefined
    });

    res.status(201).json(category);
});

// @desc    Obtener categorías por disciplina
// @route   GET /api/categories/disciplina/:disciplineId
const getCategoriesByDiscipline = asyncHandler(async (req, res) => {
    const { Category } = req.models;
    
    const categories = await Category.find({ disciplina: req.params.disciplineId })
        .populate('profesores', 'nombre apellido fotoPerfil')
        .populate('preparadoresFisicos', 'nombre apellido fotoPerfil')
        .populate('nutricionistas', 'nombre apellido fotoPerfil')
        .populate('psicologos', 'nombre apellido fotoPerfil')
        .populate('planDefault', 'nombre monto')
        .sort({ nombre: 1 })
        .lean();
    
    res.json(sortByField(categories));
});

// @desc    Obtener todas las categorías del club
// @route   GET /api/categories
const getAllCategories = asyncHandler(async (req, res) => {
    const { Category } = req.models;
    
    const categories = await Category.find({})
        .populate('disciplina', 'nombre color')
        .populate('profesores', 'nombre apellido')
        .populate('preparadoresFisicos', 'nombre apellido')
        .populate('nutricionistas', 'nombre apellido')
        .populate('psicologos', 'nombre apellido')
        .populate('planDefault', 'nombre monto')
        .sort({ nombre: 1 })
        .lean();
    
    res.json(sortByField(categories));
});

// @desc    Editar categoría
// @route   PUT /api/categories/:id
const updateCategory = asyncHandler(async (req, res) => {
    const { Category } = req.models;
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!category) { res.status(404); throw new Error('Categoría no encontrada'); }
    await category.populate('planDefault', 'nombre monto');
    res.json(category);
});

// @desc    Eliminar categoría (EFECTO DOMINÓ: Da de baja a los alumnos inscriptos)
// @route   DELETE /api/categories/:id
const deleteCategory = asyncHandler(async (req, res) => {
    const { Category, Enrollment } = req.models;
    
    const category = await Category.findById(req.params.id);

    if (!category) {
        res.status(404);
        throw new Error('Categoría no encontrada');
    }

    // 1. Efecto Dominó: Damos de baja a todos los atletas activos en esta categoría
    const bajas = await Enrollment.updateMany(
        { categoria: category._id, estado: 'activo' },
        { $set: { estado: 'inactivo', fechaBaja: Date.now() } }
    );

    // 2. Eliminamos la categoría de la base de datos
    await category.deleteOne();

    res.json({ 
        message: 'Categoría eliminada con éxito',
        detalles: `Se dio de baja a ${bajas.modifiedCount} atleta(s) que estaban inscriptos en esta categoría.`
    });
});

// @desc    Categorías donde el usuario es profesor o preparador físico asignado
// @route   GET /api/categories/mis-categorias
const getMisCategoriasCoach = asyncHandler(async (req, res) => {
    const { Category } = req.models;
    const query =
        req.user.rol === 'preparador_fisico'
            ? { preparadoresFisicos: req.user._id }
            : req.user.rol === 'nutricionista'
              ? { nutricionistas: req.user._id }
              : req.user.rol === 'psicologo'
                ? { psicologos: req.user._id }
                : { profesores: req.user._id };
    const cats = await Category.find(query)
        .populate('disciplina', 'nombre color')
        .populate('profesores', 'nombre apellido')
        .populate('preparadoresFisicos', 'nombre apellido')
        .populate('nutricionistas', 'nombre apellido')
        .populate('psicologos', 'nombre apellido')
        .sort({ nombre: 1 })
        .lean();

    const alertCounts = await getCoachCategoryAlertCounts(req.user, req.models);
    const withAlerts = cats.map((c) => {
        const alertasCount = alertCounts[String(c._id)] || 0;
        return {
            ...c,
            alertasCount,
            tieneAlertas: alertasCount > 0,
        };
    });

    res.json(sortByField(withAlerts));
});

function staffCategoriesQuery(rol, userId) {
    if (rol === 'preparador_fisico') return { preparadoresFisicos: userId };
    if (rol === 'nutricionista') return { nutricionistas: userId };
    if (rol === 'psicologo') return { psicologos: userId };
    return { profesores: userId };
}

// @desc    Atletas activos de todas las categorías del staff (lista única)
// @route   GET /api/categories/mis-atletas
const getMisAtletasStaff = asyncHandler(async (req, res) => {
    const { Category, Enrollment } = req.models;
    const rol = req.user.rol;
    const staffRoles = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
    if (!staffRoles.includes(rol)) {
        res.status(403);
        throw new Error('No autorizado.');
    }

    const cats = await Category.find(staffCategoriesQuery(rol, req.user._id))
        .select('nombre disciplina')
        .populate('disciplina', 'nombre color')
        .lean();

    if (!cats.length) {
        return res.json([]);
    }

    const catById = new Map(cats.map((c) => [String(c._id), c]));
    const catIds = cats.map((c) => c._id);

    const enrollments = await Enrollment.find({
        categoria: { $in: catIds },
        estado: 'activo',
    })
        .populate({
            path: 'atleta',
            select: 'nombre apellido dni fotoPerfil email tutorPrincipal',
            populate: { path: 'tutorPrincipal', select: 'nombre apellido email rol fotoPerfil' },
        })
        .lean();

    const byAtleta = new Map();
    for (const enr of enrollments) {
        const a = enr.atleta;
        if (!a?._id) continue;
        const aid = String(a._id);
        const cat = catById.get(String(enr.categoria));
        if (!cat) continue;
        const catEntry = {
            _id: cat._id,
            nombre: cat.nombre,
            disciplina: cat.disciplina,
        };
        if (!byAtleta.has(aid)) {
            byAtleta.set(aid, { atleta: a, categorias: [catEntry] });
            continue;
        }
        const row = byAtleta.get(aid);
        if (!row.categorias.some((c) => String(c._id) === String(cat._id))) {
            row.categorias.push(catEntry);
        }
    }

    const out = [...byAtleta.values()].sort((x, y) => compareUserByName(x.atleta, y.atleta));
    res.json(out);
});

async function assertCoachOfCategory(Category, categoryId, userId, rol) {
    const cat = await Category.findById(categoryId).select('profesores preparadoresFisicos');
    if (!cat) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (rol === 'profe') {
        const ok = (cat.profesores || []).some((p) => String(p) === String(userId));
        if (!ok) {
            const err = new Error('No sos profesor de esta categoría');
            err.statusCode = 403;
            throw err;
        }
        return;
    }
    if (rol === 'preparador_fisico') {
        const ok = (cat.preparadoresFisicos || []).some((p) => String(p) === String(userId));
        if (!ok) {
            const err = new Error('No sos preparador de esta categoría');
            err.statusCode = 403;
            throw err;
        }
    }
}

// @desc    Atletas elegibles por edad + estado del plantel (paginado)
// @route   GET /api/categories/:id/plantel?metaOnly=true&page=1&limit=40&search=
const getCategoryPlantel = asyncHandler(async (req, res) => {
    const { Category } = req.models;
    const metaOnly = req.query.metaOnly === 'true' || req.query.metaOnly === '1';
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 40, maxLimit: 100 });
    const search = String(req.query.search || '').trim();

    const payload = await getCategoryRosterContext(req.models, req.params.id, {
        metaOnly,
        page,
        limit,
        skip,
        search,
    });
    if (!payload) {
        res.status(404);
        throw new Error('Categoría no encontrada');
    }
    const rol = req.user.rol;
    if (rol === 'profe' || rol === 'preparador_fisico') {
        await assertCoachOfCategory(Category, req.params.id, req.user._id, rol);
    }

    if (metaOnly) {
        return res.json(payload);
    }

    res.json({
        ...payload,
        ...paginationMeta(page, limit, payload.totalElegibles ?? 0),
    });
});

// @desc    Actualizar inscripciones activas de la categoría (plantel)
// @route   PUT /api/categories/:id/plantel
const putCategoryPlantel = asyncHandler(async (req, res) => {
    const { Category } = req.models;
    const { atletaIds } = req.body;
    const rol = req.user.rol;

    if (!['admin_club', 'administrativo', 'profe', 'preparador_fisico'].includes(rol)) {
        res.status(403);
        throw new Error('No autorizado');
    }
    if (rol === 'profe' || rol === 'preparador_fisico') {
        await assertCoachOfCategory(Category, req.params.id, req.user._id, rol);
        const cat = await Category.findById(req.params.id).select('plantelEdicion');
        if (cat?.plantelEdicion?.estado !== 'delegado_coach') {
            res.status(403);
            throw new Error('El administrador no delegó la edición del plantel para esta categoría.');
        }
    }

    if (!Array.isArray(atletaIds)) {
        res.status(400);
        throw new Error('atletaIds debe ser un arreglo.');
    }

    const stats = await syncCategoryAthletes(req.models, req.params.id, atletaIds);
    const payload = await getCategoryRosterContext(req.models, req.params.id, { metaOnly: true });
    res.json({
        message: `Plantel actualizado: ${stats.total} atleta(s) (${stats.altas} alta(s), ${stats.bajas} baja(s)).`,
        stats,
        ...payload,
    });
});

// @desc    Pedir al profesor que actualice el plantel de la categoría
// @route   POST /api/categories/:id/plantel/delegar
const postDelegarCategoryPlantel = asyncHandler(async (req, res) => {
    const payload = await delegateCategoryRosterToCoach(req.models, req.params.id, req.user._id);
    res.json({
        message: 'El profesor asignado podrá actualizar el plantel de la categoría desde su app.',
        ...payload,
    });
});

// @desc    Categorías donde el coach debe actualizar el plantel
// @route   GET /api/categories/plantel-pendientes
const getPlantelPendientesCoach = asyncHandler(async (req, res) => {
    const list = await listRosterPendingForCoach(req.models, req.user._id, req.user.rol);
    res.json(list);
});

export {
    createCategory,
    getCategoriesByDiscipline,
    getAllCategories,
    updateCategory,
    deleteCategory,
    getMisCategoriasCoach,
    getMisAtletasStaff,
    getCategoryPlantel,
    putCategoryPlantel,
    postDelegarCategoryPlantel,
    getPlantelPendientesCoach,
};