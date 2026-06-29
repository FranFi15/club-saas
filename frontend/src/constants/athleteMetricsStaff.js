import { isPliegueArea } from './nutritionMetrics';

/** Filtros del gráfico del atleta: por rol del profesional que registró la medición. */
export const ATHLETE_METRICS_STAFF_FILTERS = [
  {
    id: 'nutricionista',
    label: 'Nutrición',
    subtitle: 'Pliegues ISAK y diámetros óseos',
    roles: ['nutricionista'],
    icon: 'restaurant-outline',
  },
  {
    id: 'preparador_fisico',
    label: 'Preparador físico',
    subtitle: 'Mediciones físicas y rendimiento',
    roles: ['preparador_fisico'],
    icon: 'barbell-outline',
  },
  {
    id: 'profe',
    label: 'Entrenador',
    subtitle: 'Mediciones del cuerpo técnico',
    roles: ['profe'],
    icon: 'football-outline',
  },
];

/** Si el evaluador no trae rol, se infiere por el área de la métrica. */
export function inferStaffBucketFromMedicion(m) {
  const area = m.metrica?.area;
  if (isPliegueArea(area) || area === 'diametros_oseos') return 'nutricionista';
  if (area === 'fisico') return 'preparador_fisico';
  return null;
}

export function medicionStaffBucket(m) {
  const rol = m.evaluador?.rol;
  if (rol) {
    const hit = ATHLETE_METRICS_STAFF_FILTERS.find((f) => f.roles.includes(rol));
    if (hit) return hit.id;
  }
  return inferStaffBucketFromMedicion(m);
}

export function filterMedicionesByStaff(mediciones, staffId) {
  if (!staffId) return mediciones;
  return (mediciones || []).filter((m) => medicionStaffBucket(m) === staffId);
}

export function staffFiltersWithData(mediciones) {
  return ATHLETE_METRICS_STAFF_FILTERS.filter((f) =>
    (mediciones || []).some((m) => medicionStaffBucket(m) === f.id),
  );
}
