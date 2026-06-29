/** Edad en años completos a partir de fecha de nacimiento (Date o ISO string). */
export function calcEdad(fechaNacimiento) {
    if (!fechaNacimiento) return null;
    const nac = new Date(fechaNacimiento);
    if (Number.isNaN(nac.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
        edad -= 1;
    }
    return edad;
}

export const MIN_AGE_SELF_PAY = 15;

export function puedePagarComoAtleta(fechaNacimiento) {
    const edad = calcEdad(fechaNacimiento);
    return edad !== null && edad >= MIN_AGE_SELF_PAY;
}

/** Atletas sin el flag explícito en false conservan acceso (compatibilidad). */
export function atletaCuotasEnApp(user) {
    if (!user || user.rol !== 'atleta') return true;
    return user.cuotasEnApp !== false;
}

/** true si el atleta cumple edadMinima/edadMaxima de la categoría (sin límites → todos entran). */
export function matchesCategoryAgeLimits(category, fechaNacimiento) {
    const edadMinima = category?.edadMinima;
    const edadMaxima = category?.edadMaxima;
    if (edadMinima == null && edadMaxima == null) return true;
    if (!fechaNacimiento) return false;
    const edad = calcEdad(fechaNacimiento);
    if (edad === null) return false;
    if (edadMinima != null && edad < edadMinima) return false;
    if (edadMaxima != null && edad > edadMaxima) return false;
    return true;
}
