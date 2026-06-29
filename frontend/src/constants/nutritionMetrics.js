/** Protocolo ISAK — Perfil restringido: 17 mediciones antropométricas. */



export const ISAK_BASIC_PRESETS = [

  { nombre: 'Masa corporal', unidad: 'kg', mejorDireccion: 'menor_es_mejor', area: 'datos_basicos' },

  { nombre: 'Estatura', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'datos_basicos' },

];



/** 8 pliegues cutáneos (mm) — orden ISAK perfil restringido. */

export const ISAK_SKINFOLD_PRESETS = [

  {

    nombre: 'Tríceps',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Línea media posterior del brazo, nivel acromio-radial.',

  },

  {

    nombre: 'Subescapular',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Ángulo inferior de la escápula, oblicuo 45°.',

  },

  {

    nombre: 'Bíceps',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Superficie anterior del brazo, nivel acromio-radial.',

  },

  {

    nombre: 'Cresta ilíaca',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Justo encima de la cresta ilíaca, línea axilar media.',

  },

  {

    nombre: 'Supraespinal',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Cresta ilíaca × pliegue axilar anterior hacia EIAS.',

  },

  {

    nombre: 'Abdominal',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: '5 cm a la derecha del ombligo, vertical.',

  },

  {

    nombre: 'Muslo medial',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Cara interna del muslo, mitad entre ingle y rótula.',

  },

  {

    nombre: 'Pantorrilla medial',

    unidad: 'mm',

    mejorDireccion: 'menor_es_mejor',

    area: 'metodologia_isak',

    sitio: 'Cara interna de la pierna, perímetro máximo de pantorrilla.',

  },

];



/** 4 pliegues Durnin & Womersley (1974). */

export const DURNIN_WOMERSLEY_PLIEGUE_NAMES = ['Tríceps', 'Bíceps', 'Subescapular', 'Cresta ilíaca'];



/** 6 pliegues Carter (regresión directa deportiva). */

export const CARTER_SIX_PLIEGUE_NAMES = [

  'Tríceps',

  'Subescapular',

  'Supraespinal',

  'Abdominal',

  'Muslo medial',

  'Pantorrilla medial',

];



/** 3 pliegues endomorfismo Heath-Carter. */

export const HEATH_ENDO_PLIEGUE_NAMES = ['Tríceps', 'Subescapular', 'Supraespinal'];



/** 2 diámetros óseos (cm) — perfil restringido. */

export const ISAK_BONE_DIAMETER_PRESETS = [

  {

    nombre: 'Biestiloideo',

    unidad: 'cm',

    mejorDireccion: 'mayor_es_mejor',

    area: 'diametros_oseos',

    sitio: 'Muñeca — diámetro del estiloide radial.',

  },

  {

    nombre: 'Bicondíleo del fémur',

    unidad: 'cm',

    mejorDireccion: 'mayor_es_mejor',

    area: 'diametros_oseos',

    sitio: 'Rodilla — distancia entre epicóndilos femorales.',

  },

];



/** 5 perímetros / circunferencias (cm). */

export const ISAK_PERIMETER_PRESETS = [

  { nombre: 'Brazo relajado', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },

  {

    nombre: 'Brazo flexionado y en tensión',

    unidad: 'cm',

    mejorDireccion: 'mayor_es_mejor',

    area: 'perimetros',

  },

  { nombre: 'Cintura', unidad: 'cm', mejorDireccion: 'menor_es_mejor', area: 'perimetros' },

  { nombre: 'Cadera (glúteo)', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },

  { nombre: 'Pantorrilla máxima', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },

];



/** Nombres históricos del club → nombre canónico del perfil restringido. */

export const ISAK_LEGACY_NAME_ALIASES = {

  peso: 'masa corporal',

  talla: 'estatura',

  'muslo anterior': 'muslo medial',

  'cintura (minimo)': 'cintura',

  'cintura (mínimo)': 'cintura',

  'pantorrilla (maximo)': 'pantorrilla máxima',

  'pantorrilla (máximo)': 'pantorrilla máxima',

  'brazo flexionado y contraido': 'brazo flexionado y en tensión',

  'brazo flexionado y contraído': 'brazo flexionado y en tensión',

  'biepicondileo del femur': 'bicondíleo del fémur',

  'biepicondíleo del fémur': 'bicondíleo del fémur',

  'biestiloideo (muneca)': 'biestiloideo',

  'biestiloideo (muñeca)': 'biestiloideo',

};



