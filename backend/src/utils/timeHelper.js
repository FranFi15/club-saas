// Compara dos rangos de horas (formato "HH:mm") y devuelve true si se pisan.
// Ej: 18:00-19:30 y 19:00-20:00 devuelven true.
// Ej: 18:00-19:00 y 19:00-20:00 devuelven false (termina justo cuando empieza el otro).

export const hasTimeOverlap = (start1, end1, start2, end2) => {
    return (start1 < end2) && (end1 > start2);
};

/** Zona civil del club (misma que alquileres online / agendas). */
export const CLUB_TIMEZONE = 'America/Argentina/Buenos_Aires';

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

export function todayYmdClub(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: CLUB_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

export function nowHhMmClub(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: CLUB_TIMEZONE,
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
 * Instante de fin de sesión en zona del club.
 * horaFin es hora civil Argentina sobre el día calendario de session.fecha.
 */
export function sessionEndLocalDate(session) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return null;
    const hhmm = normalizeHhMm(session?.horaFin, '23:59');
    // Offset fijo ART (−03): el club opera en Argentina; evita Date(y,m,d) del TZ del servidor (UTC en Render).
    return new Date(`${ymd}T${hhmm}:00.000-03:00`);
}

/**
 * Instante de inicio de sesión en zona del club.
 */
export function sessionStartLocalDate(session) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return null;
    const hhmm = normalizeHhMm(session?.horaInicio, '00:00');
    return new Date(`${ymd}T${hhmm}:00.000-03:00`);
}

/** True si la hora de fin (Argentina) ya pasó. */
export function isSessionPast(session, now = new Date()) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return false;
    const today = todayYmdClub(now);
    if (ymd < today) return true;
    if (ymd > today) return false;
    return hhMmToMinutes(session?.horaFin || '23:59') < hhMmToMinutes(nowHhMmClub(now));
}

/**
 * True si la consulta ya empezó (Argentina).
 * Usado para confirmación de asistencia atleta/tutor.
 */
export function isSessionStarted(session, now = new Date()) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return false;
    const today = todayYmdClub(now);
    if (ymd < today) return true;
    if (ymd > today) return false;
    return hhMmToMinutes(session?.horaInicio || '00:00') <= hhMmToMinutes(nowHhMmClub(now));
}

/** Completada, cancelada o con horario ya terminado → no mutar. */
export function isSessionReadOnly(session, now = new Date()) {
    if (!session) return true;
    if (session.estado === 'completada' || session.estado === 'cancelada') return true;
    return isSessionPast(session, now);
}
