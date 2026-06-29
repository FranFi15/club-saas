/** Orden alfabético en español (insensible a mayúsculas y acentos). */

export const userNameMongoSort = { nombre: 1, apellido: 1, _id: 1 };
export const userNameCollation = { locale: 'es', strength: 1 };

export function compareText(a, b) {
    return String(a ?? '')
        .trim()
        .localeCompare(String(b ?? '').trim(), 'es', { sensitivity: 'base' });
}

export function compareByField(a, b, field = 'nombre') {
    return compareText(a?.[field], b?.[field]);
}

export function compareUserByName(a, b) {
    const cmpNombre = compareText(a?.nombre, b?.nombre);
    if (cmpNombre !== 0) return cmpNombre;
    return compareText(a?.apellido, b?.apellido);
}

export function sortByField(list, field = 'nombre') {
    return [...list].sort((a, b) => compareByField(a, b, field));
}

export function sortUsersByName(list) {
    return [...(list || [])].sort(compareUserByName);
}

export function sortEnrollmentsByAtleta(list) {
    return [...(list || [])].sort((a, b) => compareUserByName(a?.atleta, b?.atleta));
}

export function sortPaymentsByAtleta(list) {
    return [...(list || [])].sort((a, b) => compareUserByName(a?.atleta, b?.atleta));
}
