import express from 'express';
import {
    listCourtMetrics,
    listMyCourtMetrics,
    createCourtMetric,
    getCourtMetric,
    updateCourtMetric,
    startCourtMetricRun,
    finishCourtMetricRun,
    addCourtMetricResult,
    listCourtMetricRuns,
    getCourtMetricSeries,
} from '../controllers/courtMetric.controller.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/me', protect, listMyCourtMetrics);
router.get('/', protect, authorize('admin_club', 'profe', 'preparador_fisico'), listCourtMetrics);
router.post('/', protect, authorize('admin_club', 'profe', 'preparador_fisico'), createCourtMetric);

router.get('/:id/results/series', protect, getCourtMetricSeries);
router.get('/:id/runs', protect, listCourtMetricRuns);
router.post('/:id/runs', protect, startCourtMetricRun);
router.patch('/:id/runs/:runId/finish', protect, finishCourtMetricRun);
router.post('/:id/runs/:runId/results', protect, addCourtMetricResult);

router.get('/:id', protect, getCourtMetric);
router.patch('/:id', protect, authorize('admin_club', 'profe', 'preparador_fisico'), updateCourtMetric);

export default router;
