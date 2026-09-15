export function formatRolStaff(rol) {
  const map = {
    profe: 'Entrenador/a',
    preparador_fisico: 'Preparador/a físico',
    nutricionista: 'Nutricionista',
    psicologo: 'Psicología',
    admin_club: 'Administración',
    administrativo: 'Administración',
    control_ingreso: 'Control de ingreso',
    colaborador: 'Colaborador',
    medico: 'Médico/a',
    kinesiologo: 'Kinesiología',
  };
  return map[rol] || rol;
}

/** Orden alfabético de chips en filtros por área del staff. */
export function sortStaffRolesAlpha(roles) {
  return [...roles].sort((a, b) =>
    formatRolStaff(a).localeCompare(formatRolStaff(b), 'es', { sensitivity: 'base' }),
  );
}

/** Lista fija de roles staff ordenada alfabéticamente por etiqueta. */
export const STAFF_ROL_FILTER_ORDER = sortStaffRolesAlpha([
  'profe',
  'preparador_fisico',
  'nutricionista',
  'psicologo',
  'admin_club',
  'administrativo',
  'control_ingreso',
  'colaborador',
  'medico',
  'kinesiologo',
]);
