import { WELLNESS_METRICS } from '../constants/wellnessMetrics';

const COLOR_BY_KEY = Object.fromEntries(WELLNESS_METRICS.map((m) => [m.key, m.color]));

/** Construye series por métrica a partir de la respuesta API (con colores para el gráfico). */
export function seriesFromHistorial(historial) {
  if (!historial) return [];
  const raw = Array.isArray(historial.series) ? historial.series : [];
  return raw.map((s) => ({
    ...s,
    color: s.color || COLOR_BY_KEY[s.key] || '#3b82f6',
  }));
}

/** Promedio por métrica en el período (solo series con puntos). */
export function wellnessMetricAverages(series) {
  return (series || [])
    .filter((s) => s.puntos?.length > 0)
    .map((s) => {
      const valores = (s.puntos || [])
        .map((p) => Number(p.valor))
        .filter((v) => !Number.isNaN(v));
      const avg = valores.reduce((acc, v) => acc + v, 0) / valores.length;
      const display = Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
      return {
        key: s.key,
        label: s.label,
        color: s.color || COLOR_BY_KEY[s.key] || '#3b82f6',
        tipo: s.tipo,
        avg,
        display,
        count: valores.length,
      };
    });
}

/** Valor en un registro del día (soporta datos antiguos en sueño). */
export function wellnessRecordValue(w, key) {
  if (!w) return null;
  const raw = w[key];
  if (raw != null && !Number.isNaN(Number(raw))) return Number(raw);
  if (key === 'sueno' && w.suenoCalidad != null && !Number.isNaN(Number(w.suenoCalidad))) {
    return Number(w.suenoCalidad);
  }
  return null;
}

/** Todas las fechas únicas ordenadas entre series. */
export function collectWellnessDates(series) {
  const set = new Set();
  (series || []).forEach((s) => {
    (s.puntos || []).forEach((p) => {
      if (p.fecha) set.add(p.fecha);
    });
  });
  return [...set].sort();
}
