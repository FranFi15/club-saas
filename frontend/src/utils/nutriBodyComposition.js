import { canonicalMetricName, DURNIN_WOMERSLEY_PLIEGUE_NAMES } from '../constants/nutritionMetrics';

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Coeficientes Durnin & Womersley (1974) por sexo y edad. */
const DURNIN_TABLE = {
  M: [
    { maxAge: 19, c: 1.162, m: 0.063 },
    { maxAge: 29, c: 1.1631, m: 0.0632 },
    { maxAge: 39, c: 1.1422, m: 0.0544 },
    { maxAge: 49, c: 1.162, m: 0.07 },
    { maxAge: 999, c: 1.1715, m: 0.0779 },
  ],
  F: [
    { maxAge: 19, c: 1.1549, m: 0.0678 },
    { maxAge: 29, c: 1.1599, m: 0.0717 },
    { maxAge: 39, c: 1.1423, m: 0.0632 },
    { maxAge: 49, c: 1.1333, m: 0.0612 },
    { maxAge: 999, c: 1.1339, m: 0.0645 },
  ],
};

const DURNIN_AGE_BAND_LABELS = {
  M: ['Hasta 19 años', '20 a 29 años', '30 a 39 años', '40 a 49 años', '50 años o más'],
  F: ['Hasta 19 años', '20 a 29 años', '30 a 39 años', '40 a 49 años', '50 años o más'],
};

function durninCoeffs(sexo, edad) {
  const key = sexo === 'F' ? 'F' : 'M';
  const age = Number(edad);
  const table = DURNIN_TABLE[key];
  if (!table) return null;
  const rowIndex = table.findIndex((r) => (Number.isNaN(age) ? r.maxAge === 29 : age <= r.maxAge));
  const row = rowIndex >= 0 ? table[rowIndex] : table[table.length - 1];
  const bandIndex = rowIndex >= 0 ? rowIndex : table.length - 1;
  return { ...row, bandIndex, ageRangeLabel: DURNIN_AGE_BAND_LABELS[key][bandIndex] };
}

/** Fórmula DC activa según sexo y edad (para mostrar en la UI). */
export function describeDurninFormula(sexo, edad) {
  const coeffs = durninCoeffs(sexo, edad);
  if (!coeffs) return null;
  const sexLabel = sexo === 'F' ? 'Mujeres' : 'Hombres';
  return {
    sexLabel,
    ageRangeLabel: coeffs.ageRangeLabel,
    dcFormula: `DC = ${coeffs.c} − (${coeffs.m} × log₁₀(Suma 4 pliegues))`,
    siriFormula: '% Grasa corporal = ((4,95 / DC) − 4,50) × 100',
    coeffs,
  };
}

export const BODY_FAT_METHODOLOGY = {
  title: 'La ecuación más utilizada a nivel mundial',
  intro:
    'La metodología científica más respetada y utilizada para calcular la grasa corporal mediante ISAK es el Protocolo de Dos Pasos de Durnin & Womersley (1974) combinado con la Ecuación de Siri (1956).',
  pliegues: 'Utiliza 4 pliegues específicos: Tríceps, Bíceps, Subescapular y Cresta ilíaca.',
  step1Title: 'Paso 1: Calcular la densidad corporal (DC)',
  step1Body:
    'Primero se suman los 4 pliegues y se calcula su logaritmo base 10 (log₁₀). La fórmula varía según el sexo y el rango de edad de la persona.',
  step1Examples: [
    'Hombres (20-29 años): DC = 1,1631 − (0,0632 × log₁₀(Suma 4 pliegues))',
    'Mujeres (20-29 años): DC = 1,1599 − (0,0717 × log₁₀(Suma 4 pliegues))',
  ],
  step2Title: 'Paso 2: Convertir a porcentaje de grasa (Ecuación de Siri)',
  step2Body:
    'Una vez que obtenés el valor de la densidad corporal (DC), aplicás la ecuación universal para saber el porcentaje de grasa real:',
  siriFormula: '% Grasa corporal = ((4,95 / DC) − 4,50) × 100',
};

export const BODY_FAT_METHOD_OPTIONS = [
  { value: 'durnin_siri', label: 'Durnin / Siri' },
  { value: 'carter', label: 'Carter' },
];

export function normalizeBodyFatMethod(raw) {
  return raw === 'carter' ? 'carter' : 'durnin_siri';
}

