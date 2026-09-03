import asyncHandler from 'express-async-handler';
import axios from 'axios';
import crypto from 'crypto';
import { MercadoPagoConfig, Preference, Payment as MPPayment } from 'mercadopago';
import { buildMpOAuthState } from '../utils/mpOAuthState.js';
import { generateMercadoPagoPKCE } from '../utils/mpOAuthPkce.js';
import { puedePagarComoAtleta, atletaCuotasEnApp } from '../utils/ageHelper.js';
import { isClubMercadoPagoLinked } from '../services/mercadoPagoClub.service.js';
import {
    resolveRentalMpCharge,
} from '../utils/rentalPayments.js';
import { assertMemberOwnsOnlineRental, expirePendingOnlineRentals } from '../services/onlineRental.service.js';
import {
    verifyMercadoPagoWebhookSignature,
    getMercadoPagoWebhookSecret,
} from '../utils/mpWebhookSignature.js';
import {
    resolveMercadoPagoSellerId,
    syncMercadoPagoUserMapping,
} from '../utils/mpSellerMapping.js';
import { backfillClubMpSellerMapping } from '../services/backfillMpSellerMapping.service.js';
import {
    parseExternalRef,
    applyApprovedMercadoPagoPayment,
    searchApprovedMpPaymentByExternalRef,
    reconcileClubMercadoPagoPayments,
} from '../services/mercadoPagoApply.service.js';

const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const MP_AUTH_BASE = 'https://auth.mercadopago.com/authorization';

function mpOauthClientConfigured() {
    return !!(
        process.env.MERCADOPAGO_CLIENT_ID?.trim() &&
        process.env.MERCADOPAGO_CLIENT_SECRET?.trim() &&
        process.env.MERCADOPAGO_OAUTH_REDIRECT_URI?.trim()
    );
}

/** OAuth disponible cuando hay credenciales de app MP + redirect + secreto anti-CSRF. */
function mpOauthFlowReady() {
    const secret = process.env.MP_OAUTH_STATE_SECRET?.trim();
    return mpOauthClientConfigured() && !!secret && secret.length >= 16;
}

