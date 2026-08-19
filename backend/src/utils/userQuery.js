import mongoose from 'mongoose';

/**
 * Filtros de usuarios atleta "activos" para listados y vínculos tutor–atleta.
 * El modelo User usa `estado` (activo | inactivo | moroso), no un booleano `activo`.
 *
 * `$ne` / `$in` deben ir con `mongoose.trusted()` porque `sanitizeFilter` está activo
 * y si no convierte el operador en `$eq`, la consulta no matchea o explota al castear.
 */
export function activeAthleteFilter() {
    return {
        rol: 'atleta',
        estado: { $ne: mongoose.trusted('inactivo') },
    };
}

export function hijosDelTutorFilter(tutorId) {
    return {
        tutorPrincipal: tutorId,
        ...activeAthleteFilter(),
    };
}

export function atletasDeTutoresFilter(tutorIds) {
    return {
        tutorPrincipal: { $in: mongoose.trusted(tutorIds) },
    };
}