export function bodyFatMethodLabel(method) {
  return BODY_FAT_METHOD_OPTIONS.find((o) => o.value === normalizeBodyFatMethod(method))?.label || 'Durnin / Siri';
}

/** Resultado activo según método elegido para el atleta. */
export function activeBodyFatResult({ metodo, durnin, carter }) {
  const method = normalizeBodyFatMethod(metodo);
  const result = method === 'carter' ? carter : durnin;
  if (!result || result.fatPercent == null) return { method, result: null, label: bodyFatMethodLabel(method) };
  return { method, result, label: bodyFatMethodLabel(method) };
}

/**
 * @param {Record<string, number>} plieguesPorNombre — mm por nombre normalizado
 */
function pliegueVal(plieguesPorNombre, name) {
  const canon = normName(canonicalMetricName(name));
  const raw = normName(name);
  return plieguesPorNombre[canon] ?? plieguesPorNombre[raw];
}

export function sumDurninPliegues(plieguesPorNombre) {
  let sum = 0;
  let count = 0;
  for (const name of DURNIN_WOMERSLEY_PLIEGUE_NAMES) {
    const v = pliegueVal(plieguesPorNombre, name);
    if (v == null || Number.isNaN(v)) return null;
    sum += v;
    count += 1;
  }
  if (count !== 4 || sum <= 0) return null;
  return sum;
}

/**
 * Densidad corporal (Durnin & Womersley) y % grasa (Siri).
 * @returns {{ sum4, log10, density, fatPercent, ageBand } | null}
 */
export function calcBodyFatDurninSiri({ sexo, edad, plieguesPorNombre }) {
  const sum4 = sumDurninPliegues(plieguesPorNombre);
  if (sum4 == null) return null;

  const coeffs = durninCoeffs(sexo, edad);
  if (!coeffs) return null;

  const log10 = Math.log10(sum4);
  const density = coeffs.c - coeffs.m * log10;
  if (!Number.isFinite(density) || density <= 0) return null;

  const fatPercent = (4.95 / density - 4.5) * 100;
  if (!Number.isFinite(fatPercent)) return null;

  return {
    sum4,
    log10,
    density,
    fatPercent,
    ageBand: edad,
    formula: 'Durnin & Womersley (1974) + Siri (1956)',
  };
}

/** Extrae los 4 pliegues Durnin del último control (fecha más reciente con los 4 completos). */
export function latestDurninPlieguesFromMediciones(mediciones, defs) {
  const nameByDefId = new Map((defs || []).map((d) => [String(d._id), d.nombre]));
  const durninNorms = new Set(DURNIN_WOMERSLEY_PLIEGUE_NAMES.map((n) => normName(canonicalMetricName(n))));

  const byDate = new Map();
  for (const m of mediciones || []) {
    const nombre = m.metrica?.nombre || nameByDefId.get(String(m.metrica?._id));
    if (!nombre || !durninNorms.has(normName(canonicalMetricName(nombre)))) continue;
    const fecha =
      m.fechaMedicion?.slice?.(0, 10) ||
      (m.fechaMedicion ? new Date(m.fechaMedicion).toISOString().slice(0, 10) : null) ||
      (m.createdAt ? new Date(m.createdAt).toISOString().slice(0, 10) : null);
    if (!fecha) continue;
    const valor = Number(m.valor);
    if (Number.isNaN(valor)) continue;
    if (!byDate.has(fecha)) byDate.set(fecha, {});
    byDate.get(fecha)[normName(canonicalMetricName(nombre))] = valor;
  }

  const dates = [...byDate.keys()].sort().reverse();
  for (const fecha of dates) {
    const pliegues = byDate.get(fecha);
    const sum4 = sumDurninPliegues(pliegues);
    if (sum4 != null) return { fecha, pliegues, sum4 };
  }
  return null;
}

export function plieguesFromFormValues(defs, values) {
  const durninNorms = new Set(DURNIN_WOMERSLEY_PLIEGUE_NAMES.map((n) => normName(canonicalMetricName(n))));
  const out = {};
  for (const d of defs || []) {
    const key = normName(canonicalMetricName(d.nombre));
    if (!durninNorms.has(key)) continue;
    const raw = values?.[d._id];
    if (raw === undefined || String(raw).trim() === '') continue;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isNaN(n)) out[key] = n;
  }
  return out;
}