export const NUTRITION_METRIC_PRESETS = [

  ...ISAK_BASIC_PRESETS,

  ...ISAK_SKINFOLD_PRESETS,

  ...ISAK_PERIMETER_PRESETS,

  ...ISAK_BONE_DIAMETER_PRESETS,

];



export const ISAK_RESTRICTED_METRIC_COUNT = NUTRITION_METRIC_PRESETS.length;

/** @deprecated usar ISAK_RESTRICTED_METRIC_COUNT */

export const ISAK_STANDARD_METRIC_COUNT = ISAK_RESTRICTED_METRIC_COUNT;



export const NUTRI_MEASUREMENT_AREAS = [

  'datos_basicos',

  'metodologia_isak',

  'perimetros',

  'diametros_oseos',

  'pliegues_cutaneos',

];



export const NUTRI_AREA_OPTS = [

  {

    value: 'datos_basicos',

    label: 'Medidas básicas',

    shortLabel: 'Básico',

    defaultUnit: 'kg',

    description: 'Masa corporal (kg) y estatura (cm).',

  },

  {

    value: 'metodologia_isak',

    label: 'Pliegues cutáneos',

    shortLabel: 'Pliegue',

    defaultUnit: 'mm',

    description: '8 pliegues ISAK en milímetros.',

  },

  {

    value: 'perimetros',

    label: 'Perímetros',

    shortLabel: 'Perímetro',

    defaultUnit: 'cm',

    description: '5 circunferencias (brazos, cintura, cadera, pantorrilla).',

  },

  {

    value: 'diametros_oseos',

    label: 'Diámetros óseos',

    shortLabel: 'Diámetro',

    defaultUnit: 'cm',

    description: 'Biestiloideo (muñeca) y bicondíleo del fémur.',

  },

];



export const NUTRI_AREA_LABELS = {

  datos_basicos: 'Medidas básicas',

  metodologia_isak: 'Pliegues (ISAK)',

  diametros_oseos: 'Diámetros óseos',

  perimetros: 'Perímetros',

  pliegues_cutaneos: 'Pliegues (anterior)',

  fisico: 'Físico',

};



/** Bloques de gráfico — orden del perfil restringido. */

export const NUTRI_CHART_GROUP_META = [

  {

    key: 'basicos',

    title: 'Medidas básicas',

    subtitle: 'Masa corporal y estatura',

    match: (s) => s.area === 'datos_basicos',

  },

  {

    key: 'pliegues',

    title: 'Pliegues cutáneos (8)',

    subtitle: '8 pliegues en mm · línea destacada = promedio del día',

    match: (s) => s.isAverage || s.area === 'metodologia_isak' || s.area === 'pliegues_cutaneos',

  },

  {

    key: 'perimetros',

    title: 'Perímetros (5)',

    subtitle: 'Circunferencias en cm',

    match: (s) => s.area === 'perimetros',

  },

  {

    key: 'diametros',

    title: 'Diámetros óseos (2)',

    subtitle: 'Biestiloideo y bicondíleo del fémur (cm)',

    match: (s) => s.area === 'diametros_oseos',

  },

];



/** Secciones del perfil nutricionista: gráfico agrupado + último valor por métrica. */

export const NUTRI_STRUCTURED_SECTIONS = [

  {

    key: 'pliegues',

    title: 'Pliegues cutáneos',

    subtitle: 'Todas las mediciones en mm',

    match: (s) => !s.isAverage && (s.area === 'metodologia_isak' || s.area === 'pliegues_cutaneos'),

    showLatestList: true,

  },

  {

    key: 'diametros',

    title: 'Diámetros óseos',

    subtitle: 'Biestiloideo y bicondíleo femoral (cm)',

    match: (s) => s.area === 'diametros_oseos',

    showLatestList: true,

  },

  {

    key: 'promedio',

    title: 'Promedio pliegues (ISAK)',

    subtitle: 'Promedio de los pliegues registrados el mismo día',

    match: (s) => s.isAverage,

    showLatestList: false,

    showLatestBanner: true,

  },

  {

    key: 'basicos',

    title: 'Peso y estatura',

    subtitle: 'Medidas básicas',

    match: (s) => s.area === 'datos_basicos',

    showLatestList: true,

  },

];



export function canonicalMetricName(nombre) {

  const n = String(nombre || '')

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .trim();

  return ISAK_LEGACY_NAME_ALIASES[n] || String(nombre || '').trim();

}



