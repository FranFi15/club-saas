/** Descuento familiar: valor global en ClubSettings y override por tutor.
 * Aplica con 2 o más atletas permanentes: hijos con ese tutorPrincipal,
 * y el propio tutor si también tiene rol atleta.
 */

import { roleQuery, userHasRole } from '../constants/userRoles.js';
import {
    countOpenPaymentsNeedingDiscountRetarget,
    retargetOpenPaymentsFromEnrollments,
} from './generateMonthlyPayments.service.js';

const MIN_ATHLETES_FOR_FAMILY_DISCOUNT = 2;

export async function getOrCreateClubSettings(ClubSettings) {
    let doc = await ClubSettings.findOne();
    if (!doc) doc = await ClubSettings.create({});
    return doc;
}

export async function getGlobalFamilyDiscountPct(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    const n = doc.descuentoFamiliarGlobal;
    if (n == null || Number.isNaN(Number(n))) return 0;
    return Math.min(100, Math.max(0, Number(n)));
}

export async function setGlobalFamilyDiscountPct(models, porcentaje) {
    const { ClubSettings } = models;
    const raw = Number(String(porcentaje ?? '').trim().replace(',', '.'));
    const pct = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0));
    await getOrCreateClubSettings(ClubSettings);
    await ClubSettings.findOneAndUpdate({}, { descuentoFamiliarGlobal: pct }, { upsert: true });
    return pct;
}

export function buildMotivoDescuento(cantidadHijos, porcentaje) {
    return cantidadHijos >= MIN_ATHLETES_FOR_FAMILY_DISCOUNT
        ? `Descuento familiar por hermanos (${porcentaje}%)`
        : `Descuento familiar (${porcentaje}%)`;
}

function isPermanentAthleteUser(user) {
    if (!user || !userHasRole(user, 'atleta')) return false;
    if (user.estado === 'inactivo') return false;
    if (user.esPrueba === true) return false;
    return true;
}

/** Hijos vinculados + el tutor si también es atleta permanente. */
export async function listFamilyAthletesForDiscount(models, tutorId) {
    const { User } = models;
    const hijos = await User.find({
        ...roleQuery('atleta'),
        tutorPrincipal: tutorId,
        estado: { $ne: 'inactivo' },
        esPrueba: { $ne: true },
    });

    const members = [...hijos];
    const tutor = await User.findById(tutorId).select(
        'nombre apellido fotoPerfil rol roles estado esPrueba tutorPrincipal',
    );
    if (tutor && isPermanentAthleteUser(tutor)) {
        const already = members.some((h) => String(h._id) === String(tutorId));
        if (!already) members.push(tutor);
    }
    return members;
}

export async function countFamilyAthletesForDiscount(models, tutorId) {
    return (await listFamilyAthletesForDiscount(models, tutorId)).length;
}

async function clearFamilyDiscountOnEnrollments(models, tutorId) {
    const { Enrollment } = models;
    const members = await listFamilyAthletesForDiscount(models, tutorId);
    let actualizados = 0;
    for (const member of members) {
        const result = await Enrollment.updateMany(
            { atleta: member._id, estado: 'activo', descuentoPorcentaje: { $gt: 0 } },
            { descuentoPorcentaje: 0, motivoDescuento: '' },
        );
        actualizados += result.modifiedCount;
    }
    return { hijos: members.length, actualizados };
}

/** Porcentaje vigente para una familia (override del tutor o global). */
export async function getFamilyDiscountPctForTutor(models, tutorId) {
    const { User } = models;
    const tutor = await User.findById(tutorId).select('rol roles descuentoFamiliar');
    if (!tutor || !userHasRole(tutor, 'tutor')) return 0;
    if (tutor.descuentoFamiliar != null && !Number.isNaN(Number(tutor.descuentoFamiliar))) {
        return Math.min(100, Math.max(0, Number(tutor.descuentoFamiliar)));
    }
    return getGlobalFamilyDiscountPct(models);
}

