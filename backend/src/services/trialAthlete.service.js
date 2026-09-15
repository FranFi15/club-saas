import { createAppNotification } from './appNotification.service.js';
import { ensureCurrentMonthPaymentForEnrollment } from './generateMonthlyPayments.service.js';
import {
    ensureCurrentMonthSocialFeeForUser,
    resolveUserSocialFeeAssignment,
} from './generateSocialFees.service.js';
import { syncFamilyDiscountForTutor, syncFamilyDiscountForAthlete } from './familyDiscount.service.js';
import { reconcileDisciplineBillingFlags } from './disciplineBilling.service.js';
import { hijosDelTutorFilter } from '../utils/userQuery.js';
import { startOfTodayUtc } from './spaceSessionRelocation.service.js';

/** Fin inclusive del día de prueba en UTC (23:59:59.999). */
export function computePruebaHasta(diasPrueba, fromDate = new Date()) {
    const days = Math.min(365, Math.max(1, Math.floor(Number(diasPrueba) || 0)));
    if (!days) {
        const err = new Error('Indicá la cantidad de días de prueba (1–365).');
        err.statusCode = 400;
        throw err;
    }
    const base = new Date(fromDate);
    base.setUTCHours(0, 0, 0, 0);
    base.setUTCDate(base.getUTCDate() + days);
    base.setUTCHours(23, 59, 59, 999);
    return base;
}

export function parseTrialCreateFields({ esPrueba, diasPrueba, rol }) {
    if (rol !== 'atleta' || !esPrueba) {
        return {
            esPrueba: false,
            pruebaHasta: null,
            pruebaAvisoEnviadoAt: null,
            pruebaDecision: null,
        };
    }
    return {
        esPrueba: true,
        pruebaHasta: computePruebaHasta(diasPrueba),
        pruebaAvisoEnviadoAt: null,
        pruebaDecision: null,
    };
}

export function isAthleteOnTrial(user) {
    return Boolean(user?.esPrueba) && user?.rol === 'atleta';
}

/** True when the athlete has a living tutor who should decide on trial expiry. */
export async function athleteHasDecisionTutor(models, atleta) {
    if (!atleta?.tutorPrincipal) return false;
    const { User } = models;
    const tutor = await User.findById(atleta.tutorPrincipal).select('rol estado').lean();
    return Boolean(tutor && tutor.rol === 'tutor' && tutor.estado !== 'inactivo');
}

export function trialNeedsMemberDecision(user) {
    if (!user || user.rol !== 'atleta' || user.estado === 'inactivo') return false;
    if (user.pruebaDecision === 'pendiente') return true;
    if (!user.esPrueba || !user.pruebaHasta) return false;
    return new Date(user.pruebaHasta) < startOfTodayUtc();
}

/**
 * Asigna plan vía billing pero nunca factura mientras el atleta está en prueba.
 */
export function enrollmentBillingForTrial(billing, esPrueba) {
    if (!esPrueba) {
        return {
            plan: billing?.plan || undefined,
            esFacturacion: Boolean(billing?.esFacturacion),
            previousBillingId: billing?.previousBillingId,
        };
    }
    return {
        plan: billing?.plan || undefined,
        esFacturacion: false,
        previousBillingId: billing?.previousBillingId,
    };
}

async function deactivateAthleteInternal(models, atleta, { desactivarTutorTambien = true } = {}) {
    const { User, Enrollment } = models;

    atleta.estado = 'inactivo';
    atleta.esPrueba = false;
    atleta.pruebaDecision = 'baja';
    await atleta.save();

    if (Enrollment) {
        await Enrollment.updateMany(
            { atleta: atleta._id, estado: 'activo' },
            { $set: { estado: 'inactivo', fechaBaja: Date.now() } },
        );
    }

    let tutorDesactivado = false;
    let otrosAtletasActivos = 0;
    if (atleta.tutorPrincipal) {
        otrosAtletasActivos = await User.countDocuments({
            ...hijosDelTutorFilter(atleta.tutorPrincipal),
            _id: { $ne: atleta._id },
        });
        if (otrosAtletasActivos === 0 && desactivarTutorTambien) {
            await User.findByIdAndUpdate(atleta.tutorPrincipal, { estado: 'inactivo' });
            tutorDesactivado = true;
        }
    }

    return { otrosAtletasActivos, tutorDesactivado };
}

