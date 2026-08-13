import asyncHandler from 'express-async-handler';
import Club from '../models/club.model.js';
import { countAthletesInTenant } from '../utils/tenantAthleteCount.js';
import { createClubAdminInTenant } from '../utils/tenantBootstrap.js';

function readAdminPayload(body) {
    const nested = body.admin || {};
    return {
        nombre: body.adminNombre ?? nested.nombre,
        apellido: body.adminApellido ?? nested.apellido,
        email: body.adminEmail ?? nested.email,
        password: body.adminPassword ?? nested.password,
    };
}

const registerClub = asyncHandler(async (req, res) => {
    const { 
        nombre, 
        emailContacto, 
        urlIdentifier, 
        logoUrl, 
        primaryColor,
    } = req.body;

    const admin = readAdminPayload(req.body);

    if (!nombre || !emailContacto || !urlIdentifier) {
        res.status(400);
        throw new Error('Por favor, introduce todos los campos requeridos.');
    }

    if (!admin.nombre || !admin.apellido || !admin.email || !admin.password) {
        res.status(400);
        throw new Error('Completá los datos del administrador del club.');
    }

    const club = new Club({
        nombre,
        emailContacto,
        urlIdentifier,
        logoUrl,
        primaryColor,
    });
    
    // Usamos una variable de entorno genérica para el cluster de Mongo
    const mongoHost = process.env.MONGO_DB_HOST; 
    if (!mongoHost) {
        res.status(500);
        throw new Error('La configuración del host de la base de datos no está definida en el servidor.');
    }

    // Generamos el string de conexión único para aislar los datos de este club
    const uniqueDbSuffix = club.clubId.substring(0, 8);
    const tenantDbName = `club_${urlIdentifier.replace(/-/g, '_')}_${uniqueDbSuffix}`;
    club.connectionStringDB = `${mongoHost}/${tenantDbName}?retryWrites=true&w=majority`;

    const createdClub = await club.save();

    try {
        const createdAdmin = await createClubAdminInTenant(createdClub.connectionStringDB, admin);
        res.status(201).json({
            message: 'Club y administrador creados exitosamente',
            club: createdClub,
            admin: createdAdmin,
        });
    } catch (error) {
        await Club.findByIdAndDelete(createdClub._id);
        res.status(500);
        throw new Error(error.message || 'No se pudo crear el administrador del club.');
    }
});

const getClubs = asyncHandler(async (req, res) => {
    const clubs = await Club.find({}).sort({ createdAt: -1 });

    await Promise.all(
        clubs.map(async (club) => {
            const count = await countAthletesInTenant(club.connectionStringDB);
            if (count == null || count === club.userCount) return;
            club.userCount = count;
            await club.save();
        }),
    );

    res.json(clubs);
});

const deleteClub = asyncHandler(async (req, res) => {
    const club = await Club.findById(req.params.id);

    if (club) {
        await club.deleteOne();
        res.json({ message: 'Club eliminado exitosamente' });
    } else {
        res.status(404);
        throw new Error('Club no encontrado');
    }
});

const updateClubStatus = asyncHandler(async (req, res) => {
    const { estadoSuscripcion } = req.body;
    const club = await Club.findById(req.params.id);

    if (club) {
        club.estadoSuscripcion = estadoSuscripcion;
        const updatedClub = await club.save();
        res.json(updatedClub);
    } else {
        res.status(404);
        throw new Error('Club no encontrado');
    }
});

const updateClub = asyncHandler(async (req, res) => {
    const club = await Club.findById(req.params.id);

    if (club) {
        // Actualizamos los campos (si vienen en el body)
        club.nombre = req.body.nombre || club.nombre;
        club.emailContacto = req.body.emailContacto || club.emailContacto;
        club.logoUrl = req.body.logoUrl !== undefined ? req.body.logoUrl : club.logoUrl;
        club.primaryColor = req.body.primaryColor || club.primaryColor;

        const updatedClub = await club.save();
        res.json(updatedClub);
    } else {
        res.status(404);
        throw new Error('Club no encontrado');
    }
});

/** Listado mínimo para jobs (ej. generación de sesiones) — solo servicio interno. */
const getCronTenantIndex = asyncHandler(async (req, res) => {
    const internalKey = req.headers['x-internal-api-key'];
    if (internalKey !== process.env.INTERNAL_ADMIN_API_KEY) {
        res.status(401);
        throw new Error('No autorizado. Clave interna inválida.');
    }
    const bloqueados = ['inactivo', 'vencido', 'cancelado'];
    const clubs = await Club.find({ estadoSuscripcion: { $nin: bloqueados } }).select(
        'urlIdentifier connectionStringDB',
    );
    res.json({
        tenants: clubs.map((c) => ({
            urlIdentifier: c.urlIdentifier,
            connectionStringDB: c.connectionStringDB,
        })),
    });
});

