/** Build SectionList sections for categories grouped by disciplina. */
export function categoriesGroupedByDisciplina(
  categories,
  { includeAll = false, allLabel = 'Todas las categorías' } = {},
) {
  const groups = new Map();
  for (const c of categories || []) {
    const disc = c.disciplina;
    const discId = String(disc?._id || disc || '__sin__');
    const discName = (disc && typeof disc === 'object' && disc.nombre) || 'Sin disciplina';
    if (!groups.has(discId)) {
      groups.set(discId, { title: discName, data: [] });
    }
    groups.get(discId).data.push({
      value: c._id,
      label: c.nombre || 'Categoría',
      disciplinaNombre: discName,
    });
  }

  const sections = [...groups.values()]
    .map((s) => ({
      title: s.title,
      data: [...s.data].sort((a, b) =>
        String(a.label).localeCompare(String(b.label), 'es', { sensitivity: 'base' }),
      ),
    }))
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'es', { sensitivity: 'base' }));

  if (includeAll) {
    return [{ title: '', data: [{ value: '', label: allLabel }] }, ...sections];
  }
  return sections;
}

/** Flat options with header rows (for lists that aren't SectionList). */
export function categoriesAsSectionedOptions(categories, opts) {
  const sections = categoriesGroupedByDisciplina(categories, opts);
  const rows = [];
  for (const s of sections) {
    if (s.title) {
      rows.push({ type: 'header', value: `__hdr_${s.title}`, label: s.title });
    }
    for (const item of s.data) {
      rows.push({ type: 'option', ...item });
    }
  }
  return rows;
}

export function categoryPillLabel(categories, categoryId, fallback = 'Categoría') {
  if (!categoryId) return fallback;
  const c = (categories || []).find((x) => String(x._id) === String(categoryId));
  if (!c) return fallback;
  const disc =
    c.disciplina && typeof c.disciplina === 'object' ? c.disciplina.nombre : null;
  if (disc) return `${disc} · ${c.nombre}`;
  return c.nombre || fallback;
}
