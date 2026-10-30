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

function idStr(value) {
    if (!value) return '';
    if (typeof value === 'object' && value._id != null) return String(value._id);
    return String(value);
}

/** Tutor de facturación más los demás tutores vinculados al atleta. */
export function tutorIdsOf(atleta) {
    const ids = [];
    const push = (value) => {
        const id = idStr(value);
        if (id && !ids.includes(id)) ids.push(id);
    };
    push(atleta?.tutorPrincipal);
    for (const tutor of atleta?.tutores || []) push(tutor);
    return ids;
}

export function isTutorOf(atleta, tutorId) {
    const id = idStr(tutorId);
    return Boolean(id) && tutorIdsOf(atleta).includes(id);
}

/** Atletas a cargo del tutor de facturación. El descuento familiar sigue contando solo estos. */
export function hijosDelTutorFilter(tutorId) {
    return {
        tutorPrincipal: tutorId,
        ...activeAthleteFilter(),
    };
}

/** Atletas que este tutor puede ver: es el principal o está en tutores. */
export function hijosVinculadosFilter(tutorId) {
    return {
        $and: [
            { $or: [{ tutorPrincipal: tutorId }, { tutores: tutorId }] },
            activeAthleteFilter(),
        ],
    };
}

export function atletasDeTutoresFilter(tutorIds) {
    return {
        $and: [
            {
                $or: [
                    { tutorPrincipal: { $in: tutorIds } },
                    { tutores: { $in: tutorIds } },
                ],
            },
            roleQuery('atleta'),
        ],
    };
}
