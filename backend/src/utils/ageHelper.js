/** Edad en años completos a partir de fecha de nacimiento (Date o ISO string). */
export function calcEdad(fechaNacimiento, asOf = new Date()) {
    if (!fechaNacimiento) return null;
    const nac = new Date(fechaNacimiento);
    if (Number.isNaN(nac.getTime())) return null;
    const ref = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(ref.getTime())) return null;
    let edad = ref.getFullYear() - nac.getFullYear();
    const m = ref.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < nac.getDate())) {
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
    if (!user) return true;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isAthlete = user.rol === 'atleta' || roles.includes('atleta');
    if (!isAthlete) return true;
    return user.cuotasEnApp !== false;
}

function parseOptionalDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fecha de referencia para edad mínima: corte "hasta" (cumple la mínima a esa fecha)
 * o hoy si no está configurado.
 */
export function categoryMinAgeAsOf(category) {
    return parseOptionalDate(category?.edadCorteHasta) || new Date();
}

/**
 * Fecha de referencia para edad máxima: corte "desde" o hoy.
 */
export function categoryMaxAgeAsOf(category) {
    return parseOptionalDate(category?.edadCorteDesde) || new Date();
}

/**
 * true si el atleta cumple edadMinima/edadMaxima de la categoría.
 * Con edadCorteHasta: puede estar debajo de la mínima hoy si al corte ya tiene esa edad.
 * Con edadCorteDesde: la máxima se evalúa a esa fecha (inicio de temporada).
 */
export function matchesCategoryAgeLimits(category, fechaNacimiento) {
    const edadMinima = category?.edadMinima;
    const edadMaxima = category?.edadMaxima;
    if (edadMinima == null && edadMaxima == null) return true;
    if (!fechaNacimiento) return false;

    if (edadMinima != null) {
        const edadAlCorte = calcEdad(fechaNacimiento, categoryMinAgeAsOf(category));
        if (edadAlCorte === null || edadAlCorte < edadMinima) return false;
    }
    if (edadMaxima != null) {
        const edadAlInicio = calcEdad(fechaNacimiento, categoryMaxAgeAsOf(category));
        if (edadAlInicio === null || edadAlInicio > edadMaxima) return false;
    }
    return true;
}

/**
 * Rango de fechaNacimiento en Mongo para filtrar atletas elegibles por edad.
 * Alineado con matchesCategoryAgeLimits (usa cortes desde/hasta cuando existen).
 */
export function birthDateRangeForCategory(category) {
    const minAge = category?.edadMinima;
    const maxAge = category?.edadMaxima;
    if (minAge == null && maxAge == null) return null;

    const range = {};

    if (maxAge != null) {
        const ref = categoryMaxAgeAsOf(category);
        const latestBirth = new Date(ref);
        latestBirth.setFullYear(latestBirth.getFullYear() - maxAge - 1);
        latestBirth.setDate(latestBirth.getDate() + 1);
        range.$gte = latestBirth;
    }
    if (minAge != null) {
        const ref = categoryMinAgeAsOf(category);
        const earliestBirth = new Date(ref);
        earliestBirth.setFullYear(earliestBirth.getFullYear() - minAge);
        range.$lte = earliestBirth;
    }
    return range;
}
