import { calcEdad, birthDateRangeForCategory, matchesCategoryAgeLimits } from '../utils/ageHelper.js';
import { applyFamilyDiscountToEnrollment } from './familyDiscount.service.js';
import { categorySexoError, applyCategorySexoToAthlete } from '../utils/atletaSexo.js';
import { sortUsersByName, userNameCollation, userNameMongoSort } from '../utils/listSort.js';
import { buildAthletePlantelSearchFilter } from '../utils/pagination.js';

function mapAtletaElegible(u, activeIds, otrasByAtleta) {
    return {
        _id: u._id,
        nombre: u.nombre,
        apellido: u.apellido,
        dni: u.dni,
        email: u.email,
        fotoPerfil: u.fotoPerfil,
        edad: calcEdad(u.fechaNacimiento),
        inscriptoEnEsta: activeIds.has(String(u._id)),
        otrasCategorias: otrasByAtleta[String(u._id)] || [],
    };
}

async function loadOtrasCategoriasMap(Enrollment, categoryId, atletaIds) {
    if (!atletaIds.length) return {};
    const otrasEnrollments = await Enrollment.find({
        atleta: { $in: atletaIds },
        estado: 'activo',
        categoria: { $ne: categoryId },
    })
        .populate('categoria', 'nombre')
        .lean();

    const otrasByAtleta = {};
    for (const e of otrasEnrollments) {
        const aid = String(e.atleta);
        if (!otrasByAtleta[aid]) otrasByAtleta[aid] = [];
        if (e.categoria?.nombre) {
            otrasByAtleta[aid].push({ _id: e.categoria._id, nombre: e.categoria.nombre });
        }
    }
    return otrasByAtleta;
}

function buildEligibleUserFilter(category, search) {
    const userFilter = { rol: 'atleta', estado: 'activo' };
    const birthRange = birthDateRangeForCategory(category);
    const hasAgeLimits = category.edadMinima != null || category.edadMaxima != null;

    if (birthRange) {
        userFilter.fechaNacimiento = { ...birthRange, $exists: true, $ne: null };
    } else if (hasAgeLimits) {
        userFilter.fechaNacimiento = { $exists: true, $ne: null };
    }

    const searchFilter = buildAthletePlantelSearchFilter(search);
    if (searchFilter) {
        if (userFilter.$and) {
            userFilter.$and.push(...searchFilter.$and);
        } else {
            Object.assign(userFilter, searchFilter);
        }
    }

    return userFilter;
}

/**
 * @param {object} models
 * @param {string} categoryId
 * @param {{ metaOnly?: boolean, page?: number, limit?: number, skip?: number, search?: string }} [options]
 */
export async function getCategoryRosterContext(models, categoryId, options = {}) {
    const { Category, User, Enrollment } = models;
    const { metaOnly = false, page = 1, limit = 40, skip = 0, search = '' } = options;

    const category = await Category.findById(categoryId)
        .populate('profesores', 'nombre apellido email fotoPerfil')
        .lean();
    if (!category) return null;

    const activos = await Enrollment.find({ categoria: categoryId, estado: 'activo' })
        .select('atleta')
        .lean();
    const activeIds = new Set(activos.map((e) => String(e.atleta)));
    const inscriptoIds = activos.map((e) => e.atleta);

    const basePayload = {
        categoria: {
            _id: category._id,
            nombre: category.nombre,
            edadMinima: category.edadMinima ?? null,
            edadMaxima: category.edadMaxima ?? null,
            profesores: category.profesores || [],
        },
        plantelEdicion: category.plantelEdicion || { estado: null },
        totalInscriptos: activos.length,
        inscriptoIds,
    };

    if (metaOnly) {
        return basePayload;
    }

    const userFilter = buildEligibleUserFilter(category, search);
    const totalElegibles = await User.countDocuments(userFilter);

    let users = await User.find(userFilter)
        .select('nombre apellido dni fotoPerfil email fechaNacimiento')
        .collation(userNameCollation)
        .sort(userNameMongoSort)
        .skip(skip)
        .limit(limit)
        .lean();

    users = users.filter((u) => matchesCategoryAgeLimits(category, u.fechaNacimiento));

    const elegibleIds = users.map((u) => u._id);
    const otrasByAtleta = await loadOtrasCategoriasMap(Enrollment, categoryId, elegibleIds);

    const atletasElegibles = sortUsersByName(
        users.map((u) => mapAtletaElegible(u, activeIds, otrasByAtleta)),
    );

    return {
        ...basePayload,
        atletasElegibles,
        totalElegibles,
        page,
        limit,
    };
}

