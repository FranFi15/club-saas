import asyncHandler from 'express-async-handler';
import { compareByField, sortEnrollmentsByAtleta } from '../utils/listSort.js';
import { applyFamilyDiscountToEnrollment } from '../services/familyDiscount.service.js';
import { categorySexoError, applyCategorySexoToAthlete } from '../utils/atletaSexo.js';
import { syncCategoryGroupChatSafe } from '../services/categoryGroupChat.service.js';
import { ensureCurrentMonthPaymentForEnrollment } from '../services/generateMonthlyPayments.service.js';
import {
    clearEnrollmentBilling,
    defaultPlanIdForCategory,
    promoteBillingAfterUnenroll,
    promoteBillingToSibling,
    resolveNewEnrollmentBilling,
    setEnrollmentAsDisciplineBilling,
} from '../services/disciplineBilling.service.js';

async function applyPreviousBillingClear(models, previousBillingId) {
    if (!previousBillingId) return;
    const { Enrollment } = models;
    const prev = await Enrollment.findById(previousBillingId);
    if (prev) await clearEnrollmentBilling(prev);
}

// @desc    Inscribir un atleta a una categoría
// @route   POST /api/enrollments
const enrollAthlete = asyncHandler(async (req, res) => {
    const { atletaId, categoriaId, aptoMedico, facturacionPreferencia } = req.body;
    
    // Traemos ambos modelos de una sola vez
    const { User, Enrollment, Category } = req.models;

    // 1. Verificamos que el usuario exista y sea realmente un atleta
    const user = await User.findById(atletaId);
    if (!user || user.rol !== 'atleta') {
        res.status(400);
        throw new Error('El usuario no existe o no tiene el rol de atleta');
    }

    // 2. Verificamos límites de edad de la categoría
    const category = await Category.findById(categoriaId).populate(
        'disciplina',
        'nombre planDefault',
    );
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

    const preferencia =
        facturacionPreferencia === 'keep' || facturacionPreferencia === 'switch'
            ? facturacionPreferencia
            : undefined;

    const billing = await resolveNewEnrollmentBilling(req.models, {
        atletaId,
        category,
        preferencia,
        autoKeepOnConflict: false,
    });

    let enrollment = await Enrollment.create({
        atleta: atletaId,
        categoria: categoriaId,
        aptoMedico,
        plan: billing.plan || undefined,
        esFacturacion: Boolean(billing.esFacturacion),
    });

    await applyPreviousBillingClear(req.models, billing.previousBillingId);

    enrollment = await applyFamilyDiscountToEnrollment(req.models, atletaId, enrollment);

    if (enrollment.esFacturacion && enrollment.plan) {
        try {
            await ensureCurrentMonthPaymentForEnrollment(req.models, enrollment);
        } catch (e) {
            console.warn('[enroll] cuota mes actual:', e.message);
        }
    }

    await syncCategoryGroupChatSafe(req.models, categoriaId);

    const payload = enrollment.toObject ? enrollment.toObject() : { ...enrollment };
    if (billing.billingConflict) {
        payload.billingConflict = billing.billingConflict;
    }

    res.status(201).json(payload);
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

    if (planId !== undefined) {
        if (planId) {
            await setEnrollmentAsDisciplineBilling(req.models, enrollment, planId);
        } else {
            const wasBilling = enrollment.esFacturacion;
            enrollment.plan = null;
            enrollment.esFacturacion = false;
            await enrollment.save();
            if (wasBilling) {
                await promoteBillingToSibling(req.models, {
                    atletaId: enrollment.atleta,
                    categoriaId: enrollment.categoria,
                    excludeEnrollmentId: enrollment._id,
                });
            }
        }
    }
    if (descuentoPorcentaje !== undefined) enrollment.descuentoPorcentaje = descuentoPorcentaje;
    if (motivoDescuento !== undefined) enrollment.motivoDescuento = motivoDescuento;

    if (descuentoPorcentaje !== undefined || motivoDescuento !== undefined) {
        await enrollment.save();
    }

    const updatedEnrollment = await Enrollment.findById(enrollment._id).populate('plan', 'nombre monto');

    if (updatedEnrollment?.esFacturacion && updatedEnrollment.plan) {
        try {
            await ensureCurrentMonthPaymentForEnrollment(req.models, updatedEnrollment);
        } catch (e) {
            console.warn('[financials] cuota mes actual:', e.message);
        }
    }

    res.json(updatedEnrollment);
});

// @desc    Elegir qué inscripción factura la disciplina (mantener / cambiar)
// @route   PATCH /api/enrollments/:id/billing
const setEnrollmentBillingPreference = asyncHandler(async (req, res) => {
    const { preferencia } = req.body;
    const { Enrollment, Category } = req.models;

    if (preferencia !== 'keep' && preferencia !== 'switch') {
        res.status(400);
        throw new Error('Indicá preferencia "keep" o "switch".');
    }

    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment || enrollment.estado !== 'activo') {
        res.status(404);
        throw new Error('Inscripción no encontrada');
    }

    if (preferencia === 'keep') {
        enrollment.esFacturacion = false;
        enrollment.plan = null;
        await enrollment.save();
        await enrollment.populate('plan', 'nombre monto');
        return res.json(enrollment);
    }

    const category = await Category.findById(enrollment.categoria).populate(
        'disciplina',
        'nombre planDefault',
    );
    const planAuto = defaultPlanIdForCategory(category);
    await setEnrollmentAsDisciplineBilling(req.models, enrollment, planAuto || enrollment.plan);

    let updated = await Enrollment.findById(enrollment._id).populate('plan', 'nombre monto');
    updated = await applyFamilyDiscountToEnrollment(req.models, enrollment.atleta, updated);

    if (updated.esFacturacion && updated.plan) {
        try {
            await ensureCurrentMonthPaymentForEnrollment(req.models, updated);
        } catch (e) {
            console.warn('[billing] cuota mes actual:', e.message);
        }
    }

    res.json(updated);
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

    const wasBilling = enrollment.esFacturacion;
    enrollment.estado = 'inactivo';
    enrollment.fechaBaja = Date.now();
    enrollment.esFacturacion = false;
    await enrollment.save();

    if (wasBilling) {
        try {
            await promoteBillingAfterUnenroll(req.models, enrollment);
        } catch (e) {
            console.warn('[unenroll] promover facturación:', e.message);
        }
    }

    await syncCategoryGroupChatSafe(req.models, enrollment.categoria);

    res.json({ message: 'El atleta fue desvinculado de la categoría exitosamente.' });
});

export {
    enrollAthlete,
    getAthletesByCategory,
    getCategoriesByAthlete,
    updateEnrollmentFinancials,
    setEnrollmentBillingPreference,
    unenrollAthlete,
};
