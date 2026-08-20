/** Descuento familiar: valor global en ClubSettings y override por tutor.
 * Solo aplica con 2 o más atletas bajo el mismo tutor.
 */

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
    const pct = Math.min(100, Math.max(0, Number(porcentaje) || 0));
    await getOrCreateClubSettings(ClubSettings);
    await ClubSettings.findOneAndUpdate({}, { descuentoFamiliarGlobal: pct }, { upsert: true });
    return pct;
}

export function buildMotivoDescuento(cantidadHijos, porcentaje) {
    return cantidadHijos >= MIN_ATHLETES_FOR_FAMILY_DISCOUNT
        ? `Descuento familiar por hermanos (${porcentaje}%)`
        : `Descuento familiar (${porcentaje}%)`;
}

async function countHijosDelTutor(models, tutorId) {
    const { User } = models;
    return User.countDocuments({ rol: 'atleta', tutorPrincipal: tutorId });
}

async function clearFamilyDiscountOnEnrollments(models, tutorId) {
    const { User, Enrollment } = models;
    const hijos = await User.find({ rol: 'atleta', tutorPrincipal: tutorId }).select('_id');
    let actualizados = 0;
    for (const hijo of hijos) {
        const result = await Enrollment.updateMany(
            { atleta: hijo._id, estado: 'activo', descuentoPorcentaje: { $gt: 0 } },
            { descuentoPorcentaje: 0, motivoDescuento: '' },
        );
        actualizados += result.modifiedCount;
    }
    return { hijos: hijos.length, actualizados };
}

/** Porcentaje vigente para una familia (override del tutor o global). */
export async function getFamilyDiscountPctForTutor(models, tutorId) {
    const { User } = models;
    const tutor = await User.findById(tutorId).select('rol descuentoFamiliar');
    if (!tutor || tutor.rol !== 'tutor') return 0;
    if (tutor.descuentoFamiliar != null && !Number.isNaN(Number(tutor.descuentoFamiliar))) {
        return Math.min(100, Math.max(0, Number(tutor.descuentoFamiliar)));
    }
    return getGlobalFamilyDiscountPct(models);
}

export async function applyDiscountToFamilyEnrollments(models, tutorId, porcentaje, { updateTutor = true } = {}) {
    const { User, Enrollment } = models;
    const hijos = await User.find({ rol: 'atleta', tutorPrincipal: tutorId });

    if (hijos.length < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) {
        const cleared = await clearFamilyDiscountOnEnrollments(models, tutorId);
        if (updateTutor) {
            await User.findByIdAndUpdate(tutorId, { descuentoFamiliar: null });
        }
        return {
            hijos: hijos.length,
            actualizados: cleared.actualizados,
            porcentaje: 0,
            skipped: true,
            reason: 'familia_un_atleta',
        };
    }

    const pct = Math.min(100, Math.max(0, Number(porcentaje) || 0));
    const motivo = buildMotivoDescuento(hijos.length, pct);

    let actualizados = 0;
    for (const hijo of hijos) {
        const result = await Enrollment.updateMany(
            { atleta: hijo._id, estado: 'activo' },
            { descuentoPorcentaje: pct, motivoDescuento: motivo },
        );
        actualizados += result.modifiedCount;
    }

    if (updateTutor) {
        await User.findByIdAndUpdate(tutorId, { descuentoFamiliar: pct });
    }

    return { hijos: hijos.length, actualizados, porcentaje: pct };
}

/**
 * Al vincular atletas o crear inscripciones: asigna el % global al tutor si aún no tiene override
 * y aplica a todas las inscripciones activas de la familia (solo con 2+ atletas).
 */
export async function syncFamilyDiscountForTutor(models, tutorId) {
    const { User } = models;
    const tutor = await User.findById(tutorId).select('rol descuentoFamiliar');
    if (!tutor || tutor.rol !== 'tutor') return { applied: false };

    const hijosCount = await countHijosDelTutor(models, tutorId);
    if (hijosCount < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) {
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
    return { applied: true, porcentaje: pct, actualizados };
}

export async function syncFamilyDiscountForAthlete(models, atletaId) {
    const { User } = models;
    const atleta = await User.findById(atletaId).select('tutorPrincipal rol');
    if (!atleta?.tutorPrincipal || atleta.rol !== 'atleta') return { applied: false };
    return syncFamilyDiscountForTutor(models, atleta.tutorPrincipal);
}

/** Aplica el descuento familiar a una inscripción recién creada (solo familias con 2+ atletas). */
export async function applyFamilyDiscountToEnrollment(models, atletaId, enrollment) {
    const { User } = models;
    const atleta = await User.findById(atletaId).select('tutorPrincipal rol');
    if (!atleta?.tutorPrincipal || atleta.rol !== 'atleta') return enrollment;

    await syncFamilyDiscountForTutor(models, atleta.tutorPrincipal);

    const hijos = await countHijosDelTutor(models, atleta.tutorPrincipal);
    if (hijos < MIN_ATHLETES_FOR_FAMILY_DISCOUNT) {
        if (enrollment.descuentoPorcentaje) {
            enrollment.descuentoPorcentaje = 0;
            enrollment.motivoDescuento = '';
            await enrollment.save();
        }
        return enrollment;
    }

    const pct = await getFamilyDiscountPctForTutor(models, atleta.tutorPrincipal);
    if (pct <= 0) return enrollment;

    enrollment.descuentoPorcentaje = pct;
    enrollment.motivoDescuento = buildMotivoDescuento(hijos, pct);
    await enrollment.save();
    return enrollment;
}