/** Sincroniza inscripciones activas de la categoría con la lista elegida (altas y bajas). */
export async function syncCategoryAthletes(models, categoryId, atletaIds) {
    const { User, Enrollment, Category } = models;

    const ids = [...new Set(atletaIds.map((id) => String(id)))];
    if (!ids.length) {
        const err = new Error('Seleccioná al menos un atleta.');
        err.statusCode = 400;
        throw err;
    }

    const category = await Category.findById(categoryId).populate('disciplina', 'planDefault');
    if (!category) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }

    const atletas = await User.find({ _id: { $in: ids }, rol: 'atleta' });
    if (atletas.length !== ids.length) {
        const err = new Error('Hay IDs inválidos o usuarios que no son atletas.');
        err.statusCode = 400;
        throw err;
    }

    const fueraDeRango = atletas.filter((u) => !matchesCategoryAgeLimits(category, u.fechaNacimiento));
    if (fueraDeRango.length > 0) {
        const err = new Error(
            'Uno o más atletas no cumplen la edad de la categoría o no tienen fecha de nacimiento.',
        );
        err.statusCode = 400;
        throw err;
    }

    const sexoInvalido = atletas.find((u) => categorySexoError(category, u));
    if (sexoInvalido) {
        const err = new Error(categorySexoError(category, sexoInvalido));
        err.statusCode = 400;
        throw err;
    }

    for (const u of atletas) {
        await applyCategorySexoToAthlete(u, category);
    }

    const targetSet = new Set(ids);
    const activos = await Enrollment.find({ categoria: categoryId, estado: 'activo' });

    let bajas = 0;
    for (const enr of activos) {
        if (!targetSet.has(String(enr.atleta))) {
            enr.estado = 'inactivo';
            enr.fechaBaja = Date.now();
            await enr.save();
            bajas += 1;
        }
    }

    const activosIds = new Set(activos.map((e) => String(e.atleta)));
    let altas = 0;
    const planAuto = category.planDefault || category.disciplina?.planDefault || undefined;

    for (const aid of ids) {
        if (activosIds.has(aid)) continue;

        let enr = await Enrollment.findOne({ atleta: aid, categoria: categoryId });
        if (enr) {
            enr.estado = 'activo';
            enr.fechaBaja = undefined;
            await enr.save();
        } else {
            enr = await Enrollment.create({
                atleta: aid,
                categoria: categoryId,
                aptoMedico: false,
                plan: planAuto,
            });
            await applyFamilyDiscountToEnrollment(models, aid, enr);
        }
        altas += 1;
    }

    category.plantelEdicion = { estado: null };
    await category.save();

    return { altas, bajas, total: ids.length };
}

export async function delegateCategoryRosterToCoach(models, categoryId, userId) {
    const { Category } = models;
    const category = await Category.findById(categoryId);
    if (!category) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (!category.profesores?.length) {
        const err = new Error('Asigná al menos un profesor a la categoría antes de delegar.');
        err.statusCode = 400;
        throw err;
    }

    category.plantelEdicion = {
        estado: 'delegado_coach',
        solicitadoPor: userId,
        solicitadoEn: new Date(),
    };
    await category.save();
    return getCategoryRosterContext(models, categoryId, { metaOnly: true });
}

export async function listRosterPendingForCoach(models, userId, rol) {
    const { Category } = models;
    const query =
        rol === 'preparador_fisico'
            ? { preparadoresFisicos: userId, 'plantelEdicion.estado': 'delegado_coach' }
            : { profesores: userId, 'plantelEdicion.estado': 'delegado_coach' };

    const cats = await Category.find(query)
        .populate('disciplina', 'nombre')
        .select('nombre plantelEdicion disciplina edadMinima edadMaxima')
        .lean();

    return cats.map((c) => ({
        _id: c._id,
        nombre: c.nombre,
        disciplina: c.disciplina,
        edadMinima: c.edadMinima,
        edadMaxima: c.edadMaxima,
    }));
}
