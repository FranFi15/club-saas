/**
 * Login IDs for athletes without a real email.
 * Stored as: {slug}@athletes.{club}.internal
 * Login accepts email OR nombre.apellido (spaces → dots).
 */

const INTERNAL_HOST_PREFIX = 'athletes.';
const INTERNAL_HOST_SUFFIX = '.internal';

export function slugifyPersonName(nombre, apellido) {
    const raw = [nombre, apellido]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join('.');
    return slugifyLoginId(raw);
}

export function slugifyLoginId(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .replace(/\.+/g, '.')
        .slice(0, 80);
}

export function athleteInternalHost(clubIdentifier) {
    const club = slugifyLoginId(clubIdentifier) || 'club';
    return `${INTERNAL_HOST_PREFIX}${club}${INTERNAL_HOST_SUFFIX}`;
}

export function isAthleteInternalEmail(email, clubIdentifier) {
    const e = String(email || '').toLowerCase();
    const host = athleteInternalHost(clubIdentifier);
    return e.endsWith(`@${host}`);
}

export function buildAthleteInternalEmail(slug, clubIdentifier, suffix = 0) {
    const base = slugifyLoginId(slug) || 'atleta';
    const local = suffix > 0 ? `${base}.${suffix}` : base;
    return `${local}@${athleteInternalHost(clubIdentifier)}`;
}

/**
 * Resolve email for create: use explicit if present, else unique internal login.
 * @param {import('mongoose').Model} User
 * @param {{ email?: string, nombre?: string, apellido?: string, clubIdentifier?: string, reservedEmails?: Set<string> }} opts
 * @returns {Promise<{ email: string, generated: boolean, loginHint: string }>}
 */
export async function resolveAthleteEmail(User, { email, nombre, apellido, clubIdentifier, reservedEmails }) {
    const explicit = String(email || '').trim().toLowerCase();
    if (explicit) {
        if (reservedEmails?.has(explicit)) {
            const err = new Error('Email duplicado en el formulario.');
            err.statusCode = 400;
            throw err;
        }
        return {
            email: explicit,
            generated: false,
            loginHint: explicit,
        };
    }

    const baseSlug = slugifyPersonName(nombre, apellido) || 'atleta';
    for (let suffix = 0; suffix < 200; suffix += 1) {
        const candidate = buildAthleteInternalEmail(baseSlug, clubIdentifier, suffix);
        if (reservedEmails?.has(candidate)) continue;
        // eslint-disable-next-line no-await-in-loop
        const exists = await User.findOne({ email: candidate }).select('_id').lean();
        if (!exists) {
            const loginHint = suffix > 0 ? `${baseSlug}.${suffix}` : baseSlug;
            return { email: candidate, generated: true, loginHint };
        }
    }

    const err = new Error('No se pudo generar un usuario único a partir del nombre.');
    err.statusCode = 400;
    throw err;
}

/**
 * Find user by email or by athlete login slug (nombre.apellido).
 */
export async function findUserByLoginIdentifier(User, identifier, clubIdentifier) {
    const raw = String(identifier || '').trim().toLowerCase();
    if (!raw) return null;

    if (raw.includes('@')) {
        return User.findOne({ email: raw });
    }

    const slug = slugifyLoginId(raw);
    if (!slug) return null;

    const exact = buildAthleteInternalEmail(slug, clubIdentifier, 0);
    let user = await User.findOne({ email: exact });
    if (user) return user;

    // Typed "juan.perez.2" → try as local part already including suffix
    const withSuffix = `${slug}@${athleteInternalHost(clubIdentifier)}`;
    if (withSuffix !== exact) {
        user = await User.findOne({ email: withSuffix });
        if (user) return user;
    }

    return null;
}
