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

/** Filtro de usuarios por nombre/apellido/email (tokens AND). */
export function buildUserSearchFilter(search, { rol } = {}) {
  const trimmed = String(search || '').trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const filter = {};
  if (rol) filter.rol = rol;
  filter.$and = tokens.map((token) => {
    const rx = new RegExp(escapeRegex(token), 'i');
    return { $or: [{ nombre: rx }, { apellido: rx }, { email: rx }] };
  });
  return filter;
}

/** Filtro de atletas por nombre/apellido/email (tokens AND). */
export function buildAthleteSearchFilter(search, { rol = 'atleta' } = {}) {
  return buildUserSearchFilter(search, { rol });
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