export async function applyDiscountToFamilyEnrollments(models, tutorId, porcentaje, { updateTutor = true } = {}) {
    const { User, Enrollment } = models;
    const miembros = await listFamilyAthletesForDiscount(models, tutorId);

    if (miembros.length < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) {
        const cleared = await clearFamilyDiscountOnEnrollments(models, tutorId);
        if (updateTutor) {
            await User.findByIdAndUpdate(tutorId, { descuentoFamiliar: null });
        }
        return {
            hijos: miembros.length,
            actualizados: cleared.actualizados,
            porcentaje: 0,
            skipped: true,
            reason: 'familia_un_atleta',
        };
    }

    const pct = Math.min(100, Math.max(0, Number(porcentaje) || 0));
    const motivo = buildMotivoDescuento(miembros.length, pct);

    let actualizados = 0;
    for (const member of miembros) {
        const result = await Enrollment.updateMany(
            { atleta: member._id, estado: 'activo' },
            { descuentoPorcentaje: pct, motivoDescuento: motivo },
        );
        actualizados += result.modifiedCount;
    }

    if (updateTutor) {
        await User.findByIdAndUpdate(tutorId, { descuentoFamiliar: pct });
    }

    return { hijos: miembros.length, actualizados, porcentaje: pct };
}

/**
 * Al vincular atletas o crear inscripciones: asigna el % global al tutor si aún no tiene override
 * y aplica a todas las inscripciones activas de la familia (solo con 2+ atletas).
 */
export async function syncFamilyDiscountForTutor(models, tutorId) {
    const { User } = models;
    const tutor = await User.findById(tutorId).select('rol roles descuentoFamiliar');
    if (!tutor || !userHasRole(tutor, 'tutor')) return { applied: false };

    const familyCount = await countFamilyAthletesForDiscount(models, tutorId);
    if (familyCount < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) {
        await clearFamilyDiscountOnEnrollments(models, tutorId);
        return { applied: false, reason: 'familia_un_atleta' };
    }

    const global = await getGlobalFamilyDiscountPct(models);
    const unset = tutor.descuentoFamiliar == null || tutor.descuentoFamiliar === undefined;

    let pct;
    if (unset) {
        if (global <= 0) return { applied: false };
        pct = global;
        await User.findByIdAndUpdate(tutorId, { descuentoFamiliar: pct });
    } else {
        pct = Math.min(100, Math.max(0, Number(tutor.descuentoFamiliar)));
    }

    if (pct <= 0) return { applied: false };

    const { actualizados } = await applyDiscountToFamilyEnrollments(models, tutorId, pct, {
        updateTutor: false,
    });

    const members = await listFamilyAthletesForDiscount(models, tutorId);
    const athleteIds = members.map((h) => h._id);
    let cuotasActualizadas = 0;
    if (athleteIds.length) {
        const retarget = await retargetOpenPaymentsFromEnrollments(models, athleteIds, {
            scope: 'all_open',
        });
        cuotasActualizadas = retarget.updated;
    }

    return { applied: true, porcentaje: pct, actualizados, cuotasActualizadas };
}

export async function syncFamilyDiscountForAthlete(models, atletaId) {
    const { User } = models;
    const atleta = await User.findById(atletaId).select('tutorPrincipal rol roles');
    if (!atleta || !userHasRole(atleta, 'atleta')) return { applied: false };

    let last = { applied: false };
    if (atleta.tutorPrincipal) {
        last = await syncFamilyDiscountForTutor(models, atleta.tutorPrincipal);
    }
    if (userHasRole(atleta, 'tutor')) {
        const asTutor = await syncFamilyDiscountForTutor(models, atleta._id);
        if (asTutor.applied) last = asTutor;
    }
    return last;
}

/** Aplica el descuento familiar a una inscripción recién creada (solo familias con 2+ atletas). */
export async function applyFamilyDiscountToEnrollment(models, atletaId, enrollment) {
    const { User } = models;
    const atleta = await User.findById(atletaId).select('tutorPrincipal rol roles');
    if (!atleta || !userHasRole(atleta, 'atleta')) return enrollment;

    if (atleta.tutorPrincipal) {
        await syncFamilyDiscountForTutor(models, atleta.tutorPrincipal);
    }
    if (userHasRole(atleta, 'tutor')) {
        await syncFamilyDiscountForTutor(models, atleta._id);
    }

    const familyTutorId = atleta.tutorPrincipal
        ? atleta.tutorPrincipal
        : userHasRole(atleta, 'tutor')
          ? atleta._id
          : null;
    if (!familyTutorId) return enrollment;

    const familyCount = await countFamilyAthletesForDiscount(models, familyTutorId);
    if (familyCount < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) {
        if (enrollment.descuentoPorcentaje) {
            enrollment.descuentoPorcentaje = 0;
            enrollment.motivoDescuento = '';
            await enrollment.save();
        }
        return enrollment;
    }

    const pct = await getFamilyDiscountPctForTutor(models, familyTutorId);
    if (pct <= 0) return enrollment;

    enrollment.descuentoPorcentaje = pct;
    enrollment.motivoDescuento = buildMotivoDescuento(familyCount, pct);
    await enrollment.save();
    return enrollment;
}

