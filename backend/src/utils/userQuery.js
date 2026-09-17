/**
 * Filtros de usuarios atleta "activos" para listados y vínculos tutor–atleta.
 * El modelo User usa `estado` (activo | inactivo | moroso), no un booleano `activo`.
 * Multi-rol: incluye usuarios con `atleta` en `roles` o como `rol` primario.
 */
import { roleQuery } from '../constants/userRoles.js';

export function activeAthleteFilter() {
    return {
        ...roleQuery('atleta'),
        estado: { $ne: 'inactivo' },
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
        tutorPrincipal: { $in: tutorIds },
        ...roleQuery('atleta'),
    };
}
