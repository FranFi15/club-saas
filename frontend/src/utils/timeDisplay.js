/**
 * Máscara HH:MM al escribir (solo dígitos, ":" después de la hora).
 * Ej.: 1830 → 18:30
 */
export function maskTimeHHMM(text) {
    const digits = String(text ?? '')
        .replace(/\D/g, '')
        .slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Valida formato 00:00–23:59 */
export function isValidTimeHHMM(s) {
    const m = String(s ?? '')
        .trim()
        .match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(m);
}
