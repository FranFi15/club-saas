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

/** Orden de chips en filtros por área del staff. */
export const STAFF_ROL_FILTER_ORDER = [
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
];
