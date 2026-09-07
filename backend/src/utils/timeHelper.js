// Compara dos rangos de horas (formato "HH:mm") y devuelve true si se pisan.
// Ej: 18:00-19:30 y 19:00-20:00 devuelven true.
// Ej: 18:00-19:00 y 19:00-20:00 devuelven false (termina justo cuando empieza el otro).

export const hasTimeOverlap = (start1, end1, start2, end2) => {
    return (start1 < end2) && (end1 > start2);
};

/** Fin local aproximado de la sesión (fecha UTC calendar day + horaFin HH:mm). */
export function sessionEndLocalDate(session) {
    if (!session?.fecha) return null;
    const d = new Date(session.fecha);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const parts = String(session.horaFin || '23:59').split(':');
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    return new Date(y, m, day, Number.isFinite(hh) ? hh : 23, Number.isFinite(mm) ? mm : 59, 0, 0);
}

export function isSessionPast(session, now = new Date()) {
    const end = sessionEndLocalDate(session);
    if (!end) return false;
    return end.getTime() < now.getTime();
}

/** Completada, cancelada o con horario ya terminado → no mutar. */
export function isSessionReadOnly(session, now = new Date()) {
    if (!session) return true;
    if (session.estado === 'completada' || session.estado === 'cancelada') return true;
    return isSessionPast(session, now);
}
