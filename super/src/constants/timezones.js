/** IANA zones allowed for clubs (LatAm + common extras). */
export const DEFAULT_CLUB_TIMEZONE = 'America/Argentina/Buenos_Aires';

export const CLUB_TIMEZONE_OPTIONS = [
    { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
    { value: 'America/Argentina/Cordoba', label: 'Argentina (Córdoba)' },
    { value: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
    { value: 'America/Santiago', label: 'Chile (Santiago)' },
    { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
    { value: 'America/Asuncion', label: 'Paraguay (Asunción)' },
    { value: 'America/La_Paz', label: 'Bolivia (La Paz)' },
    { value: 'America/Lima', label: 'Perú (Lima)' },
    { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
    { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
    { value: 'America/New_York', label: 'EE.UU. (Nueva York)' },
    { value: 'Europe/Madrid', label: 'España (Madrid)' },
    { value: 'UTC', label: 'UTC' },
];

const ALLOWED = new Set(CLUB_TIMEZONE_OPTIONS.map((o) => o.value));

export function normalizeClubTimezone(tz) {
    if (tz && ALLOWED.has(String(tz))) return String(tz);
    return DEFAULT_CLUB_TIMEZONE;
}
