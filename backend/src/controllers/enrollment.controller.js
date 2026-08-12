import asyncHandler from 'express-async-handler';
import { compareByField, sortByField, sortEnrollmentsByAtleta } from '../utils/listSort.js';
import { applyFamilyDiscountToEnrollment } from '../services/familyDiscount.service.js';
import { categorySexoError, applyCategorySexoToAthlete } from '../utils/atletaSexo.js';
import { syncCategoryGroupChatSafe } from '../services/categoryGroupChat.service.js';

// @desc    Inscribir un atleta a una categoría
// @route   POST /api/enrollments
const enrollAthlete = asyncHandler(async (req, res) => {
    const { atletaId, categoriaId, aptoMedico } = req.body;
    
    // Traemos ambos modelos de una sola vez
    const { User, Enrollment, Category } = req.models;

    // 1. Verificamos que el usuario exista y sea realmente un atleta
    const user = await User.findById(atletaId);
    if (!user || user.rol !== 'atleta') {
        res.status(400);
        throw new Error('El usuario no existe o no tiene el rol de atleta');
    }

    // 2. Verificamos límites de edad de la categoría
    const category = await Category.findById(categoriaId).populate('disciplina', 'planDefault');
    if (!category) {
        res.status(404);
        throw new Error('Categoría no encontrada');
    }

    if (category.edadMinima || category.edadMaxima) {
        if (!user.fechaNacimiento) {
            res.status(400);
            throw new Error('El atleta no tiene fecha de nacimiento registrada y la categoría tiene límites de edad');
        }
        
        const hoy = new Date();
        const nac = new Date(user.fechaNacimiento);
        let edad = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
            edad--;
        }

        if (category.edadMinima && edad < category.edadMinima) {
            res.status(400);
            throw new Error(`El atleta no cumple con la edad mínima de la categoría (${category.edadMinima} años)`);
        }
        if (category.edadMaxima && edad > category.edadMaxima) {
            res.status(400);
            throw new Error(`El atleta supera la edad máxima de la categoría (${category.edadMaxima} años)`);
        }
    }

    const sexoErr = categorySexoError(category, user);
    if (sexoErr) {
        res.status(400);
        throw new Error(sexoErr);
    }
    await applyCategorySexoToAthlete(user, category);

    // 3. Verificamos que no esté inscripto ya
    const exists = await Enrollment.findOne({ atleta: atletaId, categoria: categoriaId });
    if (exists) {
        res.status(400);
        throw new Error('El atleta ya está inscripto en esta categoría');
    }

    // 4. Creamos la inscripción con plan default de la categoría (o fallback de disciplina)
    const planAuto = category.planDefault || category.disciplina?.planDefault || undefined;
    let enrollment = await Enrollment.create({
        atleta: atletaId,
        categoria: categoriaId,
        aptoMedico,
        plan: planAuto
    });

    enrollment = await applyFamilyDiscountToEnrollment(req.models, atletaId, enrollment);

    await syncCategoryGroupChatSafe(req.models, categoriaId);

    res.status(201).json(enrollment);
});

// @desc    Obtener todos los atletas inscriptos en una categoría
// @route   GET /api/enrollments/categoria/:categoryId
const getAthletesByCategory = asyncHandler(async (req, res) => {
    const { Enrollment, Category } = req.models;

    const rol = req.user.rol;
    if (rol === 'profe') {
        const ok = await Category.findOne({ _id: req.params.categoryId, profesores: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
    }
    if (rol === 'preparador_fisico') {
        const ok = await Category.findOne({ _id: req.params.categoryId, preparadoresFisicos: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
    }
    if (rol === 'nutricionista') {
        const ok = await Category.findOne({ _id: req.params.categoryId, nutricionistas: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
    }
    if (rol === 'psicologo') {
        const ok = await Category.findOne({ _id: req.params.categoryId, psicologos: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
    }

    const enrollments = await Enrollment.find({
        categoria: req.params.categoryId,
        estado: 'activo',
    })
        .populate('atleta', 'nombre apellido dni fotoPerfil email')
        .populate('plan', 'nombre monto')
        .lean();

    res.json(sortEnrollmentsByAtleta(enrollments));
});

// @desc    Obtener todas las categorías donde el atleta está inscripto
// @route   GET /api/enrollments/atleta/:atletaId
const getCategoriesByAthlete = asyncHandler(async (req, res) => {
    const { Enrollment, User } = req.models;
    const targetId = req.params.atletaId;
    const rol = req.user.rol;

    if (rol === 'atleta') {
        if (String(targetId) !== String(req.user._id)) {
            res.status(403);
            throw new Error('Solo podés ver tus propias inscripciones.');
        }
    } else if (rol === 'tutor') {
        const hijo = await User.findById(targetId).select('tutorPrincipal rol').lean();
        if (!hijo || hijo.rol !== 'atleta') {
            res.status(400);
            throw new Error('Usuario no válido.');
        }
        if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            res.status(403);
            throw new Error('No tenés permiso para ver las categorías de este atleta.');
        }
    }

    const enrollments = await Enrollment.find({
        atleta: targetId,
        estado: 'activo',
    })
        .populate('plan', 'nombre monto')
        .populate({
            path: 'categoria',
            select: 'nombre edadMinima edadMaxima disciplina',
            populate: { path: 'disciplina', select: 'nombre color' },
        })
        .lean();

    enrollments.sort((a, b) => compareByField(a.categoria, b.categoria, 'nombre'));
    res.json(enrollments);
});

// @desc    Asignar un plan de pago y descuentos a una inscripción
// @route   PATCH /api/enrollments/:id/financials
const updateEnrollmentFinancials = asyncHandler(async (req, res) => {
    const { planId, descuentoPorcentaje, motivoDescuento } = req.body;
    const { Enrollment } = req.models;

    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
        res.status(404);
        throw new Error('Inscripción no encontrada');
    }

    // Actualizamos los datos financieros
    // Permitir setear y también limpiar el plan (planId: null)
    if (planId !== undefined) enrollment.plan = planId || null;
    if (descuentoPorcentaje !== undefined) enrollment.descuentoPorcentaje = descuentoPorcentaje;
    if (motivoDescuento !== undefined) enrollment.motivoDescuento = motivoDescuento;

    const updatedEnrollment = await enrollment.save();
    
    // Poblamos el plan para ver el resultado en la respuesta
    await updatedEnrollment.populate('plan', 'nombre monto');
    
    res.json(updatedEnrollment);
});

// @desc    Dar de baja una inscripción a categoría
// @route   DELETE /api/enrollments/:id
const unenrollAthlete = asyncHandler(async (req, res) => {
    const { Enrollment } = req.models;

    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
        res.status(404);
        throw new Error('Inscripción no encontrada');
    }

    enrollment.estado = 'inactivo';
    enrollment.fechaBaja = Date.now();
    await enrollment.save();

    await syncCategoryGroupChatSafe(req.models, enrollment.categoria);

    res.json({ message: 'El atleta fue desvinculado de la categoría exitosamente.' });
});

export { enrollAthlete, getAthletesByCategory, getCategoriesByAthlete, updateEnrollmentFinancials, unenrollAthlete };