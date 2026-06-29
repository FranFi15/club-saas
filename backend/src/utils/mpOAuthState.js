import crypto from 'crypto';

const MAX_AGE_MS = 15 * 60 * 1000;

function getSecret() {
    const s = process.env.MP_OAUTH_STATE_SECRET;
    if (!s || s.length < 16) {
        throw new Error('Configurá MP_OAUTH_STATE_SECRET (mín. 16 caracteres) para OAuth Mercado Pago.');
    }
    return s;
}

/**
 * Estado firmado anti-CSRF: incluye club, nonce almacenado en DB y marca de tiempo.
 * @returns {string} cadena para query param `state`
 */
export function buildMpOAuthState(clubIdentifier, nonce) {
    const ts = Date.now();
    const inner = JSON.stringify({ club: clubIdentifier, n: nonce, ts });
    const sig = crypto.createHmac('sha256', getSecret()).update(inner).digest('hex');
    const envelope = JSON.stringify({ i: inner, s: sig });
    return Buffer.from(envelope, 'utf8').toString('base64url');
}

/**
 * @returns {{ clubIdentifier: string, nonce: string }}
 */
export function parseMpOAuthState(stateParam) {
    const envelopeJson = Buffer.from(String(stateParam), 'base64url').toString('utf8');
    const envelope = JSON.parse(envelopeJson);
    const sigExpected = crypto.createHmac('sha256', getSecret()).update(envelope.i).digest('hex');

    const a = Buffer.from(sigExpected);
    const b = Buffer.from(String(envelope.s));
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) throw new Error('Firma inválida');

    const { club, n, ts } = JSON.parse(envelope.i);
    if (!club || !n || typeof ts !== 'number') throw new Error('Payload incompleto');
    if (Date.now() - ts > MAX_AGE_MS) throw new Error('Sesión OAuth expirada');

    return { clubIdentifier: String(club), nonce: String(n) };
}

export function isMercadoPagoOAuthCallback(req) {
    if (req.method !== 'GET') return false;
    if (req.path === '/oauth/callback') return true;
    return typeof req.originalUrl === 'string' && req.originalUrl.includes('/mercadopago/oauth/callback');
}
