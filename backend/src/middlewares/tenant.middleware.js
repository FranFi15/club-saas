import axios from 'axios';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { getCachedTenant, setCachedTenant } from '../utils/cache.js';
import { parseMpOAuthState, isMercadoPagoOAuthCallback } from '../utils/mpOAuthState.js';
import {
    extractMpWebhookUserId,
    isMercadoPagoWebhookRequest,
    lookupClubIdentifierByMpUser,
} from '../utils/mpSellerMapping.js';

const CLUB_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const resolveTenant = async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    let clubIdentifier =
        req.headers['x-club-identifier'] || (req.query?.club ? String(req.query.club) : undefined);

    if (!clubIdentifier && isMercadoPagoOAuthCallback(req) && req.query?.state) {
        try {
            req.mpOAuthPayload = parseMpOAuthState(req.query.state);
            clubIdentifier = req.mpOAuthPayload.clubIdentifier;
        } catch (err) {
            return res.status(400).type('text').send(`Mercado Pago OAuth: ${err.message}`);
        }
    }

    // Webhooks del panel MP no llevan ?club=; rutear por seller user_id del body.
    if (!clubIdentifier && isMercadoPagoWebhookRequest(req)) {
        const mpUserId = extractMpWebhookUserId(req);
        if (mpUserId) {
            clubIdentifier = await lookupClubIdentifierByMpUser(mpUserId);
            if (!clubIdentifier) {
                console.warn(`[mp-webhook] sin club para MP user_id=${mpUserId}`);
                return res.status(404).json({
                    message:
                        'No hay club vinculado a este usuario de Mercado Pago. Relinká OAuth en el club.',
                });
            }
        }
    }

    if (!clubIdentifier) {
        return res.status(400).json({ message: 'Falta el identificador del club (x-club-identifier).' });
    }

    if (!CLUB_ID_RE.test(clubIdentifier)) {
        return res.status(400).json({ message: 'Identificador de club inválido.' });
    }

    try {
        let connectionStringDB = getCachedTenant(clubIdentifier);

        // Si no está en caché, le preguntamos al Super-Admin
        if (!connectionStringDB) {
            console.log(`[Cache Miss] Solicitando DB info para el tenant: ${clubIdentifier} al Super-Admin...`);
            const response = await axios.get(
                `${process.env.SUPER_ADMIN_URL}/api/clubs/internal/${encodeURIComponent(clubIdentifier)}/db-info`,
                {
                    headers: {
                        'x-internal-api-key': process.env.INTERNAL_ADMIN_API_KEY,
                    },
                },
            );

            connectionStringDB = response.data.connectionStringDB;
            // Guardamos en caché
            setCachedTenant(clubIdentifier, connectionStringDB);
        }

        // Conectamos y guardamos la conexión en la "req"
        const sanitizedConnectionString = connectionStringDB.replace(/([^:]\/)\/+/g, "$1"); 

        // 1. Guardamos la conexión
        req.tenantDB = await getTenantDB(clubIdentifier, sanitizedConnectionString);
        
        // 2. 🔥 LA MAGIA: Guardamos todos los modelos listos para usar en req.models
        req.models = getTenantModels(req.tenantDB);
        req.clubIdentifier = clubIdentifier;
        
        next();
        
       } catch (error) {
        console.error("❌ Error resolviendo tenant:", error.response?.data?.message || error.message);
        if (error.response && error.response.status === 403) {
            return res.status(403).json({ message: error.response.data.message });
        }
        return res.status(500).json({ message: 'Error de conexión con el servidor central.' });
    }
};