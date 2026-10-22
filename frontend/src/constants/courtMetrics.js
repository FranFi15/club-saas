export const COURT_DEPORTES = [
  { key: 'basquet', label: 'Básquet' },
  { key: 'futbol', label: 'Fútbol' },
  { key: 'voley', label: 'Vóley' },
  { key: 'rugby', label: 'Rugby' },
  { key: 'hockey_cesped', label: 'Hockey césped' },
  { key: 'natacion', label: 'Natación' },
  { key: 'otro', label: 'Otro (subir imagen)' },
];

export const COURT_TIPOS_MEDICION = [
  {
    key: 'porcentaje',
    label: 'Aciertos / Intentos',
    inputHint: 'El atleta carga aciertos e intentos (se calcula el %).',
  },
  {
    key: 'tiempo',
    label: 'Tiempo',
    inputHint: 'El atleta carga un tiempo por punto (mm:ss.mmm).',
  },
  {
    key: 'total',
    label: 'Total',
    inputHint: 'El atleta carga un único valor numérico por punto.',
  },
];

export function courtPresetKey(deporte) {
  if (!deporte || deporte === 'otro') return null;
  return `preset:${deporte}`;
}

export function isCourtPresetUrl(url) {
  return String(url || '').startsWith('preset:');
}

export function deporteFromPresetUrl(url) {
  if (!isCourtPresetUrl(url)) return null;
  return String(url).slice('preset:'.length);
}

function roundToMs(totalSec) {
  return Math.round(Number(totalSec) * 1000) / 1000;
}

/** Format seconds as m:ss or m:ss.mmm when there are fractions. */
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const total = Math.max(0, roundToMs(seconds));
  const m = Math.floor(total / 60);
  const sec = roundToMs(total - m * 60);
  const whole = Math.floor(sec + 1e-9);
  const ms = Math.round((sec - whole) * 1000);
  const secPad = String(whole).padStart(2, '0');
  if (ms <= 0) return `${m}:${secPad}`;
  return `${m}:${secPad}.${String(ms).padStart(3, '0')}`;
}

export function deporteLabel(key) {
  return COURT_DEPORTES.find((d) => d.key === key)?.label || key || '';
}

export function normalizeTipoMedicion(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'tiempo' || t === 'total' || t === 'porcentaje') return t;
  return 'porcentaje';
}

export function tipoMedicionLabel(key) {
  const normalized = normalizeTipoMedicion(key);
  return COURT_TIPOS_MEDICION.find((d) => d.key === normalized)?.label || 'Aciertos / Intentos';
}

export function parseTimeToSeconds(minStr, secStr) {
  const m = Math.floor(Number(minStr));
  const s = Number(String(secStr ?? '').replace(',', '.'));
  const minOk = minStr === '' || minStr == null ? 0 : m;
  const secOk = secStr === '' || secStr == null ? 0 : s;
  if (!Number.isFinite(minOk) || !Number.isFinite(secOk) || minOk < 0 || secOk < 0 || secOk >= 60) {
    return null;
  }
  const total = roundToMs(minOk * 60 + secOk);
  return total > 0 ? total : null;
}

/** Accepts "m:ss", "mm:ss.mmm", or plain seconds (with optional decimals). */
export function parseTimeInput(str) {
  const raw = String(str || '')
    .trim()
    .replace(',', '.');
  if (!raw) return null;
  if (raw.includes(':')) {
    const parts = raw.split(':');
    if (parts.length !== 2) return null;
    return parseTimeToSeconds(parts[0], parts[1]);
  }
  const onlySec = Number(raw);
  if (!Number.isFinite(onlySec) || onlySec <= 0) return null;
  return roundToMs(onlySec);
}

/** Keep digits, one colon, and up to 3 ms digits: mm:ss.mmm */
export function sanitizeTimeInput(str) {
  const raw = String(str || '').replace(',', '.');
  let out = '';
  let colon = false;
  let dot = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch >= '0' && ch <= '9') {
      if (!colon && !dot) {
        if (out.length >= 3) continue;
        out += ch;
      } else if (colon && !dot) {
        const secPart = out.split(':')[1] || '';
        if (secPart.length >= 2) continue;
        out += ch;
      } else if (dot) {
        const msPart = out.split('.')[1] || '';
        if (msPart.length >= 3) continue;
        out += ch;
      }
    } else if (ch === ':' && !colon && !dot && out.length > 0) {
      out += ':';
      colon = true;
    } else if (ch === '.' && !dot) {
      if (colon) {
        const secPart = out.split(':')[1] || '';
        if (!secPart.length) continue;
        out += '.';
        dot = true;
      } else if (out.length > 0) {
        out += '.';
        dot = true;
      }
    }
  }
  return out;
}
/** All presets are vertical (portrait). */
export function courtBoardHeight(_deporte, { edit = false } = {}) {
  return edit ? 420 : 400;
}

/**
 * Content width of the court card on a phone. Web uses this same frame so the
 * drawing, photo crop, and pin positions match iOS and Android.
 */
export const COURT_BOARD_PHONE_WIDTH = 358;
