/** Métricas wellness para gráficos e historial (pre / post). */
export const WELLNESS_METRICS = [
  { key: 'sueno', label: 'Sueño', tipo: 'pre', scaleMax: 10, color: '#8b5cf6' },
  { key: 'estres', label: 'Estrés', tipo: 'pre', scaleMax: 10, color: '#f97316' },
  { key: 'fatiga', label: 'Fatiga', tipo: 'pre', scaleMax: 10, color: '#eab308' },
  { key: 'dolorMuscular', label: 'Dolor muscular', tipo: 'pre', scaleMax: 10, color: '#ef4444' },
  { key: 'rpe', label: 'RPE', tipo: 'post', scaleMax: 10, color: '#f59e0b' },
];

export const WELLNESS_PRE_FIELDS = WELLNESS_METRICS.filter((m) => m.tipo === 'pre');

/** Etiquetas cortas para la fila de promedios en la tarjeta del atleta. */
export const WELLNESS_CARD_LABELS = {
  sueno: 'Sueño',
  estres: 'Estrés',
  fatiga: 'Fatiga',
  dolorMuscular: 'Dolor',
  rpe: 'RPE',
};
