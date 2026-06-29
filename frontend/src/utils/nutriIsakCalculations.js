import {
  CARTER_SIX_PLIEGUE_NAMES,
  canonicalMetricName,
  DURNIN_WOMERSLEY_PLIEGUE_NAMES,
  HEATH_ENDO_PLIEGUE_NAMES,
} from '../constants/nutritionMetrics';
import { calcBodyFatDurninSiri } from './nutriBodyComposition';

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function canonKey(nombre) {
  return normName(canonicalMetricName(nombre));
}

function parseNum(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function medDateKey(m) {
  const t = m.fechaMedicion ? new Date(m.fechaMedicion) : new Date(m.createdAt);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10);
}

export function valuesFromForm(defs, values) {
  const out = {};
  for (const d of defs || []) {
    const v = parseNum(values?.[d._id]);
    if (v == null) continue;
    out[canonKey(d.nombre)] = v;
  }
  return out;
}

export function latestValuesFromMediciones(mediciones, defs) {
  const nameById = new Map((defs || []).map((d) => [String(d._id), d.nombre]));
  const byCanon = new Map();

  for (const m of mediciones || []) {
    const nombre = m.metrica?.nombre || nameById.get(String(m.metrica?._id));
    if (!nombre) continue;
    const key = canonKey(nombre);
    const fecha = medDateKey(m);
    const valor = Number(m.valor);
    if (!fecha || Number.isNaN(valor)) continue;
    const prev = byCanon.get(key);
    if (!prev || fecha > prev.fecha) byCanon.set(key, { fecha, valor });
  }

  const out = {};
  byCanon.forEach((row, key) => {
    out[key] = row.valor;
  });
  return out;
}

export function buildIsakSnapshot({ mediciones, defs, formByBlock }) {
  const merged = { ...latestValuesFromMediciones(mediciones, defs) };
  for (const block of Object.values(formByBlock || {})) {
    if (!block?.defs) continue;
    Object.assign(merged, valuesFromForm(block.defs, block.values));
  }
  return merged;
}

function pick(snapshot, ...aliases) {
  for (const a of aliases) {
    const v = snapshot[canonKey(a)];
    if (v != null && !Number.isNaN(v)) return v;
  }
  return null;
}

