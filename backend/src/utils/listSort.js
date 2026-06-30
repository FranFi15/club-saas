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

const PAYMENT_ESTADO_ORDER = { vencido: 0, pendiente: 1, en_revision: 2, pagado: 3 };

/** Ordena cuotas de un atleta: peor estado primero; vencidos por período más reciente. */
export function sortPaymentsByPriority(list) {
    return [...(list || [])].sort((a, b) => {
        const oa = PAYMENT_ESTADO_ORDER[a?.estado] ?? 9;
        const ob = PAYMENT_ESTADO_ORDER[b?.estado] ?? 9;
        if (oa !== ob) return oa - ob;
        const ya = Number(b?.anio) - Number(a?.anio);
        if (ya !== 0) return ya;
        return Number(b?.mes) - Number(a?.mes);
    });
}
