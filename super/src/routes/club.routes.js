import express from 'express';
import {
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
} from '../controllers/club.controller.js';

// Importamos el nuevo patovica
import { protectAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ==========================================
// RUTAS DE MÁQUINA A MÁQUINA (Sin JWT)
// ==========================================
// Esta usa el 'x-internal-api-key', por lo que no necesita el token JWT de un humano
router.get('/internal/cron-tenants', getCronTenantIndex);
router.get('/internal/by-mp-user/:mpUserId', getClubByMpUser);
router.put('/internal/:identifier/mp-user', upsertClubMpUser);
router.get('/internal/:identifier/db-info', getClubDbInfo);
router.patch('/internal/:identifier/athlete-count', syncAthleteCount);

// ==========================================
// RUTAS PÚBLICAS (Para los jugadores/padres)
// ==========================================
// Para pintar el Login con los colores del club
router.get('/public/:identifier', getPublicClubInfo);

// ==========================================
// RUTAS PROTEGIDAS (Solo para vos / Super-Admin)
// ==========================================

// Le aplicamos protectAdmin a todas estas
router.route('/')
    .post(protectAdmin, registerClub)
    .get(protectAdmin, getClubs);

router.route('/:id')
    .delete(protectAdmin, deleteClub)
    .patch(protectAdmin, updateClubStatus)
    .put(protectAdmin, updateClub);

export default router;