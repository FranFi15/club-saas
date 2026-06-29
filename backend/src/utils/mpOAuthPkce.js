import crypto from 'crypto';

function base64UrlEncode(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/** RFC 7636 PKCE verifier + S256 challenge for Mercado Pago OAuth. */
export function generateMercadoPagoPKCE() {
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(
        crypto.createHash('sha256').update(codeVerifier, 'utf8').digest()
    );
    return { codeVerifier, codeChallenge };
}
