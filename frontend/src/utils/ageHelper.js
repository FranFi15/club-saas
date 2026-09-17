export const MIN_AGE_SELF_PAY = 15;

export function calcEdad(fechaNacimiento, asOf = new Date()) {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (Number.isNaN(nac.getTime())) return null;
  const ref = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  let edad = ref.getFullYear() - nac.getFullYear();
  const m = ref.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < nac.getDate())) edad -= 1;
  return edad;
}

export function puedePagarComoAtleta(fechaNacimiento) {
  const edad = calcEdad(fechaNacimiento);
  return edad !== null && edad >= MIN_AGE_SELF_PAY;
}
