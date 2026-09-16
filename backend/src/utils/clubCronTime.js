import { calendarPartsInTz, normalizeClubTimezone } from './timeHelper.js';

/**
 * Whether a club cron should run at `now` for the given local civil targets.
 * @param {string} timezone IANA
 * @param {{ hour: number, day?: number }} target hour required; day optional (e.g. 1 for month billing)
 * @param {Date} [now]
 */
export function shouldRunClubCron(timezone, { hour, day }, now = new Date()) {
    const tz = normalizeClubTimezone(timezone);
    const parts = calendarPartsInTz(now, tz);
    if (parts.hour !== Number(hour)) return false;
    if (day != null && parts.day !== Number(day)) return false;
    return true;
}

export function parseLocalHourEnv(name, fallback) {
    const n = parseInt(process.env[name] || String(fallback), 10);
    if (!Number.isFinite(n) || n < 0 || n > 23) return fallback;
    return n;
}
