/** Roles disponibles en esta versión de la app (sin médico / kinesiólogo). */
export const ASSIGNABLE_USER_ROLES = [
    'admin_club',
    'administrativo',
    'control_ingreso',
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
    'atleta',
    'tutor',
];

/** @deprecated v2 — conservado en BD por compatibilidad */
export const DEPRECATED_USER_ROLES = ['medico', 'kinesiologo'];

export const CLUB_OWNER_ROLES = ['admin_club'];

export function isAssignableUserRole(rol) {
    return ASSIGNABLE_USER_ROLES.includes(rol);
}

/** Solo admin_club puede crear o asignar el rol admin_club */
export function canAssignUserRole(actorRol, targetRol) {
    if (targetRol === 'admin_club' && actorRol !== 'admin_club') return false;
    return true;
}
