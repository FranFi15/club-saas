import express from 'express';
import {
    createMetricDefinition,
    listMetricDefinitions,
    addMeasurement,
    addMeasurementsBulk,
    createClinicalNote,
    getAthletePerformance,
    getTutorMetricsAccess,
    updateMeasurement,
    deleteMeasurement,
    updateClinicalNote,
    deleteClinicalNote,
    getNutritionClubSettings,
    setNutritionClubSettings,
} from '../controllers/performance.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Definiciones de métricas (Staff deportivo + profe en área física)
router.get('/metrics/definitions', protect, listMetricDefinitions);
router.post(
    '/metrics/definitions',
    protect,
    authorize('admin_club', 'preparador_fisico', 'nutricionista', 'profe'),
    createMetricDefinition
);

// Carga de mediciones (PF, Nutri, profe)
router.post('/measurements', protect, authorize('preparador_fisico', 'nutricionista', 'profe'), addMeasurement);
router.post(
    '/measurements/bulk',
    protect,
    authorize('preparador_fisico', 'nutricionista', 'profe'),
    addMeasurementsBulk,
);

// Carga de notas clínicas (Psicólogos y Médicos)
router.post('/clinical-notes', protect, authorize('psicologo'), createClinicalNote);

// Consulta de perfil (Cualquiera con permiso según los candados)
router.get('/tutor-metrics-access', protect, authorize('tutor'), getTutorMetricsAccess);
router.get('/atleta/:atletaId', protect, getAthletePerformance);
router.get('/nutricion/settings', protect, getNutritionClubSettings);
router.patch(
    '/nutricion/settings',
    protect,
    authorize('nutricionista', 'admin_club'),
    setNutritionClubSettings,
);

// Mediciones
router.put(
    '/measurements/:id',
    protect,
    authorize('preparador_fisico', 'nutricionista', 'admin_club', 'profe'),
    updateMeasurement
);
router.delete(
    '/measurements/:id',
    protect,
    authorize('preparador_fisico', 'nutricionista', 'admin_club', 'profe'),
    deleteMeasurement
);

// Notas Clínicas
router.put('/clinical-notes/:id', protect, authorize('psicologo'), updateClinicalNote);
router.delete('/clinical-notes/:id', protect, authorize('psicologo'), deleteClinicalNote);

export default router;