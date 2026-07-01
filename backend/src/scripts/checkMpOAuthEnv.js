import 'dotenv/config';

const REQUIRED = [
    'MERCADOPAGO_CLIENT_ID',
    'MERCADOPAGO_CLIENT_SECRET',
    'MERCADOPAGO_OAUTH_REDIRECT_URI',
    'MP_OAUTH_STATE_SECRET',
    'FRONTEND_URL',
    'PUBLIC_API_URL',
];

function check() {
    const missing = [];
    for (const key of REQUIRED) {
        const v = process.env[key]?.trim();
        if (!v) missing.push(key);
    }
    const secret = process.env.MP_OAUTH_STATE_SECRET?.trim();
    if (secret && secret.length < 16) missing.push('MP_OAUTH_STATE_SECRET (mín. 16 caracteres)');

    const redirect = process.env.MERCADOPAGO_OAUTH_REDIRECT_URI?.trim() || '';
    const publicBase = (process.env.PUBLIC_API_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    const expectedCallback = publicBase ? `${publicBase}/api/mercadopago/oauth/callback` : null;

    console.log('--- Mercado Pago OAuth — verificación ---\n');
    if (missing.length) {
        console.log('Faltan variables:', missing.join(', '));
    } else {
        console.log('Variables requeridas: OK');
    }

    if (expectedCallback && redirect && redirect !== expectedCallback) {
        console.log('\n⚠️  MERCADOPAGO_OAUTH_REDIRECT_URI no coincide con PUBLIC_API_URL:');
        console.log('   Configurado:', redirect);
        console.log('   Esperado:   ', expectedCallback);
    } else if (expectedCallback) {
        console.log('\nRedirect URI (registrar igual en MP Developers):');
        console.log('  ', expectedCallback);
    }

    const frontend = process.env.FRONTEND_URL?.split(',')[0]?.trim();
    if (frontend) {
        console.log('\nPost-OAuth return (web):', `${frontend.replace(/\/$/, '')}/mp-oauth/success`);
    }

    console.log('\nPKCE:', process.env.MERCADOPAGO_OAUTH_USE_PKCE !== 'false' ? 'activado' : 'desactivado');
    process.exit(missing.length ? 1 : 0);
}

check();
