import { isPliegueArea, nutriAreaShortLabel } from '../constants/nutritionMetrics';

export const NUTRI_CHART_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#f97316',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#6366f1',
  '#0ea5e9',
  '#a855f7',
];

export const NUTRI_PLIEGUES_AVG_KEY = '__pliegues_promedio_isak__';

/** Fecha calendario YYYY-MM-DD para alinear series en el gráfico. */
export function measurementDateKey(m) {
  const t = m.fechaMedicion ? new Date(m.fechaMedicion) : new Date(m.createdAt);
  if (Number.isNaN(t.getTime())) return null;
  const y = t.getFullYear();
  const mo = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function mergePointsByDate(puntos) {
  const map = new Map();
  for (const p of puntos) {
    if (!p.fecha || Number.isNaN(p.valor)) continue;
    if (!map.has(p.fecha)) map.set(p.fecha, []);
    map.get(p.fecha).push(p.valor);
  }
  return [...map.entries()]
    .map(([fecha, vals]) => ({
      fecha,
      valor: vals.reduce((acc, v) => acc + v, 0) / vals.length,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function collectNutriDates(series) {
  const set = new Set();
  (series || []).forEach((s) => {
    (s.puntos || []).forEach((p) => {
      if (p.fecha) set.add(p.fecha);
    });
  });
  return [...set].sort();
}

function matchesSearch(label, needle) {
  if (!needle) return true;
  return label.toLowerCase().includes(needle);
}

/**
 * Series para gráfico nutricionista: cada métrica con datos + promedio ISAK de pliegues por fecha.
 */
export function buildNutriChartSeries(historialMedidas, defs, { search = '', avgColor = '#0f172a', metricId = '' } = {}) {
  const needle = search.trim().toLowerCase();
  const rows = Array.isArray(historialMedidas) ? historialMedidas : [];
  const definitions = Array.isArray(defs) ? defs : [];
  const series = [];
  let colorIdx = 0;

  const pliegueByDate = new Map();

  for (const def of definitions) {
    const raw = [];
    for (const m of rows) {
      if (String(m.metrica?._id) !== String(def._id)) continue;
      const fecha = measurementDateKey(m);
      const valor = Number(m.valor);
      if (!fecha || Number.isNaN(valor)) continue;
      raw.push({ fecha, valor });
      if (isPliegueArea(m.metrica?.area)) {
        if (!pliegueByDate.has(fecha)) pliegueByDate.set(fecha, []);
        pliegueByDate.get(fecha).push(valor);
      }
    }
    const puntos = mergePointsByDate(raw);
    if (puntos.length === 0) continue;
    const label = def.nombre || 'Medida';
    if (!matchesSearch(label, needle)) continue;
    series.push({
      key: String(def._id),
      label,
      unit: def.unidad || 'mm',
      area: def.area,
      color: NUTRI_CHART_COLORS[colorIdx % NUTRI_CHART_COLORS.length],
      puntos,
      isAverage: false,
    });
    colorIdx += 1;
  }

  const avgPuntos = [...pliegueByDate.entries()]
    .map(([fecha, vals]) => ({
      fecha,
      valor: vals.reduce((acc, v) => acc + v, 0) / vals.length,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const avgLabel = 'Promedio pliegues (ISAK)';
  const showAvg =
    avgPuntos.length > 0 &&
    (!needle || matchesSearch(avgLabel, needle) || matchesSearch('isak', needle) || matchesSearch('promedio', needle));
  if (showAvg) {
    series.unshift({
      key: NUTRI_PLIEGUES_AVG_KEY,
      label: avgLabel,
      unit: 'mm',
      area: 'metodologia_isak',
      color: avgColor,
      puntos: avgPuntos,
      isAverage: true,
    });
  }

  if (metricId) {
    const id = String(metricId);
    return series.filter((s) => String(s.key) === id);
  }

  return series;
}

/** Opciones para filtrar el gráfico nutricionista a una sola serie. */
export function nutriChartFilterOptions(mediciones, defs) {
  return buildNutriChartSeries(mediciones, defs, {}).map((s) => ({
    value: s.key,
    label: s.isAverage
      ? s.label
      : `${s.label} (${s.unit}) · ${nutriAreaShortLabel(s.area)}`,
  }));
}

export function pickDefaultFilterId(options, currentId) {
  if (!options?.length) return '';
  if (currentId && options.some((o) => String(o.value) === String(currentId))) return currentId;
  return options[0].value;
}

/** Último punto de una serie del gráfico nutricionista. */
export function seriesLatestPunto(s) {
  const pts = s?.puntos;
  if (!pts?.length) return null;
  const last = pts[pts.length - 1];
  const valor = Number(last.valor);
  if (Number.isNaN(valor)) return null;
  const display = Number.isInteger(valor) ? String(valor) : (Math.round(valor * 10) / 10).toFixed(1);
  return { fecha: last.fecha, valor, display };
}

export function formatNutriChartDate(fecha) {
  if (!fecha) return '—';
  const parts = String(fecha).split('-');
  if (parts.length !== 3) return fecha;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Agrupa series por unidad (mm, cm, …) para ejes comparables. */
export function groupNutriSeriesByUnit(series) {
  const groups = new Map();
  for (const s of series || []) {
    const unit = s.unit || '—';
    if (!groups.has(unit)) groups.set(unit, []);
    groups.get(unit).push(s);
  }
  const order = ['mm', 'cm', '%', 'kg'];
  return [...groups.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function scaleMaxForNutriGroup(seriesList) {
  let max = 0;
  for (const s of seriesList) {
    for (const p of s.puntos || []) {
      const v = Number(p.valor);
      if (!Number.isNaN(v)) max = Math.max(max, v);
    }
  }
  if (max <= 0) return 10;
  const padded = max * 1.08;
  return Number.isInteger(padded) ? padded + 1 : Math.ceil(padded * 10) / 10;
}

export function nutriLatestAverage(series) {
  const avg = (series || []).find((s) => s.key === NUTRI_PLIEGUES_AVG_KEY);
  if (!avg?.puntos?.length) return null;
  const last = avg.puntos[avg.puntos.length - 1];
  const v = Number(last.valor);
  if (Number.isNaN(v)) return null;
  return { fecha: last.fecha, valor: v, display: Number.isInteger(v) ? String(v) : v.toFixed(1) };
}
