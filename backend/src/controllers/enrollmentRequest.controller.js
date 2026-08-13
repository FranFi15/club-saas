import asyncHandler from 'express-async-handler';
import { calcEdad, matchesCategoryAgeLimits } from '../utils/ageHelper.js';
import { sortUsersByName, userNameCollation, userNameMongoSort } from '../utils/listSort.js';
import { categorySexoError, applyCategorySexoToAthlete } from '../utils/atletaSexo.js';
import { applyFamilyDiscountToEnrollment } from '../services/familyDiscount.service.js';
import { ensureCurrentMonthPaymentForEnrollment } from '../services/generateMonthlyPayments.service.js';
import { syncCategoryGroupChatSafe } from '../services/categoryGroupChat.service.js';

async function assertStaffCategoryAccess(req, res, categoriaId) {
    const { Category } = req.models;
    const rol = req.user.rol;
    const id = categoriaId;

    if (rol === 'admin_club' || rol === 'administrativo') return true;

    if (rol === 'profe') {
        const ok = await Category.findOne({ _id: id, profesores: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return true;
    }
    if (rol === 'preparador_fisico') {
        const ok = await Category.findOne({ _id: id, preparadoresFisicos: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return true;
    }
    if (rol === 'nutricionista') {
        const ok = await Category.findOne({ _id: id, nutricionistas: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return true;
    }
    if (rol === 'psicologo') {
        const ok = await Category.findOne({ _id: id, psicologos: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return true;
    }

    res.status(403);
    throw new Error('No tenés permiso para esta categoría.');
}

async function enrolledAndPendingIds(req, categoriaId) {
    const { Enrollment, EnrollmentRequest } = req.models;

    const activos = await Enrollment.find({ categoria: categoriaId, estado: 'activo' }).select('atleta').lean();
    const enrolledIds = new Set(activos.map((e) => String(e.atleta)));

    const pendientes = await EnrollmentRequest.find({
        categoria: categoriaId,
        estado: 'pendiente',
    })
        .select('atletas')
        .lean();

    const pendingIds = new Set();
    pendientes.forEach((r) => {
        (r.atletas || []).forEach((a) => pendingIds.add(String(a)));
    });

    return { enrolledIds, pendingIds };
}

function mapAthleteForPicker(user, category) {
    const edad = calcEdad(user.fechaNacimiento);
    return {
        _id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        dni: user.dni,
        fotoPerfil: user.fotoPerfil,
        email: user.email,
        fechaNacimiento: user.fechaNacimiento || null,
        edad,
        cumpleEdadCategoria: matchesCategoryAgeLimits(category, user.fechaNacimiento),
    };
}

// @route GET /api/enrollment-requests/categoria/:categoriaId/disponibles
const getAvailableAthletesForCategory = asyncHandler(async (req, res) => {
    const { User, Category } = req.models;
    const { categoriaId } = req.params;
    const search = (req.query.search || '').trim();

    await assertStaffCategoryAccess(req, res, categoriaId);

    const category = await Category.findById(categoriaId).select('nombre edadMinima edadMaxima').lean();
    if (!category) {
        res.status(404);
        throw new Error('Categoría no encontrada.');
    }

    const { enrolledIds, pendingIds } = await enrolledAndPendingIds(req, categoriaId);
    const hasAgeLimits = category.edadMinima != null || category.edadMaxima != null;

    const filter = { rol: 'atleta' };
    if (search.length >= 2) {
        const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ nombre: re }, { apellido: re }, { dni: re }, { email: re }];
    }
    if (hasAgeLimits) {
        filter.fechaNacimiento = { $exists: true, $ne: null };
    }

    const users = await User.find(filter)
        .select('nombre apellido dni fotoPerfil email fechaNacimiento')
        .collation(userNameCollation)
        .sort(userNameMongoSort)
        .limit(80)
        .lean();

    const atletas = users
        .filter((u) => !enrolledIds.has(String(u._id)) && !pendingIds.has(String(u._id)))
        .filter((u) => matchesCategoryAgeLimits(category, u.fechaNacimiento))
        .map((u) => mapAthleteForPicker(u, category));

    res.json({
        categoria: {
            _id: category._id,
            nombre: category.nombre,
            edadMinima: category.edadMinima ?? null,
            edadMaxima: category.edadMaxima ?? null,
        },
        atletas: sortUsersByName(atletas),
    });
});

// @route POST /api/enrollment-requests
const createEnrollmentRequest = asyncHandler(async (req, res) => {
    const { EnrollmentRequest, Category } = req.models;
    const { categoriaId, atletaIds, mensaje } = req.body;

    if (!categoriaId || !Array.isArray(atletaIds) || atletaIds.length === 0) {
        res.status(400);
        throw new Error('Indicá la categoría y al menos un atleta.');
    }

    await assertStaffCategoryAccess(req, res, categoriaId);

    const uniqueIds = [...new Set(atletaIds.map(String))];
    const { enrolledIds, pendingIds } = await enrolledAndPendingIds(req, categoriaId);

    const invalid = uniqueIds.filter((id) => enrolledIds.has(id) || pendingIds.has(id));
    if (invalid.length > 0) {
        res.status(400);
        throw new Error('Algunos atletas ya están en la categoría o tienen una solicitud pendiente.');
    }

    const category = await Category.findById(categoriaId).select('nombre edadMinima edadMaxima');
    if (!category) {
        res.status(404);
        throw new Error('Categoría no encontrada.');
    }

    const { User } = req.models;
    const athletes = await User.find({ _id: { $in: uniqueIds }, rol: 'atleta' }).select('nombre apellido fechaNacimiento');
    const fueraDeRango = athletes.filter((u) => !matchesCategoryAgeLimits(category, u.fechaNacimiento));
    if (fueraDeRango.length > 0) {
        res.status(400);
        throw new Error(
            'Uno o más atletas no cumplen la edad de la categoría o no tienen fecha de nacimiento registrada.',
        );
    }

    const request = await EnrollmentRequest.create({
        solicitante: req.user._id,
        categoria: categoriaId,
        atletas: uniqueIds,
        mensaje: typeof mensaje === 'string' ? mensaje.trim() : '',
        estado: 'pendiente',
    });

    await request.populate([
        { path: 'solicitante', select: 'nombre apellido rol' },
        { path: 'categoria', select: 'nombre' },
        { path: 'atletas', select: 'nombre apellido dni' },
    ]);

    res.status(201).json(request);
});

// @route GET /api/enrollment-requests/pendientes
const getPendingEnrollmentRequests = asyncHandler(async (req, res) => {
    const { EnrollmentRequest } = req.models;

    const list = await EnrollmentRequest.find({ estado: 'pendiente' })
        .populate('solicitante', 'nombre apellido rol')
        .populate('categoria', 'nombre')
        .populate('atletas', 'nombre apellido dni')
        .sort({ createdAt: -1 })
        .lean();

    res.json(
        list.map((item) => ({
            ...item,
            atletas: sortUsersByName(item.atletas || []),
        })),
    );
});

// @route PATCH /api/enrollment-requests/:id/resolver
const resolveEnrollmentRequest = asyncHandler(async (req, res) => {
    const { EnrollmentRequest, Enrollment, User, Category } = req.models;
    const { accion, motivoRechazo } = req.body;

    if (!['aprobar', 'rechazar'].includes(accion)) {
        res.status(400);
        throw new Error('Acción inválida. Usá aprobar o rechazar.');
    }

    const request = await EnrollmentRequest.findById(req.params.id);
    if (!request) {
        res.status(404);
        throw new Error('Solicitud no encontrada.');
    }
    if (request.estado !== 'pendiente') {
        res.status(400);
        throw new Error('Esta solicitud ya fue resuelta.');
    }

    if (accion === 'rechazar') {
        request.estado = 'rechazada';
        request.revisadoPor = req.user._id;
        request.motivoRechazo = typeof motivoRechazo === 'string' ? motivoRechazo.trim() : '';
        request.fechaResolucion = new Date();
        await request.save();
        await request.populate([
            { path: 'solicitante', select: 'nombre apellido rol' },
            { path: 'categoria', select: 'nombre' },
            { path: 'atletas', select: 'nombre apellido dni' },
        ]);
        return res.json(request);
    }

    const category = await Category.findById(request.categoria).populate('disciplina', 'planDefault');
    if (!category) {
        res.status(404);
        throw new Error('Categoría no encontrada.');
    }

    const planAuto = category.planDefault || category.disciplina?.planDefault || undefined;
    const creadas = [];
    const omitidos = [];

    for (const atletaId of request.atletas) {
        const user = await User.findById(atletaId);
        if (!user || user.rol !== 'atleta') {
            omitidos.push({ atletaId, motivo: 'No es atleta' });
            continue;
        }

        if (!matchesCategoryAgeLimits(category, user.fechaNacimiento)) {
            omitidos.push({ atletaId, motivo: 'No cumple edad de la categoría' });
            continue;
        }

        const sexoErr = categorySexoError(category, user);
        if (sexoErr) {
            omitidos.push({ atletaId, motivo: sexoErr });
            continue;
        }
        await applyCategorySexoToAthlete(user, category);

        const exists = await Enrollment.findOne({ atleta: atletaId, categoria: request.categoria });
        if (exists && exists.estado === 'activo') {
            omitidos.push({ atletaId, motivo: 'Ya inscripto' });
            continue;
        }

        if (exists) {
            exists.estado = 'activo';
            exists.fechaBaja = undefined;
            if (!exists.plan && planAuto) exists.plan = planAuto;
            await exists.save();
            let enr = await applyFamilyDiscountToEnrollment(req.models, atletaId, exists);
            try {
                await ensureCurrentMonthPaymentForEnrollment(req.models, enr);
            } catch (e) {
                console.warn('[enrollment-request] cuota mes actual:', e.message);
            }
            creadas.push(enr);
        } else {
            let enrollment = await Enrollment.create({
                atleta: atletaId,
                categoria: request.categoria,
                aptoMedico: false,
                plan: planAuto,
            });
            enrollment = await applyFamilyDiscountToEnrollment(req.models, atletaId, enrollment);
            try {
                await ensureCurrentMonthPaymentForEnrollment(req.models, enrollment);
            } catch (e) {
                console.warn('[enrollment-request] cuota mes actual:', e.message);
            }
            creadas.push(enrollment);
        }
    }

    request.estado = 'aprobada';
    request.revisadoPor = req.user._id;
    request.fechaResolucion = new Date();
    await request.save();

    await syncCategoryGroupChatSafe(req.models, request.categoria);

    await request.populate([
        { path: 'solicitante', select: 'nombre apellido rol' },
        { path: 'categoria', select: 'nombre' },
        { path: 'atletas', select: 'nombre apellido dni' },
    ]);

    res.json({ request, inscripcionesCreadas: creadas.length, omitidos });
});

export {
    getAvailableAthletesForCategory,
    createEnrollmentRequest,
    getPendingEnrollmentRequests,
    resolveEnrollmentRequest,
};
