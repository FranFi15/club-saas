/** Extrae filas de respuestas paginadas o arrays legacy. */
export function pickPaginatedRows(data, key) {
  if (!data) return [];
  if (Array.isArray(data[key])) return data[key];
  if (Array.isArray(data)) return data;
  return [];
}

export function pickPaginationMeta(data) {
  return {
    page: data?.page ?? 1,
    hasMore: Boolean(data?.hasMore),
    total: data?.total ?? 0,
  };
}
