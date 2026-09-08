import { isoCalendarYmd } from './dateDisplay';

const TIPO_LABELS = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  alquiler: 'Alquiler',
  consulta_nutricion: 'Consulta nutrición',
  consulta_psicologia: 'Consulta psicología',
};

export function sessionTipoLabel(tipo) {
  return TIPO_LABELS[tipo] || 'Sesión';
}

/** Nombre a mostrar: personalizado o etiqueta por tipo. */
export function sessionDisplayName(session) {
  const custom = (session?.nombreSesion || '').trim();
  if (custom) return custom;
  return sessionTipoLabel(session?.tipo);
}

export function sessionEsOpcional(session) {
  return session?.esOpcional === true;
}

export function isConsultaIndividual(session) {
  return session?.tipo === 'consulta_nutricion' || session?.tipo === 'consulta_psicologia';
}

export function consultaConfirmacionEstado(session) {
  return session?.confirmacionAtleta?.estado || null;
}

export function consultaConfirmacionLabel(estado) {
  if (estado === 'confirmada') return 'Asistencia confirmada';
  if (estado === 'rechazada') return 'Asistencia rechazada';
  if (estado === 'pendiente') return 'Pendiente de confirmación';
  return '';
}

export function consultaConfirmacionBorderColor(estado) {
  if (estado === 'confirmada') return '#22c55e';
  if (estado === 'rechazada') return '#ef4444';
  return null;
}

export function consultaNeedsConfirmacion(session) {
  return isConsultaIndividual(session) && consultaConfirmacionEstado(session) === 'pendiente';
}

function creatorRol(session) {
  const c = session?.creadoPor;
  if (!c || typeof c === 'string') return null;
  return c.rol || null;
}

/**
 * Kind visual de la sesión (más fino que `tipo` para distinguir PF vs coach).
 * @returns {'entrenamiento'|'partido'|'pf'|'nutricion'|'psicologia'|'alquiler'|'otro'}
 */
export function sessionKind(session) {
  const tipo = session?.tipo;
  if (tipo === 'partido') return 'partido';
  if (tipo === 'alquiler') return 'alquiler';
  if (tipo === 'consulta_nutricion') return 'nutricion';
  if (tipo === 'consulta_psicologia') return 'psicologia';
  if (tipo === 'entrenamiento' && creatorRol(session) === 'preparador_fisico') return 'pf';
  if (tipo === 'entrenamiento') return 'entrenamiento';
  return 'otro';
}

const KIND_VISUAL = {
  entrenamiento: {
    accentFixed: null,
    icon: 'fitness-outline',
    shortLabel: 'Entrenamiento',
  },
  pf: {
    accentFixed: '#0ea5e9',
    icon: 'barbell-outline',
    shortLabel: 'Prep. físico',
  },
  partido: {
    accentFixed: '#f59e0b',
    icon: 'trophy-outline',
    shortLabel: 'Partido',
  },
  nutricion: {
    accentFixed: '#14b8a6',
    icon: 'nutrition-outline',
    shortLabel: 'Nutrición',
  },
  psicologia: {
    accentFixed: '#6366f1',
    icon: 'happy-outline',
    shortLabel: 'Psicología',
  },
  alquiler: {
    accentFixed: '#d97706',
    icon: 'calendar-outline',
    shortLabel: 'Alquiler',
  },
  otro: {
    accentFixed: null,
    icon: 'ellipse-outline',
    shortLabel: 'Sesión',
  },
};

/**
 * Estilo visual por tipo/kind. Estado/confirmación deben aplicarse encima en la UI.
 * @returns {{ kind: string, accent: string, icon: string, shortLabel: string, tintBg: string }}
 */
export function sessionTipoVisual(session, { colorMarca = '#3b82f6' } = {}) {
  const kind = sessionKind(session);
  const base = KIND_VISUAL[kind] || KIND_VISUAL.otro;
  const accent = base.accentFixed || colorMarca;
  return {
    kind,
    accent,
    icon: base.icon,
    shortLabel: base.shortLabel,
    tintBg: `${accent}18`,
  };
}

/** Fin local de la sesión (fecha calendario + horaFin). */
export function sessionEndLocalDate(session) {
  const ymd = isoCalendarYmd(session?.fecha);
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const parts = String(session?.horaFin || '23:59').split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 23, Number.isFinite(mm) ? mm : 59, 0, 0);
}

/** True si la hora de fin ya pasó (calendario local del dispositivo). */
export function isSessionPast(session, now = new Date()) {
  const end = sessionEndLocalDate(session);
  if (!end) return false;
  return end.getTime() < now.getTime();
}

/**
 * Sesión solo lectura: completada, cancelada, o ya terminó el horario.
 * En ese caso se puede ver resumen/estadísticas, no editar.
 */
export function isSessionReadOnly(session, now = new Date()) {
  if (!session) return true;
  if (session.estado === 'completada' || session.estado === 'cancelada') return true;
  return isSessionPast(session, now);
}
