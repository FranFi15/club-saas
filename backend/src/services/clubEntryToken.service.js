import crypto from 'crypto';

/** Ventana de validez del QR (se renueva en la app del miembro). */
export const CLUB_ENTRY_TOKEN_TTL_MS = 60 * 1000;

function getSecret() {
    const dedicated = process.env.CLUB_ENTRY_TOKEN_SECRET?.trim();
    if (dedicated) return dedicated;

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Falta CLUB_ENTRY_TOKEN_SECRET para los QR de ingreso.');
    }

    const fallback =
        process.env.JWT_SECRET?.trim() || process.env.MP_OAUTH_STATE_SECRET?.trim();
    if (!fallback) {
        throw new Error('Falta CLUB_ENTRY_TOKEN_SECRET o JWT_SECRET para los QR de ingreso.');
    }
    console.warn(
        '[club-entry] Usando secreto de fallback en desarrollo; configurá CLUB_ENTRY_TOKEN_SECRET.',
    );
    return fallback;
}

/**
 * @returns {{ token: string, expiresAt: string }}
 */
export function buildClubEntryToken(clubIdentifier, userId) {
    const exp = Date.now() + CLUB_ENTRY_TOKEN_TTL_MS;
    const nonce = crypto.randomBytes(16).toString('hex');
    const inner = JSON.stringify({
        club: String(clubIdentifier),
        uid: String(userId),
        exp,
        n: nonce,
    });
    const sig = crypto.createHmac('sha256', getSecret()).update(inner).digest('hex');
    const envelope = JSON.stringify({ i: inner, s: sig });
    return {
        token: Buffer.from(envelope, 'utf8').toString('base64url'),
        expiresAt: new Date(exp).toISOString(),
    };
}

/**
 * @returns {{ userId: string, nonce: string, exp: number }}
 */
export function parseClubEntryToken(tokenParam, expectedClubIdentifier) {
    const raw = String(tokenParam || '').trim();
    if (!raw) throw new Error('Código QR inválido.');

    let payload = raw;
    const schemePrefix = 'gpsports:entry:';
    if (payload.startsWith(schemePrefix)) {
        payload = payload.slice(schemePrefix.length);
    }

    const envelopeJson = Buffer.from(payload, 'base64url').toString('utf8');
    const envelope = JSON.parse(envelopeJson);
    const sigExpected = crypto.createHmac('sha256', getSecret()).update(envelope.i).digest('hex');

    const a = Buffer.from(sigExpected);
    const b = Buffer.from(String(envelope.s));
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) throw new Error('Código QR no reconocido.');

    const { club, uid, exp, n } = JSON.parse(envelope.i);
    if (!club || !uid || !n || typeof exp !== 'number') {
        throw new Error('Código QR incompleto.');
    }
    if (String(club) !== String(expectedClubIdentifier)) {
        throw new Error('Este QR pertenece a otro club.');
    }
    if (Date.now() > exp) {
        throw new Error('El QR expiró. Pedile al socio que actualice su pantalla.');
    }

    return { userId: String(uid), nonce: String(n), exp };
}
