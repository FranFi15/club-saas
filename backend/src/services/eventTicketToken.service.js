import crypto from 'crypto';

/** Grace after event end (or start if no end). */
export const EVENT_TICKET_GRACE_MS = 24 * 60 * 60 * 1000;

function getSecret() {
    const dedicated = process.env.CLUB_ENTRY_TOKEN_SECRET?.trim();
    if (dedicated) return dedicated;

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Falta CLUB_ENTRY_TOKEN_SECRET para los QR de eventos.');
    }

    const fallback =
        process.env.JWT_SECRET?.trim() || process.env.MP_OAUTH_STATE_SECRET?.trim();
    if (!fallback) {
        throw new Error('Falta CLUB_ENTRY_TOKEN_SECRET o JWT_SECRET para los QR de eventos.');
    }
    console.warn(
        '[event-ticket] Usando secreto de fallback en desarrollo; configurá CLUB_ENTRY_TOKEN_SECRET.',
    );
    return fallback;
}

export function resolveEventTicketExpiry(event) {
    const end = event?.fechaFin || event?.fechaInicio;
    const base = end ? new Date(end).getTime() : Date.now();
    return base + EVENT_TICKET_GRACE_MS;
}

/**
 * @returns {{ token: string, expiresAt: string, nonce: string }}
 */
export function buildEventTicketToken(clubIdentifier, { ticketId, eventId, exp, nonce }) {
    const n = nonce || crypto.randomBytes(16).toString('hex');
    const expires = typeof exp === 'number' ? exp : Date.now() + EVENT_TICKET_GRACE_MS;
    const inner = JSON.stringify({
        club: String(clubIdentifier),
        ticketId: String(ticketId),
        eventId: String(eventId),
        exp: expires,
        n,
    });
    const sig = crypto.createHmac('sha256', getSecret()).update(inner).digest('hex');
    const envelope = JSON.stringify({ i: inner, s: sig });
    return {
        token: Buffer.from(envelope, 'utf8').toString('base64url'),
        expiresAt: new Date(expires).toISOString(),
        nonce: n,
    };
}

/**
 * @returns {{ ticketId: string, eventId: string, nonce: string, exp: number }}
 */
export function parseEventTicketToken(tokenParam, expectedClubIdentifier) {
    const raw = String(tokenParam || '').trim();
    if (!raw) throw new Error('Código QR inválido.');

    let payload = raw;
    const schemePrefix = 'gpsports:event:';
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

    const { club, ticketId, eventId, exp, n } = JSON.parse(envelope.i);
    if (!club || !ticketId || !eventId || !n || typeof exp !== 'number') {
        throw new Error('Código QR incompleto.');
    }
    if (String(club) !== String(expectedClubIdentifier)) {
        throw new Error('Este QR pertenece a otro club.');
    }
    if (Date.now() > exp) {
        throw new Error('Este QR de evento ya no es válido.');
    }

    return {
        ticketId: String(ticketId),
        eventId: String(eventId),
        nonce: String(n),
        exp,
    };
}

export function formatEventTicketQrValue(token) {
    return `gpsports:event:${token}`;
}
