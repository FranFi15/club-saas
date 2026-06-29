/**
 * Filtros de usuarios atleta "activos" para listados y vínculos tutor–atleta.
 * El modelo User usa `estado` (activo | inactivo | moroso), no un booleano `activo`.
 */
export function activeAthleteFilter() {
    return {
        rol: 'atleta',
        estado: { $ne: 'inactivo' },
    };
}

export function hijosDelTutorFilter(tutorId) {
    return {
        tutorPrincipal: tutorId,
        ...activeAthleteFilter(),
    };
}
