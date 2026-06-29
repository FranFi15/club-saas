export const MIN_AGE_SELF_PAY = 15;

export function calcEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad -= 1;
  return edad;
}

export function puedePagarComoAtleta(fechaNacimiento) {
  const edad = calcEdad(fechaNacimiento);
  return edad !== null && edad >= MIN_AGE_SELF_PAY;
}
