/** Roles que usan la app de administración completa */
export const ADMIN_APP_ROLES = ['admin_club', 'administrativo'];

/** Solo escáner QR de ingreso (sin menús de gestión) */
export const CLUB_SCANNER_ONLY_ROLES = ['control_ingreso'];

/** Dueño del club: personalización, estructura y finanzas avanzadas */
export const CLUB_OWNER_ROLES = ['admin_club'];

/** Administración operativa del día a día (sin personalizar el club) */
export const CLUB_OPS_ROLES = ['administrativo'];

/** Quienes pueden publicar noticias como admin (alineado con POST /news) */
export const CLUB_NEWS_AUTHOR_ROLES = ['admin_club'];

export function isClubOwnerRole(rol) {
  return CLUB_OWNER_ROLES.includes(rol);
}

export function isClubOpsRole(rol) {
  return CLUB_OPS_ROLES.includes(rol);
}

export function isScannerOnlyAdminRole(rol) {
  return CLUB_SCANNER_ONLY_ROLES.includes(rol);
}

/** Cuerpo técnico / salud (no finanzas ni estructura global) */
export const STAFF_APP_ROLES = [
  'profe',
  'preparador_fisico',
  'nutricionista',
  'psicologo',
];

/** Quienes pueden crear noticias (alineado con POST /news) */
export const STAFF_NEWS_AUTHOR_ROLES = ['profe', 'nutricionista', 'psicologo', 'preparador_fisico'];

/** Ver grilla semanal */
export const STAFF_AGENDA_ROLES = ['profe', 'preparador_fisico'];

export const ATHLETE_APP_ROLES = ['atleta'];
export const TUTOR_APP_ROLES = ['tutor'];

/** Quienes pueden mostrar QR de ingreso al club */
export const CLUB_ENTRY_QR_ROLES = ['atleta', 'tutor', ...STAFF_APP_ROLES];

export function resolveMainNavigator(rol) {
  if (!rol) return 'MemberPlaceholder';
  if (isScannerOnlyAdminRole(rol)) return 'ControlIngresoHome';
  if (ADMIN_APP_ROLES.includes(rol)) return 'AdminHome';
  if (rol === 'profe') return 'CoachHome';
  if (STAFF_APP_ROLES.includes(rol)) return 'StaffHome';
  if (ATHLETE_APP_ROLES.includes(rol)) return 'AthleteHome';
  if (TUTOR_APP_ROLES.includes(rol)) return 'TutorHome';
  return 'MemberPlaceholder';
}
