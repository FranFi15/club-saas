// Compara dos rangos de horas (formato "HH:mm") y devuelve true si se pisan.

export const hasTimeOverlap = (start1, end1, start2, end2) => {
    return start1 < end2 && end1 > start2;
};

/** Zona civil por defecto (clubs existentes / fallback). */
export const DEFAULT_CLUB_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** @deprecated Use DEFAULT_CLUB_TIMEZONE; kept for older imports. */
export const CLUB_TIMEZONE = DEFAULT_CLUB_TIMEZONE;

const ALLOWED_CLUB_TIMEZONES = new Set([
    'America/Argentina/Buenos_Aires',
    'America/Argentina/Cordoba',
    'America/Montevideo',
    'America/Santiago',
    'America/Sao_Paulo',
    'America/Asuncion',
    'America/La_Paz',
    'America/Lima',
    'America/Bogota',
    'America/Mexico_City',
    'America/New_York',
    'Europe/Madrid',
    'UTC',
]);

export function normalizeClubTimezone(tz) {
    if (tz && ALLOWED_CLUB_TIMEZONES.has(String(tz))) return String(tz);
    return DEFAULT_CLUB_TIMEZONE;
}

function tzOrDefault(tz) {
    return normalizeClubTimezone(tz);
}

/** Partes de calendario civil en una IANA zone. */
export function calendarPartsInTz(now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    const zone = tzOrDefault(tz);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(now);

    const get = (type) => parts.find((p) => p.type === type)?.value;
    return {
        year: parseInt(get('year') || '0', 10),
        month: parseInt(get('month') || '0', 10),
        day: parseInt(get('day') || '0', 10),
        hour: parseInt(get('hour') || '0', 10),
        minute: parseInt(get('minute') || '0', 10),
        second: parseInt(get('second') || '0', 10),
    };
}

/** Mes/año de cuotas en zona del club. */
export function calendarMonthYearInTz(now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    const { year, month } = calendarPartsInTz(now, tz);
    return { mes: month, anio: year };
}

/** YYYY-MM-DD de un Date/ISO de sesión (día calendario guardado en UTC). */
export function sessionCalendarYmd(fecha) {
    if (!fecha) return null;
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
        return fecha.slice(0, 10);
    }
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function todayYmdClub(now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: tzOrDefault(tz),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

export function nowHhMmClub(now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tzOrDefault(tz),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23',
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeHhMm(value, fallback = '00:00') {
    const parts = String(value || fallback).split(':');
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
        const fb = String(fallback).split(':');
        return `${String(parseInt(fb[0], 10) || 0).padStart(2, '0')}:${String(parseInt(fb[1], 10) || 0).padStart(2, '0')}`;
    }
    return `${String(Math.min(23, Math.max(0, hh))).padStart(2, '0')}:${String(Math.min(59, Math.max(0, mm))).padStart(2, '0')}`;
}

export function hhMmToMinutes(value) {
    const norm = normalizeHhMm(value);
    const [h, m] = norm.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Convert civil wall time (YMD + HH:mm) in an IANA zone to a UTC Date.
 */
export function zonedWallTimeToDate(ymd, hhmm, tz = DEFAULT_CLUB_TIMEZONE) {
    const zone = tzOrDefault(tz);
    const [y, mo, d] = String(ymd).split('-').map(Number);
    const [hh, mm] = normalizeHhMm(hhmm).split(':').map(Number);
    let guess = Date.UTC(y, mo - 1, d, hh, mm, 0);

    for (let i = 0; i < 5; i++) {
        const parts = calendarPartsInTz(new Date(guess), zone);
        const asUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
        const desiredMs = Date.UTC(y, mo - 1, d, hh, mm, 0);
        const delta = desiredMs - asUtcMs;
        if (delta === 0) break;
        guess += delta;
    }

    return new Date(guess);
}

/**
 * Instante de fin de sesión en zona del club.
 */
export function sessionEndLocalDate(session, tz = DEFAULT_CLUB_TIMEZONE) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return null;
    return zonedWallTimeToDate(ymd, normalizeHhMm(session?.horaFin, '23:59'), tz);
}

/**
 * Instante de inicio de sesión en zona del club.
 */
export function sessionStartLocalDate(session, tz = DEFAULT_CLUB_TIMEZONE) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return null;
    return zonedWallTimeToDate(ymd, normalizeHhMm(session?.horaInicio, '00:00'), tz);
}

/** True si la hora de fin ya pasó en la zona del club. */
export function isSessionPast(session, now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return false;
    const today = todayYmdClub(now, tz);
    if (ymd < today) return true;
    if (ymd > today) return false;
    return hhMmToMinutes(session?.horaFin || '23:59') < hhMmToMinutes(nowHhMmClub(now, tz));
}

/**
 * True si la consulta ya empezó en la zona del club.
 */
export function isSessionStarted(session, now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return false;
    const today = todayYmdClub(now, tz);
    if (ymd < today) return true;
    if (ymd > today) return false;
    return hhMmToMinutes(session?.horaInicio || '00:00') <= hhMmToMinutes(nowHhMmClub(now, tz));
}

/** Completada, cancelada o con horario ya terminado → no mutar. */
export function isSessionReadOnly(session, now = new Date(), tz = DEFAULT_CLUB_TIMEZONE) {
    if (!session) return true;
    if (session.estado === 'completada' || session.estado === 'cancelada') return true;
    return isSessionPast(session, now, tz);
}
