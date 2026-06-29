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
