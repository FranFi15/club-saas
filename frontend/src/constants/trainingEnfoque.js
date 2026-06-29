/** Alineado con `backend/src/models/training.model.js` → bloques[].enfoque */
export const ENFOQUE_KEYS = [
  'ofensivo',
  'defensivo',
  'transicion_ataque',
  'transicion_defensa',
  'fisico',
  'tecnico',
  'neutro',
];

export const ENFOQUE_LABELS = {
  ofensivo: 'Ofensivo',
  defensivo: 'Defensivo',
  transicion_ataque: 'Tr. ataque',
  transicion_defensa: 'Tr. defensa',
  fisico: 'Físico',
  tecnico: 'Técnico',
  neutro: 'Neutro',
};

export const ENFOQUE_COLORS = {
  ofensivo: '#ef4444',
  defensivo: '#3b82f6',
  transicion_ataque: '#f59e0b',
  transicion_defensa: '#8b5cf6',
  fisico: '#10b981',
  tecnico: '#06b6d4',
  neutro: '#6b7280',
};