const getClubDbInfo = asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const internalKey = req.headers['x-internal-api-key'];

    // Validamos que el que pregunta sea tu otro servidor, no un hacker
    if (internalKey !== process.env.INTERNAL_ADMIN_API_KEY) {
        res.status(401);
        throw new Error('No autorizado. Clave interna inválida.');
    }

    const club = await Club.findOne({ urlIdentifier: identifier });

    if (!club) {
        res.status(404);
        throw new Error('Club no encontrado en el sistema central.');
    }

    // Si está inactivo o cancelado, no lo dejamos conectar
    const bloqueados = ['inactivo', 'vencido', 'cancelado'];
    if (bloqueados.includes(club.estadoSuscripcion)) {
        res.status(403);
        throw new Error(`El servicio del club se encuentra ${club.estadoSuscripcion}.`);
    }

    // Le devolvemos la info vital
    res.json({
        clubId: club.clubId,
        connectionStringDB: club.connectionStringDB,
        apiSecretKey: club.apiSecretKey
    });
});

/** Sincroniza userCount desde el backend del tenant (conteo real de atletas). */
const syncAthleteCount = asyncHandler(async (req, res) => {
    const internalKey = req.headers['x-internal-api-key'];
    if (internalKey !== process.env.INTERNAL_ADMIN_API_KEY) {
        res.status(401);
        throw new Error('No autorizado. Clave interna inválida.');
    }

    const club = await Club.findOne({ urlIdentifier: req.params.identifier });
    if (!club) {
        res.status(404);
        throw new Error('Club no encontrado en el sistema central.');
    }

    const count = Number(req.body?.count);
    if (!Number.isFinite(count) || count < 0) {
        res.status(400);
        throw new Error('Indicá un conteo de atletas válido.');
    }

    club.userCount = Math.floor(count);
    await club.save();

    res.json({
        userCount: club.userCount,
    });
});

/** Resuelve club por seller id de Mercado Pago (webhooks sin ?club=). */
const getClubByMpUser = asyncHandler(async (req, res) => {
    const internalKey = req.headers['x-internal-api-key'];
    if (internalKey !== process.env.INTERNAL_ADMIN_API_KEY) {
        res.status(401);
        throw new Error('No autorizado. Clave interna inválida.');
    }

    const mpUserId = String(req.params.mpUserId || '').trim();
    if (!mpUserId) {
        res.status(400);
        throw new Error('Falta mercadopagoUserId.');
    }

    const club = await Club.findOne({ mercadopagoUserId: mpUserId });
    if (!club) {
        res.status(404);
        throw new Error('No hay club vinculado a ese usuario de Mercado Pago.');
    }

    const bloqueados = ['inactivo', 'vencido', 'cancelado'];
    if (bloqueados.includes(club.estadoSuscripcion)) {
        res.status(403);
        throw new Error(`El servicio del club se encuentra ${club.estadoSuscripcion}.`);
    }

    res.json({
        urlIdentifier: club.urlIdentifier,
        clubId: club.clubId,
        connectionStringDB: club.connectionStringDB,
        apiSecretKey: club.apiSecretKey,
    });
});

/** Registra o limpia el mapping MP user → club (llamado desde el backend del tenant). */
const upsertClubMpUser = asyncHandler(async (req, res) => {
    const internalKey = req.headers['x-internal-api-key'];
    if (internalKey !== process.env.INTERNAL_ADMIN_API_KEY) {
        res.status(401);
        throw new Error('No autorizado. Clave interna inválida.');
    }

    const club = await Club.findOne({ urlIdentifier: req.params.identifier });
    if (!club) {
        res.status(404);
        throw new Error('Club no encontrado en el sistema central.');
    }

    const raw = req.body?.mercadopagoUserId;
    const mpUserId = raw === null || raw === undefined ? '' : String(raw).trim();

    if (mpUserId) {
        await Club.updateMany(
            { mercadopagoUserId: mpUserId, _id: { $ne: club._id } },
            { $set: { mercadopagoUserId: '' } },
        );
    }

    club.mercadopagoUserId = mpUserId;
    await club.save();

    res.json({
        urlIdentifier: club.urlIdentifier,
        mercadopagoUserId: club.mercadopagoUserId || null,
    });
});

// @desc    Obtener información PÚBLICA del club para el Frontend (Login/Branding)
// @route   GET /api/clubs/public/:identifier
// @access  Public
const getPublicClubInfo = asyncHandler(async (req, res) => {
    const { identifier } = req.params;

    const club = await Club.findOne({ urlIdentifier: identifier });

    if (!club) {
        res.status(404);
        throw new Error('El club no existe o la URL es incorrecta.');
    }

    // Si el club está inactivo o cancelado, también podemos avisarle al front
    // para que muestre un cartel de "Servicio suspendido" en vez del login.
    const bloqueados = ['inactivo', 'vencido', 'cancelado'];
    if (bloqueados.includes(club.estadoSuscripcion)) {
        res.status(403);
        throw new Error('La plataforma de este club se encuentra temporalmente suspendida.');
    }

    // Solo devolvemos la "chapa y pintura"
    res.json({
        nombre: club.nombre,
        urlIdentifier: club.urlIdentifier,
        logoUrl: club.logoUrl,
        primaryColor: club.primaryColor,
    });
});

export {
    registerClub,
    getClubs,
    deleteClub,
    updateClubStatus,
    updateClub,
    getClubDbInfo,
    getPublicClubInfo,
    getCronTenantIndex,
    syncAthleteCount,
    getClubByMpUser,
    upsertClubMpUser,
};