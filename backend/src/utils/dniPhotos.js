import { normalizeUserRoles } from '../constants/userRoles.js';

export function canAccessDniPhotos(actor) {
    if (!actor) return false;
    const roles = normalizeUserRoles(actor);
    return roles.includes('admin_club') || roles.includes('administrativo');
}

/** Remove DNI photo URLs from a plain user object (or lean doc). */
export function stripDniPhotos(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = { ...obj };
    delete out.dniFotoFrente;
    delete out.dniFotoDorso;
    delete out.password;
    return out;
}

export function normalizeDniDigits(raw) {
    return String(raw || '').replace(/\D/g, '');
}