/**
 * Recorre familias (2+ atletas) y aplica el % vigente (override o global) en inscripciones.
 * Opcionalmente recalcula cuotas abiertas.
 *
 * @param {'none'|'current_month'|'all_open'} applyOpenPayments
 */
export async function syncAllFamilyDiscounts(
    models,
    { applyOpenPayments = 'none', mes, anio } = {},
) {
    const { User } = models;
    const globalPct = await getGlobalFamilyDiscountPct(models);

    const atletas = await User.find({
        ...roleQuery('atleta'),
        tutorPrincipal: { $ne: null },
        estado: { $ne: 'inactivo' },
        esPrueba: { $ne: true },
    })
        .select('_id tutorPrincipal')
        .lean();

    const byTutor = new Map();
    for (const a of atletas) {
        const tid = String(a.tutorPrincipal);
        if (!byTutor.has(tid)) byTutor.set(tid, []);
        byTutor.get(tid).push(a._id);
    }

    let familiasElegibles = 0;
    let familiasActualizadas = 0;
    let inscripcionesActualizadas = 0;
    const allFamilyAthleteIds = [];

    for (const [tutorId] of byTutor.entries()) {
        const members = await listFamilyAthletesForDiscount(models, tutorId);
        if (members.length < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) continue;
        familiasElegibles += 1;

        const pct = await getFamilyDiscountPctForTutor(models, tutorId);
        if (pct <= 0) continue;

        const result = await applyDiscountToFamilyEnrollments(models, tutorId, pct, {
            updateTutor: false,
        });
        if (result.skipped) continue;
        if (result.actualizados > 0) {
            familiasActualizadas += 1;
            inscripcionesActualizadas += result.actualizados;
        }
        for (const member of members) {
            allFamilyAthleteIds.push(member._id);
        }
    }

    const openNeeds = await countOpenPaymentsNeedingDiscountRetarget(models, allFamilyAthleteIds, {
        mes,
        anio,
    });

    let cuotasActualizadas = 0;
    if (applyOpenPayments === 'current_month' || applyOpenPayments === 'all_open') {
        const retarget = await retargetOpenPaymentsFromEnrollments(models, allFamilyAthleteIds, {
            scope: applyOpenPayments === 'current_month' ? 'current_month' : 'all_open',
            mes,
            anio,
        });
        cuotasActualizadas = retarget.updated;
    }

    return {
        globalPct,
        familiasElegibles,
        familiasActualizadas,
        inscripcionesActualizadas,
        cuotasAbiertasSinDto: openNeeds.allOpen,
        cuotasMesSinDto: openNeeds.currentMonth,
        cuotasActualizadas,
        applyOpenPayments,
    };
}

/** Aplica descuento a una familia y opcionalmente a cuotas abiertas. */
export async function applyFamilyDiscountAndOptionalPayments(
    models,
    tutorId,
    porcentaje,
    { applyOpenPayments = 'none', mes, anio, updateTutor = true } = {},
) {
    const applied = await applyDiscountToFamilyEnrollments(models, tutorId, porcentaje, {
        updateTutor,
    });

    const members = await listFamilyAthletesForDiscount(models, tutorId);
    const athleteIds = members.map((h) => h._id);

    const openNeeds = await countOpenPaymentsNeedingDiscountRetarget(models, athleteIds, {
        mes,
        anio,
    });

    let cuotasActualizadas = 0;
    if (
        !applied.skipped &&
        (applyOpenPayments === 'current_month' || applyOpenPayments === 'all_open')
    ) {
        const retarget = await retargetOpenPaymentsFromEnrollments(models, athleteIds, {
            scope: applyOpenPayments === 'current_month' ? 'current_month' : 'all_open',
            mes,
            anio,
        });
        cuotasActualizadas = retarget.updated;
    }

    return {
        ...applied,
        cuotasAbiertasSinDto: openNeeds.allOpen,
        cuotasMesSinDto: openNeeds.currentMonth,
        cuotasActualizadas,
    };
}