/** Qué falta en .env para habilitar el botón OAuth en la app (solo admin). */
function getMpOAuthSetupStatus() {
    const missing = [];
    if (!process.env.MERCADOPAGO_CLIENT_ID?.trim()) missing.push('MERCADOPAGO_CLIENT_ID');
    if (!process.env.MERCADOPAGO_CLIENT_SECRET?.trim()) missing.push('MERCADOPAGO_CLIENT_SECRET');
    if (!process.env.MERCADOPAGO_OAUTH_REDIRECT_URI?.trim()) missing.push('MERCADOPAGO_OAUTH_REDIRECT_URI');
    const secret = process.env.MP_OAUTH_STATE_SECRET?.trim();
    if (!secret || secret.length < 16) missing.push('MP_OAUTH_STATE_SECRET');
    return {
        ready: mpOauthFlowReady(),
        missing,
        redirectUri: process.env.MERCADOPAGO_OAUTH_REDIRECT_URI?.trim() || null,
        pkceEnabled: process.env.MERCADOPAGO_OAUTH_USE_PKCE !== 'false',
    };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function appDeepLink(path) {
    const scheme = process.env.APP_DEEP_LINK_SCHEME?.trim() || 'clubapp';
    const clean = String(path || '').replace(/^\//, '');
    return `${scheme}://${clean}`;
}

function primaryFrontendUrl() {
    const raw = String(process.env.FRONTEND_URL || '')
        .split(',')[0]
        ?.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/$/, '');
    return raw || '';
}

function oauthReturnUrl(ok) {
    const frontend = primaryFrontendUrl();
    const segment = ok ? 'mp-oauth/success' : 'mp-oauth/error';
    if (frontend) return `${frontend}/${segment}`;
    return appDeepLink(segment);
}

function oauthCallbackHtml(ok, message) {
    const title = ok ? 'Mercado Pago conectado' : 'No se pudo conectar';
    const safe = escapeHtml(message);
    const returnUrl = oauthReturnUrl(ok);
    const nativeUrl = appDeepLink(ok ? 'mp-oauth/success' : 'mp-oauth/error');
    const safeLink = escapeHtml(returnUrl);
    const safeNativeLink = escapeHtml(nativeUrl);
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;margin:0 auto;text-align:center;">
<h1 style="font-size:1.25rem;">${title}</h1>
<p style="color:#374151;line-height:1.5;">${safe}</p>
<p style="color:#6b7280;font-size:14px;">Volviendo a la app del club…</p>
<p style="margin-top:20px;"><a href="${safeLink}" style="display:inline-block;padding:12px 20px;background:#009EE3;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Abrir Hermes Club App</a></p>
<p style="margin-top:12px;font-size:14px;"><a href="${safeNativeLink}" style="color:#009EE3;">¿Usás la app en el celular? Tocá acá</a></p>
<script>setTimeout(function(){ window.location.href = ${JSON.stringify(returnUrl)}; }, 600);</script>
</body></html>`;
}

async function postMpToken(body) {
    const { data } = await axios.post(MP_TOKEN_URL, body, {
        headers: { 'Content-Type': 'application/json' },
    });
    return data;
}

async function exchangeAuthorizationCode(code, codeVerifier, usePkce) {
    const payload = {
        client_id: process.env.MERCADOPAGO_CLIENT_ID.trim(),
        client_secret: process.env.MERCADOPAGO_CLIENT_SECRET.trim(),
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.MERCADOPAGO_OAUTH_REDIRECT_URI.trim(),
    };
    if (usePkce && codeVerifier) payload.code_verifier = codeVerifier;
    return postMpToken(payload);
}

async function exchangeRefreshToken(refreshToken) {
    return postMpToken({
        client_id: process.env.MERCADOPAGO_CLIENT_ID.trim(),
        client_secret: process.env.MERCADOPAGO_CLIENT_SECRET.trim(),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });
}

async function persistTokensFromOAuthResponse(ClubSettings, existingDoc, data, clubIdentifier) {
    const expiresMs = (Number(data.expires_in) || 15552000) * 1000;
    const newAccess = String(data.access_token || '').trim();
    const newRefreshRaw = typeof data.refresh_token === 'string' ? data.refresh_token.trim() : '';
    const newRefresh = newRefreshRaw || existingDoc?.mercadopagoRefreshToken?.trim() || '';

    await ClubSettings.findOneAndUpdate(
        {},
        {
            $set: {
                mercadopagoAccessToken: newAccess,
                mercadopagoRefreshToken: newRefresh,
                mercadopagoAccessTokenExpiresAt: new Date(Date.now() + expiresMs),
            },
        },
        { upsert: true }
    );

    if (clubIdentifier && newAccess) {
        const sellerId = await resolveMercadoPagoSellerId(data, newAccess);
        if (sellerId) await syncMercadoPagoUserMapping(clubIdentifier, sellerId);
    }

    return ClubSettings.findOne();
}

async function resolveAccessToken(models, clubIdentifier) {
    const { ClubSettings } = models;
    let doc = await ClubSettings.findOne();
    const access = doc?.mercadopagoAccessToken?.trim();
    const refresh = doc?.mercadopagoRefreshToken?.trim();
    const exp = doc?.mercadopagoAccessTokenExpiresAt;

    const BUFFER_MS = 5 * 60 * 1000;
    let accessValid = false;
    if (access && exp) {
        accessValid = new Date(exp).getTime() - BUFFER_MS > Date.now();
    } else if (access && !exp) {
        accessValid = true;
    }

    if (accessValid) return access;

    if (refresh && mpOauthClientConfigured()) {
        try {
            const data = await exchangeRefreshToken(refresh);
            doc = await persistTokensFromOAuthResponse(ClubSettings, doc, data, clubIdentifier);
            return doc?.mercadopagoAccessToken?.trim() || null;
        } catch (e) {
            console.warn('Mercado Pago refresh_token falló:', e.response?.data || e.message);
        }
    }

    if (access) return access;

    return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
}

function mpClientFromToken(accessToken) {
    if (!accessToken) {
        throw new Error('Mercado Pago no está configurado (ni token del club ni MERCADOPAGO_ACCESS_TOKEN)');
    }
    return new MercadoPagoConfig({ accessToken });
}

async function fetchMpPaymentById(accessToken, paymentId) {
    const client = mpClientFromToken(accessToken);
    const paymentClient = new MPPayment(client);
    return paymentClient.get({ id: paymentId });
}

async function assertMemberOwnsCuotas(req, paymentDocs) {
    const { User } = req.models;
    if (req.user.rol === 'atleta') {
        for (const p of paymentDocs) {
            const aid = String(p.atleta?._id || p.atleta);
            if (aid !== String(req.user._id)) {
                const err = new Error('No podés sincronizar cuotas de otro atleta.');
                err.statusCode = 403;
                throw err;
            }
        }
        return;
    }
    if (req.user.rol === 'socio') {
        for (const p of paymentDocs) {
            const aid = String(p.atleta?._id || p.atleta);
            if (aid !== String(req.user._id)) {
                const err = new Error('No podés sincronizar cuotas de otro socio.');
                err.statusCode = 403;
                throw err;
            }
        }
        return;
    }
    if (req.user.rol === 'tutor') {
        for (const p of paymentDocs) {
            const atletaId = p.atleta?._id || p.atleta;
            // El tutor también es titular de su propia cuota social.
            if (String(atletaId) === String(req.user._id)) continue;
            const hijo = await User.findById(atletaId).select('tutorPrincipal rol').lean();
            if (!hijo || hijo.rol !== 'atleta' || String(hijo.tutorPrincipal) !== String(req.user._id)) {
                const err = new Error('No podés sincronizar cuotas de un atleta que no está a tu cargo.');
                err.statusCode = 403;
                throw err;
            }
        }
        return;
    }
    const err = new Error('No autorizado.');
    err.statusCode = 403;
    throw err;
}

function webhookNotificationUrl(clubIdentifier) {
    const base =
        process.env.PUBLIC_API_URL?.replace(/\/$/, '') || process.env.BACKEND_URL?.replace(/\/$/, '') || '';
    if (!base || !clubIdentifier) return undefined;
    return `${base}/api/mercadopago/webhook?club=${encodeURIComponent(clubIdentifier)}`;
}

// @route   POST /api/mercadopago/oauth/start (admin club)
const startMercadoPagoOAuth = asyncHandler(async (req, res) => {
    if (!mpOauthFlowReady()) {
        res.status(503);
        throw new Error(
            'OAuth no configurado en el servidor. Necesitás MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, MERCADOPAGO_OAUTH_REDIRECT_URI y MP_OAUTH_STATE_SECRET.'
        );
    }

    const clubIdentifier =
        req.headers['x-club-identifier'] || (req.query?.club ? String(req.query.club) : undefined);
    if (!clubIdentifier) {
        res.status(400);
        throw new Error('Falta el identificador del club.');
    }

    const usePkce = process.env.MERCADOPAGO_OAUTH_USE_PKCE !== 'false';
    let codeVerifier = '';
    let codeChallenge = '';
    if (usePkce) {
        const pkce = generateMercadoPagoPKCE();
        codeVerifier = pkce.codeVerifier;
        codeChallenge = pkce.codeChallenge;
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const { ClubSettings } = req.models;
    await ClubSettings.findOneAndUpdate(
        {},
        {
            $set: {
                mpOAuthCodeVerifier: codeVerifier,
                mpOAuthStateNonce: nonce,
            },
        },
        { upsert: true }
    );

    const state = buildMpOAuthState(clubIdentifier, nonce);
    const redirectUri = process.env.MERCADOPAGO_OAUTH_REDIRECT_URI.trim();

    const params = new URLSearchParams({
        client_id: process.env.MERCADOPAGO_CLIENT_ID.trim(),
        response_type: 'code',
        platform_id: 'mp',
        state,
        redirect_uri: redirectUri,
    });
    params.set('scope', 'offline_access read write');
    if (usePkce && codeChallenge) {
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
    }

    const authUrl = `${MP_AUTH_BASE}?${params.toString()}`;
    res.json({ authUrl });
});

// @route   GET /api/mercadopago/oauth/callback (público, redirección MP)
const mercadoPagoOAuthCallback = asyncHandler(async (req, res) => {
    const fail = (msg) => res.status(400).type('html').send(oauthCallbackHtml(false, msg));

    const { code, error, error_description, state } = req.query;

    if (error) return fail(String(error_description || error));
    if (!code || !state) return fail('Faltan parámetros de autorización.');

    const payload = req.mpOAuthPayload;
    if (!payload?.nonce) return fail('Sesión inválida.');

    const { ClubSettings } = req.models;
    const doc = await ClubSettings.findOne();
    if (!doc?.mpOAuthStateNonce || doc.mpOAuthStateNonce !== payload.nonce) {
        return fail('La vinculación expiró o ya se usó. Volvé a iniciar desde la app.');
    }

    const usePkce = process.env.MERCADOPAGO_OAUTH_USE_PKCE !== 'false';
    const verifier = usePkce ? doc.mpOAuthCodeVerifier : '';

    if (usePkce && !verifier) {
        return fail('PKCE no disponible. Reiniciá la vinculación desde la app.');
    }

    let tokenData;
    try {
        tokenData = await exchangeAuthorizationCode(String(code), verifier, usePkce);
    } catch (e) {
        const mpMsg = e.response?.data?.message || e.response?.data?.error || e.message;
        console.error('Mercado Pago oauth/token (code):', e.response?.data || e.message);
        return fail(typeof mpMsg === 'string' ? mpMsg : 'Error al canjear el código con Mercado Pago.');
    }

    await persistTokensFromOAuthResponse(ClubSettings, doc, tokenData, req.clubIdentifier);
    await ClubSettings.findOneAndUpdate(
        {},
        { $set: { mpOAuthCodeVerifier: '', mpOAuthStateNonce: '' } },
        { upsert: true }
    );

    res.status(200).type('html').send(oauthCallbackHtml(true, 'Tu club ya puede usar Mercado Pago con cobros en su nombre.'));
});

// @route   GET /api/mercadopago/integration
const getMpIntegration = asyncHandler(async (req, res) => {
    const { ClubSettings } = req.models;
    const doc = await ClubSettings.findOne();
    const tenantAccess = doc?.mercadopagoAccessToken?.trim();
    const tenantRefresh = doc?.mercadopagoRefreshToken?.trim();
    const envToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

    let tokenSource = 'none';
    if (tenantAccess) tokenSource = 'club';
    else if (envToken) tokenSource = 'server_env';

    const maskedSuffix =
        tenantAccess && tenantAccess.length >= 4 ? `…${tenantAccess.slice(-4)}` : null;

    let sellerMapped = false;
    let mercadopagoUserId = null;
    if (tokenSource === 'club' && req.clubIdentifier) {
        const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
        const backfill = await backfillClubMpSellerMapping({
            models: req.models,
            clubIdentifier: req.clubIdentifier,
            accessToken,
        });
        sellerMapped = !!backfill.ok;
        mercadopagoUserId = backfill.sellerId || null;
    }

    res.json({
        tokenSource,
        maskedSuffix,
        updatedAt: doc?.updatedAt || null,
        linkedViaOauth: !!tenantRefresh,
        oauthReady: mpOauthFlowReady(),
        oauthSetup: getMpOAuthSetupStatus(),
        envFallbackActive: !tenantAccess && !!envToken,
        sellerMapped,
        mercadopagoUserId,
    });
});

// @route   POST /api/mercadopago/backfill-seller-mapping
const backfillSellerMapping = asyncHandler(async (req, res) => {
    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    const result = await backfillClubMpSellerMapping({
        models: req.models,
        clubIdentifier: req.clubIdentifier,
        accessToken,
    });
    if (!result.ok) {
        const messages = {
            no_token: 'Este club no tiene Mercado Pago vinculado.',
            users_me_failed: 'No se pudo leer el usuario de Mercado Pago. Relinká OAuth.',
            super_sync_failed: 'No se pudo guardar el mapping en el servidor central.',
            no_club: 'Falta el identificador del club.',
        };
        res.status(result.reason === 'no_token' ? 400 : 502);
        throw new Error(messages[result.reason] || 'No se pudo sincronizar el vendedor de Mercado Pago.');
    }
    res.json({
        sellerMapped: true,
        mercadopagoUserId: result.sellerId,
    });
});

// @route   PUT /api/mercadopago/integration (token manual — invalida refresh OAuth)
const updateMpIntegration = asyncHandler(async (req, res) => {
    const { accessToken } = req.body;
    const trimmed = typeof accessToken === 'string' ? accessToken.trim() : '';
    if (trimmed.length < 20) {
        res.status(400);
        throw new Error('Access token inválido o demasiado corto');
    }

    const { ClubSettings } = req.models;
    let doc = await ClubSettings.findOne();
    if (!doc) {
        doc = await ClubSettings.create({
            mercadopagoAccessToken: trimmed,
            mercadopagoRefreshToken: '',
            mercadopagoAccessTokenExpiresAt: null,
        });
    } else {
        doc.mercadopagoAccessToken = trimmed;
        doc.mercadopagoRefreshToken = '';
        doc.mercadopagoAccessTokenExpiresAt = null;
        await doc.save();
    }

    const sellerId = await resolveMercadoPagoSellerId(null, trimmed);
    if (sellerId && req.clubIdentifier) {
        await syncMercadoPagoUserMapping(req.clubIdentifier, sellerId);
    }

    res.json({
        tokenSource: 'club',
        maskedSuffix: `…${trimmed.slice(-4)}`,
        updatedAt: doc.updatedAt,
        linkedViaOauth: false,
        oauthReady: mpOauthFlowReady(),
        oauthSetup: getMpOAuthSetupStatus(),
        envFallbackActive: false,
    });
});

// @route   DELETE /api/mercadopago/integration
const clearMpIntegration = asyncHandler(async (req, res) => {
    const { ClubSettings } = req.models;
    await ClubSettings.findOneAndUpdate(
        {},
        {
            $set: {
                mercadopagoAccessToken: '',
                mercadopagoRefreshToken: '',
                mercadopagoAccessTokenExpiresAt: null,
                mpOAuthCodeVerifier: '',
                mpOAuthStateNonce: '',
            },
        },
        { upsert: true }
    );
    if (req.clubIdentifier) {
        await syncMercadoPagoUserMapping(req.clubIdentifier, '');
    }
    res.status(204).send();
});

// @route   POST /api/mercadopago/create-preference
// Preferencias de cuota: el monto SIEMPRE sale de la DB (no del body).
const createPreference = asyncHandler(async (req, res) => {
    const { itemId, tipo } = req.body;
    const { Payment } = req.models;

    if (tipo !== 'cuota' || !itemId) {
        res.status(400);
        throw new Error('Usá el endpoint específico para este tipo de cobro.');
    }

    const payment = await Payment.findById(itemId).populate('plan', 'nombre');
    if (!payment) {
        res.status(404);
        throw new Error('Cuota no encontrada');
    }
    if (!['pendiente', 'vencido'].includes(payment.estado)) {
        res.status(400);
        throw new Error('Esta cuota ya no está pendiente de pago.');
    }

    const meses = [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
    ];
    const titulo =
        req.body.titulo ||
        `${payment.plan?.nombre || 'Cuota'} ${meses[payment.mes - 1] || payment.mes} ${payment.anio}`;
    const monto = Number(payment.montoFinal);

    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    const client = mpClientFromToken(accessToken);
    const clubIdentifier = req.clubIdentifier || req.headers['x-club-identifier'] || req.query?.club;

    const frontend = primaryFrontendUrl() || 'https://www.google.com';
    const okUrl = `${frontend}/pago/ok`;
    const failUrl = `${frontend}/pago/error`;
    const pendingUrl = `${frontend}/pago/pendiente`;

    try {
        const preference = new Preference(client);
        const body = {
            items: [
                {
                    id: String(payment._id),
                    title: String(titulo).slice(0, 256),
                    quantity: 1,
                    unit_price: monto,
                    currency_id: 'ARS',
                },
            ],
            external_reference: `cuota_${payment._id}`,
            back_urls: {
                success: okUrl,
                failure: failUrl,
                pending: pendingUrl,
            },
            auto_return: 'approved',
        };
        const notificationUrl = webhookNotificationUrl(clubIdentifier);
        if (notificationUrl) body.notification_url = notificationUrl;

        const response = await preference.create({ body });

        res.status(200).json({
            idPreferencia: response.id,
            linkDePago: response.init_point,
        });
    } catch (error) {
        console.error('Error al crear preferencia:', error);
        res.status(500);
        throw new Error('No se pudo conectar con Mercado Pago');
    }
});

// @desc    Preferencia de pago para atleta (≥15 años) o tutor (cuotas de sus hijos)
// @route   POST /api/mercadopago/create-preference-member
const createMemberPreference = asyncHandler(async (req, res) => {
    const { paymentId } = req.body;
    const { Payment, User } = req.models;

    if (!(await isClubMercadoPagoLinked(req.models))) {
        res.status(400);
        throw new Error('Mercado Pago no está habilitado en este club. Pagá por transferencia.');
    }

    if (!paymentId) {
        res.status(400);
        throw new Error('Indicá la cuota a pagar.');
    }

    const payment = await Payment.findById(paymentId).populate('plan', 'nombre');
    if (!payment) {
        res.status(404);
        throw new Error('Cuota no encontrada');
    }
    if (!['pendiente', 'vencido'].includes(payment.estado)) {
        res.status(400);
        throw new Error('Esta cuota ya no está pendiente de pago.');
    }

    const atletaId = payment.atleta?.toString?.() || String(payment.atleta);

    if (req.user.rol === 'atleta') {
        if (atletaId !== req.user._id.toString()) {
            res.status(403);
            throw new Error('No podés pagar cuotas de otro atleta.');
        }
        if (!atletaCuotasEnApp(req.user)) {
            res.status(403);
            throw new Error('Las cuotas en la app no están habilitadas para tu cuenta. Consultá en administración.');
        }
        if (!puedePagarComoAtleta(req.user.fechaNacimiento)) {
            res.status(403);
            throw new Error(
                'Los menores de 15 años no pueden pagar en la app. Pedile a tu tutor o responsable que abone la cuota.',
            );
        }
    } else if (req.user.rol === 'socio') {
        if (atletaId !== req.user._id.toString()) {
            res.status(403);
            throw new Error('No podés pagar cuotas de otro socio.');
        }
    } else if (req.user.rol === 'tutor') {
        // El tutor también es titular de su propia cuota social.
        if (atletaId !== req.user._id.toString()) {
            const hijo = await User.findById(atletaId).select('tutorPrincipal rol').lean();
            if (!hijo || hijo.rol !== 'atleta') {
                res.status(400);
                throw new Error('Atleta no válido.');
            }
            if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
                res.status(403);
                throw new Error('No podés pagar cuotas de un atleta que no está a tu cargo.');
            }
        }
    } else {
        res.status(403);
        throw new Error('No autorizado.');
    }

    const meses = [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
    ];
    const titulo = `${payment.plan?.nombre || 'Cuota'} ${meses[payment.mes - 1] || payment.mes} ${payment.anio}`;

    req.body = {
        itemId: payment._id.toString(),
        titulo,
        monto: payment.montoFinal,
        tipo: 'cuota',
    };
    return createPreference(req, res);
});

// @desc    Preferencia MP con varias cuotas (tutor paga por todos sus hijos)
// @route   POST /api/mercadopago/create-preference-family
const createMemberFamilyPreference = asyncHandler(async (req, res) => {
    const { paymentIds } = req.body;
    const { Payment, User } = req.models;

    if (!(await isClubMercadoPagoLinked(req.models))) {
        res.status(400);
        throw new Error('Mercado Pago no está habilitado en este club. Pagá por transferencia.');
    }

    if (req.user.rol !== 'tutor') {
        res.status(403);
        throw new Error('Solo tutores pueden usar el pago familiar.');
    }

    if (!Array.isArray(paymentIds) || !paymentIds.length) {
        res.status(400);
        throw new Error('Indicá al menos una cuota a pagar.');
    }

    const ids = [...new Set(paymentIds.map((id) => String(id)))];
    const payments = await Payment.find({ _id: { $in: ids } })
        .populate('plan', 'nombre')
        .populate('atleta', 'nombre apellido tutorPrincipal rol');

    if (payments.length !== ids.length) {
        res.status(400);
        throw new Error('Hay cuotas inválidas.');
    }

    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const items = [];
    for (const payment of payments) {
        if (!['pendiente', 'vencido'].includes(payment.estado)) {
            res.status(400);
            throw new Error('Hay cuotas que ya no están pendientes de pago.');
        }
        const atletaId = payment.atleta?._id?.toString?.() || String(payment.atleta);
        const hijo = payment.atleta;
        if (!hijo || hijo.rol !== 'atleta') {
            res.status(400);
            throw new Error('Atleta no válido.');
        }
        if (!hijo.tutorPrincipal || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            res.status(403);
            throw new Error('No podés pagar cuotas de un atleta que no está a tu cargo.');
        }
        const titulo = `${hijo.nombre} · ${payment.plan?.nombre || 'Cuota'} ${meses[payment.mes - 1] || payment.mes} ${payment.anio}`;
        items.push({
            id: payment._id.toString(),
            title: titulo.slice(0, 256),
            quantity: 1,
            unit_price: Number(payment.montoFinal),
            currency_id: 'ARS',
        });
    }

    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    const client = mpClientFromToken(accessToken);
    const clubIdentifier = req.clubIdentifier || req.headers['x-club-identifier'] || req.query?.club;
    const frontend = primaryFrontendUrl() || 'https://www.google.com';

    try {
        const preference = new Preference(client);
        const body = {
            items,
            external_reference: `cuotas_bulk_${ids.join(',')}`,
            back_urls: {
                success: `${frontend}/pago/ok`,
                failure: `${frontend}/pago/error`,
                pending: `${frontend}/pago/pendiente`,
            },
            auto_return: 'approved',
        };
        const notificationUrl = webhookNotificationUrl(clubIdentifier);
        if (notificationUrl) body.notification_url = notificationUrl;

        const response = await preference.create({ body });
        res.status(200).json({
            idPreferencia: response.id,
            linkDePago: response.init_point,
            cantidad: items.length,
        });
    } catch (error) {
        console.error('Error preferencia familiar MP:', error);
        res.status(500);
        throw new Error('No se pudo conectar con Mercado Pago');
    }
});

// @desc    Preferencia MP para cobrar seña/saldo/total de un alquiler
// @route   POST /api/mercadopago/create-preference-rental
const createRentalPreference = asyncHandler(async (req, res) => {
    const { rentalId, concepto, monto } = req.body;
    const { Rental } = req.models;

    if (!(await isClubMercadoPagoLinked(req.models)) && !process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
        res.status(400);
        throw new Error('Mercado Pago no está habilitado en este club.');
    }

    if (!rentalId) {
        res.status(400);
        throw new Error('Indicá el alquiler a cobrar.');
    }

    const rental = await Rental.findById(rentalId).populate('espacio', 'nombre');
    if (!rental) {
        res.status(404);
        throw new Error('Alquiler no encontrado');
    }

    let charge;
    try {
        charge = resolveRentalMpCharge(rental, concepto, monto);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const espacioNombre = rental.espacio?.nombre || 'cancha';
    const titulo = `Alquiler ${espacioNombre} — ${rental.nombreCliente}`.slice(0, 256);

    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    const client = mpClientFromToken(accessToken);
    const clubIdentifier = req.clubIdentifier || req.headers['x-club-identifier'] || req.query?.club;
    const frontend = primaryFrontendUrl() || 'https://www.google.com';

    try {
        const preference = new Preference(client);
        const body = {
            items: [
                {
                    id: String(rental._id),
                    title: titulo,
                    quantity: 1,
                    unit_price: Number(charge.monto),
                    currency_id: 'ARS',
                },
            ],
            external_reference: `alquiler_${rental._id}_${charge.conceptoKey}`,
            back_urls: {
                success: `${frontend}/pago/ok`,
                failure: `${frontend}/pago/error`,
                pending: `${frontend}/pago/pendiente`,
            },
            auto_return: 'approved',
        };
        const notificationUrl = webhookNotificationUrl(clubIdentifier);
        if (notificationUrl) body.notification_url = notificationUrl;

        const response = await preference.create({ body });
        res.status(200).json({
            idPreferencia: response.id,
            linkDePago: response.init_point,
            monto: charge.monto,
            concepto: charge.conceptoKey,
            historialConcepto: charge.historialConcepto,
            rentalId: String(rental._id),
        });
    } catch (error) {
        console.error('Error preferencia alquiler MP:', error);
        res.status(500);
        throw new Error('No se pudo conectar con Mercado Pago');
    }
});

// @desc    Preferencia MP para que el socio pague su reserva online (total)
// @route   POST /api/mercadopago/create-preference-rental-member
const createMemberRentalPreference = asyncHandler(async (req, res) => {
    const { rentalId } = req.body;
    const { Rental } = req.models;

    if (!(await isClubMercadoPagoLinked(req.models)) && !process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
        res.status(400);
        throw new Error('Mercado Pago no está habilitado en este club.');
    }

    if (!rentalId) {
        res.status(400);
        throw new Error('Indicá el alquiler a cobrar.');
    }

    await expirePendingOnlineRentals(Rental);

    const rental = await Rental.findById(rentalId).populate('espacio', 'nombre');
    try {
        assertMemberOwnsOnlineRental(rental, req.user._id);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    let charge;
    try {
        charge = resolveRentalMpCharge(rental, 'total');
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const espacioNombre = rental.espacio?.nombre || 'cancha';
    const titulo = `Alquiler ${espacioNombre} — ${rental.nombreCliente}`.slice(0, 256);

    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    const client = mpClientFromToken(accessToken);
    const clubIdentifier = req.clubIdentifier || req.headers['x-club-identifier'] || req.query?.club;
    const frontend = primaryFrontendUrl() || 'https://www.google.com';

    try {
        const preference = new Preference(client);
        const body = {
            items: [
                {
                    id: String(rental._id),
                    title: titulo,
                    quantity: 1,
                    unit_price: Number(charge.monto),
                    currency_id: 'ARS',
                },
            ],
            external_reference: `alquiler_${rental._id}_total`,
            back_urls: {
                success: `${frontend}/pago/ok`,
                failure: `${frontend}/pago/error`,
                pending: `${frontend}/pago/pendiente`,
            },
            auto_return: 'approved',
        };
        const notificationUrl = webhookNotificationUrl(clubIdentifier);
        if (notificationUrl) body.notification_url = notificationUrl;

        const response = await preference.create({ body });
        res.status(200).json({
            idPreferencia: response.id,
            linkDePago: response.init_point,
            monto: charge.monto,
            concepto: 'total',
            rentalId: String(rental._id),
            pagoExpiraEn: rental.pagoExpiraEn,
        });
    } catch (error) {
        console.error('Error preferencia alquiler online MP:', error);
        res.status(500);
        throw new Error('No se pudo conectar con Mercado Pago');
    }
});

// @route   POST /api/mercadopago/webhook
const webhookReceiver = asyncHandler(async (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    const webhookSecret = getMercadoPagoWebhookSecret();
    const hasSignature = !!req.headers['x-signature'];

    if (webhookSecret && hasSignature) {
        const check = verifyMercadoPagoWebhookSignature(req, webhookSecret);
        if (!check.ok) {
            console.warn('[mp-webhook] firma inválida:', check.reason);
            return res.status(401).send('Firma inválida');
        }
    } else if (webhookSecret && !hasSignature) {
        // notification_url / IPN de preferencias suele no traer x-signature; se valida vía GET al pago.
        console.warn('[mp-webhook] sin x-signature (IPN); se valida contra API MP');
    } else if (isProd) {
        console.error('[mp-webhook] MP_WEBHOOK_SECRET no configurado — rechazando');
        return res.status(503).send('Webhook no configurado');
    } else {
        console.warn('[mp-webhook] sin secreto (solo desarrollo)');
    }

    const paymentId =
        req.query?.id ||
        req.query?.['data.id'] ||
        (req.body?.data?.id != null ? String(req.body.data.id) : undefined);

    if (!paymentId) {
        return res.status(400).send('Falta el ID del pago');
    }

    try {
        const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
        const paymentData = await fetchMpPaymentById(accessToken, paymentId);
        const result = await applyApprovedMercadoPagoPayment(req.models, paymentData);
        if (result.applied) {
            console.log(`✅ Pago procesado: ${paymentData.external_reference}`);
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error en el Webhook:', error);
        res.status(500).send('Error procesando el webhook');
    }
});

/**
 * Tras volver de Checkout Pro: busca pagos aprobados en MP y marca las cuotas.
 * @route POST /api/mercadopago/sync-member-payments
 */
const syncMemberPayments = asyncHandler(async (req, res) => {
    const { Payment } = req.models;
    const rawIds = Array.isArray(req.body?.paymentIds) ? req.body.paymentIds : [];
    const paymentIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];
    const mpPaymentId =
        req.body?.mpPaymentId != null && String(req.body.mpPaymentId).trim()
            ? String(req.body.mpPaymentId).trim()
            : null;

    if (!paymentIds.length && !mpPaymentId) {
        res.status(400);
        throw new Error('Indicá las cuotas o el id de pago de Mercado Pago.');
    }

    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    if (!accessToken) {
        res.status(503);
        throw new Error('Mercado Pago no está configurado en este club.');
    }

    const updated = [];

    if (mpPaymentId) {
        const paymentData = await fetchMpPaymentById(accessToken, mpPaymentId);
        const { tipo, dbId } = parseExternalRef(paymentData.external_reference);
        if (tipo === 'cuota' && dbId) {
            const doc = await Payment.findById(dbId);
            if (doc) await assertMemberOwnsCuotas(req, [doc]);
        } else if (tipo === 'cuotas_bulk' && dbId) {
            const docs = await Payment.find({ _id: { $in: dbId.split(',').filter(Boolean) } });
            if (docs.length) await assertMemberOwnsCuotas(req, docs);
        } else {
            res.status(400);
            throw new Error('Este pago de Mercado Pago no corresponde a cuotas del club.');
        }
        const result = await applyApprovedMercadoPagoPayment(req.models, paymentData);
        if (result.applied && result.ids) updated.push(...result.ids);
    }

    if (paymentIds.length) {
        const docs = await Payment.find({ _id: { $in: paymentIds } });
        if (docs.length !== paymentIds.length) {
            res.status(400);
            throw new Error('Hay cuotas inválidas.');
        }
        await assertMemberOwnsCuotas(req, docs);

        const pending = docs.filter((p) => ['pendiente', 'vencido', 'en_revision'].includes(p.estado));
        for (const cuota of pending) {
            const found = await searchApprovedMpPaymentByExternalRef(
                accessToken,
                `cuota_${cuota._id}`,
            );
            if (!found) continue;
            const result = await applyApprovedMercadoPagoPayment(req.models, found);
            if (result.applied && result.ids) updated.push(...result.ids);
        }

        const stillPendingIds = pending
            .map((p) => String(p._id))
            .filter((id) => !updated.includes(id));
        if (stillPendingIds.length > 1) {
            const bulkRef = `cuotas_bulk_${stillPendingIds.join(',')}`;
            const foundBulk = await searchApprovedMpPaymentByExternalRef(accessToken, bulkRef);
            if (foundBulk) {
                const result = await applyApprovedMercadoPagoPayment(req.models, foundBulk);
                if (result.applied && result.ids) updated.push(...result.ids);
            } else {
                // Preferencia familiar puede haber usado otro orden de ids
                const sortedRef = `cuotas_bulk_${[...stillPendingIds].sort().join(',')}`;
                if (sortedRef !== bulkRef) {
                    const foundSorted = await searchApprovedMpPaymentByExternalRef(accessToken, sortedRef);
                    if (foundSorted) {
                        const result = await applyApprovedMercadoPagoPayment(req.models, foundSorted);
                        if (result.applied && result.ids) updated.push(...result.ids);
                    }
                }
                // Último intento: el ref exacto con el orden original del body
                const bodyOrderRef = `cuotas_bulk_${paymentIds.join(',')}`;
                if (bodyOrderRef !== bulkRef && bodyOrderRef !== sortedRef) {
                    const foundOrder = await searchApprovedMpPaymentByExternalRef(accessToken, bodyOrderRef);
                    if (foundOrder) {
                        const result = await applyApprovedMercadoPagoPayment(req.models, foundOrder);
                        if (result.applied && result.ids) updated.push(...result.ids);
                    }
                }
            }
        }
    }

    res.json({
        updated: [...new Set(updated)],
        synced: updated.length > 0,
    });
});

/**
 * Admin: repara cuotas "pagadas en MP pero aún pendientes".
 * @route POST /api/mercadopago/reconcile-payments
 */
const reconcilePayments = asyncHandler(async (req, res) => {
    const accessToken = await resolveAccessToken(req.models, req.clubIdentifier);
    if (!accessToken) {
        res.status(503);
        throw new Error('Mercado Pago no está configurado en este club.');
    }

    const days = req.body?.days != null ? Number(req.body.days) : 30;
    const unpaidLimit = req.body?.unpaidLimit != null ? Number(req.body.unpaidLimit) : 80;

    const result = await reconcileClubMercadoPagoPayments(req.models, accessToken, {
        days,
        unpaidLimit,
    });

    const n = result.updatedIds?.length || 0;
    res.json({
        ...result,
        message:
            n > 0
                ? `Se actualizaron ${n} cuota(s) que ya estaban pagadas en Mercado Pago.`
                : `No había cuotas pendientes con pago aprobado en los últimos ${result.days} días.`,
    });
});

export {
    createPreference,
    createMemberPreference,
    createMemberFamilyPreference,
    createRentalPreference,
    createMemberRentalPreference,
    webhookReceiver,
    syncMemberPayments,
    reconcilePayments,
    getMpIntegration,
    backfillSellerMapping,
    updateMpIntegration,
    clearMpIntegration,
    startMercadoPagoOAuth,
    mercadoPagoOAuthCallback,
};
