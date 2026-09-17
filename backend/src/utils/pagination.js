import { roleQuery, roleQueryMany } from '../constants/userRoles.js';

/**
 * @param {import('express').Request} req
 * @param {{ defaultLimit?: number, maxLimit?: number }} [opts]
 */
export function parsePageLimit(req, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  let limit = parseInt(req.query.limit, 10) || defaultLimit;
  limit = Math.min(Math.max(limit, 1), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function paginationMeta(page, limit, total) {
  const safeTotal = Math.max(Number(total) || 0, 0);
  const totalPages = Math.max(Math.ceil(safeTotal / limit) || 0, safeTotal > 0 ? 1 : 0);
  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasMore: page < totalPages,
  };
}

export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filtro de usuarios por nombre/apellido/email (tokens AND).
 * Multi-rol: `rol` / `roles` match primary `rol` or `roles[]`.
 * @param {string} search
 * @param {{ rol?: string, roles?: string[] }} [opts]
 */
export function buildUserSearchFilter(search, { rol, roles } = {}) {
  const trimmed = String(search || '').trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const and = tokens.map((token) => {
    const rx = new RegExp(escapeRegex(token), 'i');
    return { $or: [{ nombre: rx }, { apellido: rx }, { email: rx }] };
  });

  if (Array.isArray(roles) && roles.length) {
    and.push(roleQueryMany(roles));
  } else if (rol) {
    and.push(roleQuery(rol));
  }

  return { $and: and };
}

/** Filtro de atletas por nombre/apellido/email (tokens AND). */
export function buildAthleteSearchFilter(search, { rol = 'atleta', roles } = {}) {
  return buildUserSearchFilter(search, roles?.length ? { roles } : { rol });
}

/** Búsqueda de plantel: nombre, apellido, email o DNI. */
export function buildAthletePlantelSearchFilter(search) {
  const trimmed = String(search || '').trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return {
    $and: tokens.map((token) => {
      const rx = new RegExp(escapeRegex(token), 'i');
      return { $or: [{ nombre: rx }, { apellido: rx }, { email: rx }, { dni: rx }] };
    }),
  };
}
