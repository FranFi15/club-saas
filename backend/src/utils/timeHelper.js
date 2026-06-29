// Compara dos rangos de horas (formato "HH:mm") y devuelve true si se pisan.
// Ej: 18:00-19:30 y 19:00-20:00 devuelven true.
// Ej: 18:00-19:00 y 19:00-20:00 devuelven false (termina justo cuando empieza el otro).

export const hasTimeOverlap = (start1, end1, start2, end2) => {
    return (start1 < end2) && (end1 > start2);
};