function sumPliegues(snapshot, names) {
  let sum = 0;
  for (const name of names) {
    const v = pick(snapshot, name);
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

export function calcCarterSixFat({ sexo, snapshot }) {
  const sum6 = sumPliegues(snapshot, CARTER_SIX_PLIEGUE_NAMES);
  if (sum6 == null) return null;
  const fatPercent = sexo === 'F' ? 0.1548 * sum6 + 3.58 : 0.1051 * sum6 + 2.585;
  if (!Number.isFinite(fatPercent)) return null;
  return { sum6, fatPercent, formula: 'Carter (6 pliegues)' };
}

function correctedGirth(perimetro, pliegueMm) {
  if (perimetro == null || pliegueMm == null) return null;
  return perimetro - (Math.PI * pliegueMm) / 10;
}

export function calcLeeMuscleMass(snapshot) {
  const talla = pick(snapshot, 'Estatura', 'Talla');
  const brazoRel = pick(snapshot, 'Brazo relajado');
  const pantMax = pick(snapshot, 'Pantorrilla máxima');
  const triceps = pick(snapshot, 'Tríceps');
  const pantPliegue = pick(snapshot, 'Pantorrilla medial');
  const musloPliegue = pick(snapshot, 'Muslo medial');
  const musloPer = pick(snapshot, 'Perímetro muslo medial');

  if (talla == null) return { error: 'Falta estatura (cm).' };

  const cag = correctedGirth(brazoRel, triceps);
  const cpg = correctedGirth(pantMax, pantPliegue);
  const ccg = musloPer != null ? correctedGirth(musloPer, musloPliegue) : null;

  if (cag == null || cpg == null) {
    return { error: 'Faltan brazo relajado, tríceps y/o pantorrilla máxima con su pliegue.' };
  }

  const muscleKg =
    talla *
      (0.00533 * cag ** 2 + (ccg != null ? 0.00641 * ccg ** 2 : 0) + 0.00412 * cpg ** 2) -
    2.44;

  if (!Number.isFinite(muscleKg)) return { error: 'No se pudo calcular la masa muscular.' };

  return {
    muscleKg,
    cag,
    ccg,
    cpg,
    partial: ccg == null,
    note:
      ccg == null
        ? 'Perfil restringido (17 med.): sin perímetro de muslo; Lee calculado sin CCG.'
        : null,
    formula: 'Lee — masa muscular (kg)',
  };
}

export function calcHeathCarterSomatotype(snapshot) {
  const estatura = pick(snapshot, 'Estatura', 'Talla');
  const peso = pick(snapshot, 'Masa corporal', 'Peso');
  const femur = pick(snapshot, 'Bicondíleo del fémur', 'Biepicondíleo del fémur');
  const brazoRel = pick(snapshot, 'Brazo relajado');
  const pantMax = pick(snapshot, 'Pantorrilla máxima');
  const triceps = pick(snapshot, 'Tríceps');
  const pantPliegue = pick(snapshot, 'Pantorrilla medial');

  let endomorphy = null;
  const sum3 = sumPliegues(snapshot, HEATH_ENDO_PLIEGUE_NAMES);
  if (sum3 != null && estatura != null) {
    const x = sum3 * (170.18 / estatura);
    endomorphy = -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3;
  }

  let mesomorphy = null;
  const cag = correctedGirth(brazoRel, triceps);
  const cpg = correctedGirth(pantMax, pantPliegue);
  if (estatura != null && femur != null && cag != null && cpg != null) {
    mesomorphy = 0.601 * femur + 0.188 * cag + 0.161 * cpg - 0.131 * estatura + 4.5;
  }

  let ectomorphy = null;
  let ipr = null;
  if (estatura != null && peso != null && peso > 0) {
    ipr = estatura / Math.cbrt(peso);
    if (ipr >= 40.75) ectomorphy = 0.732 * ipr - 28.58;
    else if (ipr > 38.25) ectomorphy = 0.463 * ipr - 17.63;
    else ectomorphy = 0.1;
  }

  if (endomorphy == null && mesomorphy == null && ectomorphy == null) {
    return { error: 'Faltan medidas para el somatotipo (básicos, pliegues y perímetros).' };
  }

  return {
    endomorphy: endomorphy != null ? Math.round(endomorphy * 10) / 10 : null,
    mesomorphy: mesomorphy != null ? Math.round(mesomorphy * 10) / 10 : null,
    ectomorphy: ectomorphy != null ? Math.round(ectomorphy * 10) / 10 : null,
    ipr: ipr != null ? Math.round(ipr * 100) / 100 : null,
    mesoNote: 'Mesomorfismo sin diámetro humeral (perfil restringido de 17 medidas).',
    formula: 'Heath-Carter',
  };
}

export function computeIsakResults({ sexo, edad, snapshot }) {
  const pliegues = {};
  for (const name of [
    ...new Set([
      ...DURNIN_WOMERSLEY_PLIEGUE_NAMES,
      ...CARTER_SIX_PLIEGUE_NAMES,
      ...HEATH_ENDO_PLIEGUE_NAMES,
    ]),
  ]) {
    const v = pick(snapshot, name);
    if (v != null) pliegues[normName(canonicalMetricName(name))] = v;
  }

  return {
    durnin: sexo ? calcBodyFatDurninSiri({ sexo, edad, plieguesPorNombre: pliegues }) : null,
    carter: sexo ? calcCarterSixFat({ sexo, snapshot }) : null,
    lee: calcLeeMuscleMass(snapshot),
    somato: calcHeathCarterSomatotype(snapshot),
  };
}