export function nutriAreaShortLabel(area) {

  if (area === 'datos_basicos') return 'Básico';

  if (area === 'metodologia_isak' || area === 'pliegues_cutaneos') return 'Pliegue';

  if (area === 'diametros_oseos') return 'Diámetro';

  if (area === 'perimetros') return 'Perímetro';

  return null;

}



export function isBasicArea(area) {

  return area === 'datos_basicos';

}



const BASIC_METRIC_NAMES = new Set(['peso', 'masa corporal', 'estatura', 'talla']);



export function isBasicMetricName(nombre) {

  const n = String(nombre || '')

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .trim();

  return BASIC_METRIC_NAMES.has(n);

}



export function isPliegueArea(area) {

  return area === 'metodologia_isak' || area === 'pliegues_cutaneos';

}



export function isDiametroArea(area) {

  return area === 'diametros_oseos';

}



export function isPerimetroArea(area) {

  return area === 'perimetros';

}



export function sortDefsLikePresets(defs, presets) {

  const order = new Map(presets.map((p, i) => [p.nombre.toLowerCase().trim(), i]));

  const legacyOrder = new Map(

    Object.entries(ISAK_LEGACY_NAME_ALIASES).map(([legacy, canon]) => {

      const idx = order.get(canon.toLowerCase().trim());

      return [legacy, idx ?? 999];

    }),

  );

  return [...defs].sort((a, b) => {

    const rank = (d) => {

      const raw = (d.nombre || '').toLowerCase().trim();

      const canon = canonicalMetricName(d.nombre).toLowerCase().trim();

      return order.get(canon) ?? order.get(raw) ?? legacyOrder.get(raw) ?? 999;

    };

    return rank(a) - rank(b);

  });

}



/** Orden protocolo ISAK perfil restringido. */

function defCanonicalKey(d) {
  return canonicalMetricName(d.nombre).toLowerCase().trim();
}

function pickPreferredDef(existing, candidate, presets) {
  const canon = defCanonicalKey(candidate);
  const preset = (presets || []).find((p) => p.nombre.toLowerCase() === canon);
  const score = (def) => {
    let s = 0;
    if (def._id && !String(def._id).startsWith('__')) s += 8;
    if (preset && (def.nombre || '').trim() === preset.nombre) s += 4;
    if (isBasicArea(def.area)) s += 2;
    return s;
  };
  return score(candidate) > score(existing) ? candidate : existing;
}

/** Una sola fila por nombre canónico (ej. Peso y Masa corporal → Masa corporal). */
export function dedupeDefsByCanonicalName(defs, presets) {
  const map = new Map();
  for (const d of defs || []) {
    const canon = defCanonicalKey(d);
    const prev = map.get(canon);
    map.set(canon, prev ? pickPreferredDef(prev, d, presets) : d);
  }
  return [...map.values()];
}

/** Asegura una fila de input por cada preset (aunque el club aún no tenga la definición en BD). */
export function defsAlignedToPresets(dbDefs, presets) {
  const sorted = sortDefsLikePresets(dedupeDefsByCanonicalName(dbDefs, presets), presets);
  const haveCanon = new Set(sorted.map((d) => defCanonicalKey(d)));
  const filled = [...sorted];
  (presets || []).forEach((p, i) => {
    const canon = p.nombre.toLowerCase();
    if (haveCanon.has(canon)) return;
    if (filled.some((d) => canonicalMetricName(d.nombre).toLowerCase() === canon)) return;
    filled.push({ ...p, _id: `__preset_${String(p.area)}_${i}` });
    haveCanon.add(canon);
  });
  return sortDefsLikePresets(filled, presets);
}

export function sortDefsByNutritionProtocol(defs) {

  const order = new Map(

    NUTRITION_METRIC_PRESETS.map((p, i) => [`${p.area}::${p.nombre}`.toLowerCase(), i]),

  );

  return [...(defs || [])].sort((a, b) => {

    const ka = `${a.area || ''}::${canonicalMetricName(a.nombre)}`.toLowerCase();

    const kb = `${b.area || ''}::${canonicalMetricName(b.nombre)}`.toLowerCase();

    const ra = order.get(ka) ?? order.get(`${a.area || ''}::${(a.nombre || '').toLowerCase()}`) ?? 999;

    const rb = order.get(kb) ?? order.get(`${b.area || ''}::${(b.nombre || '').toLowerCase()}`) ?? 999;

    return ra - rb;

  });

}


