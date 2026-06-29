/** Orden alfabético en español para listas en pantalla. */

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

export function sortByNombre(list, field = 'nombre') {
  return [...(list || [])].sort((a, b) => compareByField(a, b, field));
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

export function isPersonItem(item) {
  return item != null && typeof item.apellido === 'string';
}

export function compareListItem(a, b, getPrimaryLabel = (item) => item?.nombre || item?.label || '') {
  if (isPersonItem(a) || isPersonItem(b)) {
    return compareUserByName(a, b);
  }
  return compareText(getPrimaryLabel(a), getPrimaryLabel(b));
}
