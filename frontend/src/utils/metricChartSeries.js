import { nutriAreaShortLabel } from '../constants/nutritionMetrics';

/** Serie temporal para gráfico de una métrica: [{ t: Date, value: number }] */
export function buildMetricTimeSeries(mediciones, metricId) {
  if (!metricId) return [];
  return (mediciones || [])
    .filter((m) => String(m.metrica?._id) === String(metricId))
    .map((m) => ({
      t: m.fechaMedicion ? new Date(m.fechaMedicion) : new Date(m.createdAt),
      value: Number(m.valor),
    }))
    .filter((p) => !Number.isNaN(p.value) && !Number.isNaN(p.t.getTime()))
    .sort((a, b) => a.t - b.t);
}

/** Definiciones que tienen al menos una medición cargada. */
export function defsWithChartData(mediciones, defs) {
  const ids = new Set(
    (mediciones || [])
      .filter((m) => m.metrica?._id)
      .map((m) => String(m.metrica._id)),
  );
  return (defs || []).filter((d) => ids.has(String(d._id)));
}

export function metricDropdownOptions(defs, { nutriLabels = false } = {}) {
  return (defs || []).map((d) => ({
    value: d._id,
    label: nutriLabels
      ? `${d.nombre} (${d.unidad}) · ${nutriAreaShortLabel(d.area)}`
      : `${d.nombre} (${d.unidad})`,
  }));
}

export function pickDefaultMetricId(defs, currentId) {
  if (!defs?.length) return '';
  if (currentId && defs.some((d) => String(d._id) === String(currentId))) return currentId;
  return defs[0]._id;
}
