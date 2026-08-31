/** Etiquetas y filtros de rol para listados de admin */
export const USER_ROL_LABELS = {
  atleta: 'Atleta',
  tutor: 'Tutor',
  socio: 'Socio',
  profe: 'Profesor',
  preparador_fisico: 'Prep. físico',
  nutricionista: 'Nutricionista',
  psicologo: 'Psicólogo',
  administrativo: 'Administrativo',
  control_ingreso: 'Control de ingreso',
  colaborador: 'Colaborador',
  admin_club: 'Admin club',
};

export const USER_FILTER_ROLES = [
  'Todos',
  'atleta',
  'tutor',
  'socio',
  'profe',
  'preparador_fisico',
  'nutricionista',
  'psicologo',
  'administrativo',
  'control_ingreso',
  'colaborador',
];

export function userRoleFilterLabel(rol) {
  if (rol === 'Todos') return 'Todos';
  return USER_ROL_LABELS[rol] || rol;
}

export const USER_ROLE_FILTROS = USER_FILTER_ROLES.map((rol) => ({
  value: rol,
  label: userRoleFilterLabel(rol),
})).sort((a, b) => {
  if (a.value === 'Todos') return -1;
  if (b.value === 'Todos') return 1;
  return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
});
