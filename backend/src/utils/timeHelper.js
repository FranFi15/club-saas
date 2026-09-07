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
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${hour}:${minute}`;
}

/**
 * Instante de fin de sesión en zona del club.
 * horaFin es hora civil Argentina sobre el día calendario de session.fecha.
 */
export function sessionEndLocalDate(session) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return null;
    const parts = String(session?.horaFin || '23:59').split(':');
    const hh = String(Number.isFinite(parseInt(parts[0], 10)) ? parseInt(parts[0], 10) : 23).padStart(2, '0');
    const mm = String(Number.isFinite(parseInt(parts[1], 10)) ? parseInt(parts[1], 10) : 59).padStart(2, '0');
    // Offset fijo ART (−03): el club opera en Argentina; evita Date(y,m,d) del TZ del servidor (UTC en Render).
    return new Date(`${ymd}T${hh}:${mm}:00.000-03:00`);
}

/** True si la hora de fin (Argentina) ya pasó. */
export function isSessionPast(session, now = new Date()) {
    const ymd = sessionCalendarYmd(session?.fecha);
    if (!ymd) return false;
    const horaFin = String(session?.horaFin || '23:59').slice(0, 5);
    const today = todayYmdClub(now);
    if (ymd < today) return true;
    if (ymd > today) return false;
    return horaFin < nowHhMmClub(now);
}

/** Completada, cancelada o con horario ya terminado → no mutar. */
export function isSessionReadOnly(session, now = new Date()) {
    if (!session) return true;
    if (session.estado === 'completada' || session.estado === 'cancelada') return true;
    return isSessionPast(session, now);
}
