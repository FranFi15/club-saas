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

function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Same month/day in `year`, clamped if the day doesn't exist (e.g. 29/2). */
function dateOnYear(year, month, day) {
    const candidate = new Date(year, month, day);
    if (candidate.getMonth() !== month) {
        return new Date(year, month + 1, 0);
    }
    return candidate;
}

/**
 * Cortes de temporada son anuales (día/mes).
 * Cuando ya pasó ese día calendario, la fecha efectiva pasa al mismo día del año siguiente.
 * El día "hasta"/"desde" sigue valiendo ese día; el rollover es al día siguiente.
 */
export function resolveAnnualCutoffDate(storedDate, asOf = new Date()) {
    const base = parseOptionalDate(storedDate);
    if (!base) return null;
    const ref = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(ref.getTime())) return null;

    const month = base.getMonth();
    const day = base.getDate();
    let year = ref.getFullYear();
    let candidate = dateOnYear(year, month, day);

    if (startOfLocalDay(ref).getTime() > startOfLocalDay(candidate).getTime()) {
        candidate = dateOnYear(year + 1, month, day);
    }
    return candidate;
}

/** Si el corte guardado ya venció, devuelve la fecha del próximo ciclo (para persistir/mostrar). */
export function rolloverCutoffIfNeeded(storedDate, asOf = new Date()) {
    const resolved = resolveAnnualCutoffDate(storedDate, asOf);
    if (!resolved) return { date: null, changed: false };
    const stored = parseOptionalDate(storedDate);
    if (!stored) return { date: resolved, changed: true };
    const changed =
        startOfLocalDay(stored).getTime() !== startOfLocalDay(resolved).getTime();
    return { date: resolved, changed };
}

/**
 * Fecha de referencia para edad mínima: corte "hasta" (cumple la mínima a esa fecha)
 * o hoy si no está configurado. Se renueva sola cada año.
 */
export function categoryMinAgeAsOf(category, asOf = new Date()) {
    return resolveAnnualCutoffDate(category?.edadCorteHasta, asOf) || new Date(asOf);
}

/**
 * Fecha de referencia para edad máxima: corte "desde" o hoy. Se renueva sola cada año.
 */
export function categoryMaxAgeAsOf(category, asOf = new Date()) {
    return resolveAnnualCutoffDate(category?.edadCorteDesde, asOf) || new Date(asOf);
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

/** Menor a la edad mínima de la categoría (según corte hasta / hoy). */
export function isUnderCategoryMinAge(category, fechaNacimiento) {
    const edadMinima = category?.edadMinima;
    if (edadMinima == null || !fechaNacimiento) return false;
    const edadAlCorte = calcEdad(fechaNacimiento, categoryMinAgeAsOf(category));
    return edadAlCorte !== null && edadAlCorte < edadMinima;
}

/** Mayor a la edad máxima de la categoría (según corte desde / hoy). */
export function isOverCategoryMaxAge(category, fechaNacimiento) {
    const edadMaxima = category?.edadMaxima;
    if (edadMaxima == null || !fechaNacimiento) return false;
    const edadAlInicio = calcEdad(fechaNacimiento, categoryMaxAgeAsOf(category));
    return edadAlInicio !== null && edadAlInicio > edadMaxima;
}

/**
 * Elegible para listar al agregar (admin puede forzar menores a la mínima).
 * Excluye sin DOB si hay límites, y a quienes superan la máxima.
 */
export function isEligibleAllowingUnderMinAge(category, fechaNacimiento) {
    if (category?.edadMinima == null && category?.edadMaxima == null) return true;
    if (!fechaNacimiento) return false;
    if (isOverCategoryMaxAge(category, fechaNacimiento)) return false;
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

/** Como birthDateRangeForCategory pero sin piso de edad mínima (incluye menores). */
export function birthDateRangeForCategoryAllowUnderMin(category) {
    const maxAge = category?.edadMaxima;
    if (maxAge == null) {
        // Solo mínima o sin límites: no acotar por nacimiento (salvo exigir DOB en el caller).
        return null;
    }
    const ref = categoryMaxAgeAsOf(category);
    const latestBirth = new Date(ref);
    latestBirth.setFullYear(latestBirth.getFullYear() - maxAge - 1);
    latestBirth.setDate(latestBirth.getDate() + 1);
    return { $gte: latestBirth };
}
