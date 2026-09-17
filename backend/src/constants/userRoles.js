/** Roles disponibles en esta versión de la app (sin médico / kinesiólogo). */
export const ASSIGNABLE_USER_ROLES = [
    'admin_club',
    'administrativo',
    'control_ingreso',
    'colaborador',
    'profe',
    'preparador_fisico',
    'nutricionista',
    'psicologo',
    'atleta',
    'tutor',
    'socio',
];

/** Roles de cliente del club (pagan cuotas, no gestionan). */
export const CLIENT_USER_ROLES = ['atleta', 'tutor', 'socio'];

/** @deprecated v2 — conservado en BD por compatibilidad */
export const DEPRECATED_USER_ROLES = ['medico', 'kinesiologo'];

export const ALL_USER_ROLES = [...ASSIGNABLE_USER_ROLES, ...DEPRECATED_USER_ROLES];

export const CLUB_OWNER_ROLES = ['admin_club'];

export function isAssignableUserRole(rol) {
    return ASSIGNABLE_USER_ROLES.includes(rol);
}

/** Solo admin_club puede crear o asignar el rol admin_club */
export function canAssignUserRole(actorRol, targetRol) {
    if (targetRol === 'admin_club' && actorRol !== 'admin_club') return false;
    return true;
}

/**
 * Normalized roles list for a user doc. Backfills from `rol` when `roles` is empty.
 * @param {{ rol?: string, roles?: string[] } | null | undefined} user
 * @returns {string[]}
 */
export function normalizeUserRoles(user) {
    if (!user) return [];
    const fromArr = Array.isArray(user.roles)
        ? user.roles.filter((r) => typeof r === 'string' && r)
        : [];
    const unique = [...new Set(fromArr)];
    if (unique.length > 0) {
        if (user.rol && !unique.includes(user.rol)) unique.unshift(user.rol);
        return unique;
    }
    return user.rol ? [user.rol] : [];
}

/**
 * Resolve primary `rol` + `roles` from admin input.
 * @param {string[]|undefined} rolesInput
 * @param {string|undefined} primaryRol
 * @returns {{ rol: string, roles: string[] }}
 */
export function resolveRolesWrite(rolesInput, primaryRol) {
    let roles = Array.isArray(rolesInput)
        ? [...new Set(rolesInput.filter((r) => typeof r === 'string' && r))]
        : [];
    if (roles.length === 0 && primaryRol) roles = [primaryRol];
    if (roles.length === 0) {
        throw new Error('Se requiere al menos un rol');
    }
    let rol = primaryRol && roles.includes(primaryRol) ? primaryRol : roles[0];
    if (!roles.includes(rol)) roles = [rol, ...roles];
    return { rol, roles: [...new Set(roles)] };
}

/** True if user has the role as primary or in roles[]. */
export function userHasRole(user, rol) {
    return normalizeUserRoles(user).includes(rol);
}

/** Mongo filter: user has this role as primary or in roles[]. */
export function roleQuery(rol) {
    return { $or: [{ rol }, { roles: rol }] };
}

/** Mongo filter: user has any of the given roles. */
export function roleQueryMany(roles) {
    const list = Array.isArray(roles) ? roles.filter(Boolean) : [];
    if (list.length === 0) return { _id: null };
    if (list.length === 1) return roleQuery(list[0]);
    return {
        $or: [{ rol: { $in: list } }, { roles: { $in: list } }],
    };
}

/**
 * Persist roles backfill when missing (login / protect).
 * Uses `_primaryRol` when protect overrode `rol` for the session.
 * @returns {Promise<string[]>}
 */
export async function ensureUserRolesPersisted(user) {
    if (!user) return [];
    const primary = user._primaryRol || user.rol;
    const roles = normalizeUserRoles({ rol: primary, roles: user.roles });
    const current = Array.isArray(user._doc?.roles)
        ? user._doc.roles
        : Array.isArray(user.roles)
          ? user.roles
          : [];
    const needsSave =
        current.length === 0 ||
        current.length !== roles.length ||
        roles.some((r) => !current.includes(r));
    if (needsSave) {
        const activeSessionRol = user.rol;
        user.roles = roles;
        user.rol = roles.includes(primary) ? primary : roles[0];
        await user.save();
        // Restore session active rol in-memory for the rest of the request.
        user._primaryRol = user.rol;
        user.rol = activeSessionRol;
        if (typeof user.unmarkModified === 'function') {
            user.unmarkModified('rol');
        }
    }
    return roles;
}
