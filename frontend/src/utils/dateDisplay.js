import { formatLocalDate } from './timeSlots';

/** Locale para nombres de día/mes (app en español; números de fecha siguen DD-MM-AAAA). */
export const APP_DATE_LOCALE = 'es-AR';

function capitalizeFirstLetter(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.charAt(0).toLocaleUpperCase(APP_DATE_LOCALE) + s.slice(1);
}

/**
 * Locale del dispositivo si es español; si no, español Argentina (textos de la app).
 * Fuera de Argentina el día de la semana sigue siendo el correcto en calendario local.
 */
export function getWeekdayLocale() {
  try {
    const device = Intl.DateTimeFormat().resolvedOptions().locale;
    if (device && /^es(-|$)/i.test(device)) return device;
  } catch {
    /* ignore */
  }
  return APP_DATE_LOCALE;
}

/**
 * Masks typing as DD-MM-AAAA (digits only, dashes after day and month).
 */
export function maskDateDDMMAAAA(text) {
  const cleaned = String(text ?? '').replace(/\D/g, '');
  let out = '';
  for (let i = 0; i < cleaned.length && i < 8; i += 1) {
    if (i === 2 || i === 4) out += '-';
    out += cleaned[i];
  }
  return out;
}

/**
 * Calendar YYYY-MM-DD (or ISO string) → DD-MM-AAAA for labels.
 */
export function isoCalendarDateToDisplay(isoOrYmd) {
  if (!isoOrYmd) return '';
  const raw = String(isoOrYmd).trim();
  const s = raw.includes('T') ? raw.split('T')[0] : raw;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * DD-MM-AAAA from input → YYYY-MM-DD for APIs / Date templates, or null if invalid/incomplete.
 */
export function displayDateToIsoCalendar(display) {
  if (!display || typeof display !== 'string') return null;
  const parts = display.split('-').map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;
  const d = Number(dd);
  const m = Number(mm);
  const y = Number(yyyy);
  if (!Number.isInteger(y) || y < 1000 || y > 9999) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** JS Date (local calendar) → DD-MM-AAAA */
export function formatJsDateToDisplay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return isoCalendarDateToDisplay(formatLocalDate(date));
}

/** Extrae YYYY-MM-DD de un ISO o fecha de calendario. */
export function isoCalendarYmd(isoOrYmd) {
  if (!isoOrYmd) return '';
  const raw = String(isoOrYmd).trim();
  const s = raw.includes('T') ? raw.split('T')[0] : raw;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Fecha de calendario (YYYY-MM-DD) como Date local — evita que el día de la semana
 * se corra por parseo UTC de `new Date('2026-05-27')`.
 */
export function parseIsoCalendarToLocalDate(isoOrYmd) {
  const ymd = isoCalendarYmd(isoOrYmd);
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Nombre del día (Lun, Mar, Mié…) según la fecha calendario, en hora local del dispositivo. */
export function isoCalendarWeekday(isoOrYmd, { style = 'short', locale } = {}) {
  const dt = parseIsoCalendarToLocalDate(isoOrYmd);
  if (!dt) return '';
  const loc = locale ?? getWeekdayLocale();
  const raw = dt.toLocaleDateString(loc, { weekday: style });
  return capitalizeFirstLetter(raw);
}

/** Ordenar fechas YYYY-MM-DD / ISO sin corrimiento UTC. */
export function compareIsoCalendarDates(a, b) {
  const ya = isoCalendarYmd(a);
  const yb = isoCalendarYmd(b);
  if (!ya && !yb) return 0;
  if (!ya) return 1;
  if (!yb) return -1;
  return ya.localeCompare(yb);
}

/** Etiqueta típica de sesión: «Mié · 27-05-2026 · 20:00–21:30». */
export function formatSessionCalendarWhen(fecha, horaInicio = '', horaFin = '', { weekdayStyle = 'short', locale } = {}) {
  const weekday = isoCalendarWeekday(fecha, { style: weekdayStyle, locale });
  const cal = isoCalendarDateToDisplay(fecha);
  const time = [horaInicio, horaFin].filter(Boolean).join('–');
  return [weekday, cal, time].filter(Boolean).join(' · ');
}

/** true si la fecha calendario es >= inicio del día `start` (Date local). */
export function isIsoCalendarOnOrAfterDay(isoOrYmd, start) {
  const dt = parseIsoCalendarToLocalDate(isoOrYmd);
  if (!dt || !(start instanceof Date)) return false;
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const t = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
  return t >= s;
}
