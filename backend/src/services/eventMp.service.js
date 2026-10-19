import { MercadoPagoConfig, Preference } from 'mercadopago';
import { isClubMercadoPagoLinked } from './mercadoPagoClub.service.js';

function primaryFrontendUrl() {
    const raw = String(process.env.FRONTEND_URL || '')
        .split(',')[0]
        ?.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/$/, '');
    return raw || '';
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
 * Create MP Checkout Pro preference for an event ticket order.
 * external_reference: evento_{orderId}
 */
export async function createEventOrderMpPreference(
    models,
    clubIdentifier,
    order,
    { eventTitle, tipoNombre } = {},
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

    const monto = Number(order.montoTotal) || 0;
    if (monto <= 0) {
        const err = new Error('La orden no requiere pago.');
        err.statusCode = 400;
        throw err;
    }

    const title = `${eventTitle || 'Evento'} — ${tipoNombre || 'Entrada'}`.slice(0, 256);
    const frontend = primaryFrontendUrl() || 'https://www.google.com';
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const body = {
        items: [
            {
                id: String(order._id),
                title,
                quantity: 1,
                unit_price: monto,
                currency_id: 'ARS',
            },
        ],
        external_reference: `evento_${order._id}`,
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
    return {
        idPreferencia: response.id,
        linkDePago: response.init_point,
        monto,
        orderId: String(order._id),
    };
}