/** Convierte atleta de prueba a permanente y activa facturación. */
export async function convertTrialAthleteToPermanent(models, atletaId, { actor } = {}) {
    const { User, Enrollment } = models;
    const atleta = await User.findById(atletaId);
    if (!atleta || atleta.rol !== 'atleta') {
        const err = new Error('Atleta no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (!atleta.esPrueba && atleta.pruebaDecision !== 'pendiente') {
        const err = new Error('Este atleta no está en período de prueba.');
        err.statusCode = 400;
        throw err;
    }

    await assertCanDecideTrial(models, actor, atleta);

    atleta.esPrueba = false;
    atleta.pruebaHasta = null;
    atleta.pruebaAvisoEnviadoAt = null;
    atleta.pruebaDecision = 'continuar';
    if (atleta.estado === 'inactivo') atleta.estado = 'activo';
    // Trial create marks social fee exempt; clear so assignment can apply.
    if (atleta.exentoCuotaSocial && !atleta.cuotaSocialAsignada) {
        atleta.exentoCuotaSocial = false;
    }
    await atleta.save();

    try {
        const assignment = await resolveUserSocialFeeAssignment(models, {
            rol: atleta.rol,
            exentoCuotaSocial: atleta.exentoCuotaSocial,
            cuotaSocialAsignada: atleta.cuotaSocialAsignada,
        });
        atleta.exentoCuotaSocial = assignment.exentoCuotaSocial;
        atleta.cuotaSocialAsignada = assignment.cuotaSocialAsignada || null;
        await atleta.save();
    } catch (e) {
        console.warn('[trial] resolve social fee:', e.message);
    }

    const enrollments = await Enrollment.find({ atleta: atleta._id, estado: 'activo', plan: { $ne: null } });
    for (const enr of enrollments) {
        if (!enr.esFacturacion) {
            enr.esFacturacion = true;
            await enr.save();
        }
    }
    try {
        await reconcileDisciplineBillingFlags(models);
    } catch (e) {
        console.warn('[trial] reconcile billing:', e.message);
    }

    const billable = await Enrollment.find({
        atleta: atleta._id,
        estado: 'activo',
        esFacturacion: true,
        plan: { $ne: null },
    });
    for (const enr of billable) {
        try {
            await ensureCurrentMonthPaymentForEnrollment(models, enr);
        } catch (e) {
            console.warn('[trial] ensure payment:', e.message);
        }
    }

    try {
        await ensureCurrentMonthSocialFeeForUser(models, atleta);
    } catch (e) {
        console.warn('[trial] social fee athlete:', e.message);
    }

    if (atleta.tutorPrincipal) {
        try {
            const tutor = await User.findById(atleta.tutorPrincipal);
            if (tutor && tutor.estado !== 'inactivo') {
                await ensureCurrentMonthSocialFeeForUser(models, tutor);
            }
            await syncFamilyDiscountForTutor(models, atleta.tutorPrincipal);
        } catch (e) {
            console.warn('[trial] social fee / discount tutor:', e.message);
        }
    } else {
        try {
            await syncFamilyDiscountForAthlete(models, atleta._id);
        } catch (e) {
            console.warn('[trial] discount athlete:', e.message);
        }
    }

    return atleta;
}

/** Baja del atleta de prueba (y tutor si no quedan hijos activos). */
export async function leaveTrialAthlete(models, atletaId, { actor, desactivarTutorTambien = true } = {}) {
    const { User } = models;
    const atleta = await User.findById(atletaId);
    if (!atleta || atleta.rol !== 'atleta') {
        const err = new Error('Atleta no encontrado.');
        err.statusCode = 404;
        throw err;
    }
    if (!atleta.esPrueba && atleta.pruebaDecision !== 'pendiente') {
        const err = new Error('Este atleta no está en período de prueba.');
        err.statusCode = 400;
        throw err;
    }

    await assertCanDecideTrial(models, actor, atleta);

    const info = await deactivateAthleteInternal(models, atleta, { desactivarTutorTambien });

    if (atleta.tutorPrincipal && !info.tutorDesactivado) {
        try {
            await syncFamilyDiscountForTutor(models, atleta.tutorPrincipal);
        } catch (e) {
            console.warn('[trial] discount after leave:', e.message);
        }
    }

    return { atleta, ...info };
}

async function assertCanDecideTrial(models, actor, atleta) {
    if (!actor) {
        const err = new Error('No autorizado.');
        err.statusCode = 401;
        throw err;
    }
    // Admin may still convert from Usuarios (backoffice), but alerts go to tutor/athlete.
    if (actor.rol === 'admin_club' || actor.rol === 'administrativo') return;
    if (
        actor.rol === 'tutor' &&
        atleta.tutorPrincipal &&
        String(atleta.tutorPrincipal) === String(actor._id)
    ) {
        return;
    }
    // Solo-athlete (no active tutor): they confirm continue / leave themselves.
    if (actor.rol === 'atleta' && String(atleta._id) === String(actor._id)) {
        const hasTutor = await athleteHasDecisionTutor(models, atleta);
        if (!hasTutor) return;
    }
    const err = new Error('No tenés permiso para decidir sobre este atleta de prueba.');
    err.statusCode = 403;
    throw err;
}

async function notifyTrialExpired(models, atleta) {
    const nombre = `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim() || 'Atleta';
    const titulo = 'Prueba vencida';
    const hasTutor = await athleteHasDecisionTutor(models, atleta);
    // Tutor decides for kids; athletes without an active tutor decide themselves.
    const destinatarioId = hasTutor ? String(atleta.tutorPrincipal) : String(atleta._id);
    const mensaje = hasTutor
        ? `La prueba de ${nombre} terminó. ¿Continúan en el club? Si confirman, se activan cuotas y planes.`
        : 'Tu período de prueba terminó. ¿Querés seguir en el club? Si confirmás, se activan cuotas y planes.';

    try {
        await createAppNotification(models, {
            usuario: destinatarioId,
            tipo: 'prueba_expirada',
            titulo,
            mensaje,
            referencia: atleta._id,
        });
    } catch (e) {
        console.warn('[trial] notify:', e.message);
    }
}

/**
 * Marca vencidos y notifica (idempotente vía pruebaAvisoEnviadoAt).
 * También re-notifica si ya está pendiente pero aún no se envió aviso.
 */
export async function processExpiredTrialsForTenant(models) {
    const { User } = models;
    const today = startOfTodayUtc();

    const expired = await User.find({
        rol: 'atleta',
        esPrueba: true,
        estado: { $ne: 'inactivo' },
        pruebaHasta: { $lt: today },
        $or: [{ pruebaAvisoEnviadoAt: null }, { pruebaAvisoEnviadoAt: { $exists: false } }],
    });

    let notified = 0;
    for (const atleta of expired) {
        atleta.pruebaDecision = 'pendiente';
        atleta.pruebaAvisoEnviadoAt = new Date();
        await atleta.save();
        await notifyTrialExpired(models, atleta);
        notified += 1;
    }

    return { notified, checked: expired.length };
}

/** Safety net: process expired trials for this tenant (login / bootstrap). */
export async function ensureTrialExpiryProcessed(models) {
    try {
        return await processExpiredTrialsForTenant(models);
    } catch (e) {
        console.warn('[trial] ensure expiry:', e.message);
        return { notified: 0, checked: 0 };
    }
}
