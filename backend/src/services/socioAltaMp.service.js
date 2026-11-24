import { MercadoPagoConfig, Preference } from 'mercadopago';
import { isClubMercadoPagoLinked } from './mercadoPagoClub.service.js';

function primaryMarketingUrl() {
    const raw = String(process.env.MARKETING_SITE_URL || 'https://hermesclubapp.com')
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/$/, '');
    return raw || 'https://hermesclubapp.com';
}

function webhookNotificationUrl(clubIdentifier) {
    const base =
        process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
        process.env.BACKEND_URL?.replace(/\/$/, '') ||
        '';
    if (!base || !clubIdentifier) return undefined;
    return `${base}/api/mercadopago/webhook?club=${encodeURIComponent(clubIdentifier)}`;
}

async function resolveAccessToken(models) {
    const { ClubSettings } = models;
    const doc = await ClubSettings.findOne().select('mercadopagoAccessToken').lean();
    return (
        doc?.mercadopagoAccessToken?.trim() ||
        process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
        null
    );
}

/**
 * MP Checkout Pro for public socio alta.
 * external_reference: socioalta_{pendingId}
 */
export async function createSocioAltaMpPreference(
    models,
    clubIdentifier,
    pending,
    { clubNombre, feeNombre } = {},
) {
    const linked =
        (await isClubMercadoPagoLinked(models)) || !!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
    if (!linked) {
        const err = new Error('Mercado Pago no está habilitado en este club.');
        err.statusCode = 400;
        throw err;
    }

    const accessToken = await resolveAccessToken(models);
    if (!accessToken) {
        const err = new Error('Mercado Pago no está configurado en este club.');
        err.statusCode = 503;
        throw err;
    }

    const monto = Number(pending.monto) || 0;
    if (monto <= 0) {
        const err = new Error('La cuota social no tiene un monto válido.');
        err.statusCode = 400;
        throw err;
    }

    const title = `${clubNombre || 'Club'} — ${feeNombre || 'Cuota social'}`.slice(0, 256);
    const site = primaryMarketingUrl();
    const clubQ = encodeURIComponent(clubIdentifier || '');
    const back = `${site}/alta-socio?club=${clubQ}`;

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const body = {
        items: [
            {
                id: String(pending._id),
                title,
                quantity: 1,
                unit_price: monto,
                currency_id: 'ARS',
            },
        ],
        payer: {
            email: pending.email,
            name: pending.nombre,
            surname: pending.apellido,
        },
        external_reference: `socioalta_${pending._id}`,
        back_urls: {
            success: `${back}&status=ok`,
            failure: `${back}&status=error`,
            pending: `${back}&status=pendiente`,
        },
        auto_return: 'approved',
    };
    const notificationUrl = webhookNotificationUrl(clubIdentifier);
    if (notificationUrl) body.notification_url = notificationUrl;

    const response = await preference.create({ body });
    return {
        idPreferencia: response.id,
        linkDePago: response.init_point,
        monto,
        pendingId: String(pending._id),
    };
}
