import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { COURT_DEPORTES } from '../models/courtMetric.model.js';
import { userHasRole } from '../constants/userRoles.js';

const STAFF_ROLES = ['admin_club', 'profe', 'preparador_fisico'];

function isStaff(user) {
    return STAFF_ROLES.some((r) => userHasRole(user, r));
}

function normalizePins(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((p) => {
            const x = Number(p.x);
            const y = Number(p.y);
            const label = String(p.label || '').trim();
            if (!label || !Number.isFinite(x) || !Number.isFinite(y)) return null;
            const pin = {
                label,
                x: Math.min(1, Math.max(0, x)),
                y: Math.min(1, Math.max(0, y)),
                notas: String(p.notas || '').trim(),
            };
            if (p._id && mongoose.Types.ObjectId.isValid(p._id)) {
                pin._id = p._id;
            }
            return pin;
        })
        .filter(Boolean);
}

function normalizeIdList(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
}

function assertAssignment(categorias, atletas, { publishing = false } = {}) {
    if (!publishing) return;
    if (!categorias.length && !atletas.length) {
        const err = new Error('Asigná al menos una categoría o un atleta.');
        err.statusCode = 400;
        throw err;
    }
}

async function athleteCategoryIds(Enrollment, atletaId) {
    const rows = await Enrollment.find({ atleta: atletaId, estado: 'activo' }).select('categoria').lean();
    return [...new Set(rows.map((r) => String(r.categoria)).filter(Boolean))];
}

function uniqueById(docs) {
    const seen = new Set();
    const out = [];
    for (const doc of docs || []) {
        const id = String(doc?._id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(doc);
    }
    return out;
}

/** Works for raw ObjectIds and populated `{ _id }` refs. */
function refId(ref) {
    if (ref == null) return '';
    if (typeof ref === 'object') return String(ref._id || '');
    return String(ref);
}

async function athleteCanAccessMetric(models, metric, atletaId) {
    const aid = String(atletaId);
    if ((metric.atletas || []).some((ref) => refId(ref) === aid)) return true;
    const catIds = (metric.categorias || []).map(refId).filter(Boolean);
    if (!catIds.length) return false;
    const enrolled = await athleteCategoryIds(models.Enrollment, atletaId);
    return enrolled.some((c) => catIds.includes(c));
}

async function assertCanManageMetric(req, metric) {
    if (!isStaff(req.user)) {
        const err = new Error('No autorizado.');
        err.statusCode = 403;
        throw err;
    }
    return true;
}

async function resolveTargetAthlete(req, bodyAtletaId) {
    if ((isStaff(req.user) || userHasRole(req.user, 'tutor')) && bodyAtletaId) {
        if (!mongoose.Types.ObjectId.isValid(bodyAtletaId)) {
            const err = new Error('Atleta inválido.');
            err.statusCode = 400;
            throw err;
        }
        return bodyAtletaId;
    }
    if (userHasRole(req.user, 'atleta')) {
        return req.user._id;
    }
    const err = new Error('Indicá el atleta.');
    err.statusCode = 400;
    throw err;
}

function canActOnAthleteRun(req, runAtletaId) {
    if (isStaff(req.user)) return true;
    if (String(runAtletaId) === String(req.user._id)) return true;
    // Tutor acting for the selected child (access already checked on the metric).
    if (userHasRole(req.user, 'tutor')) return true;
    return false;
}

function populateMetric(q) {
    return q
        .populate('categorias', 'nombre')
        .populate('atletas', 'nombre apellido')
        .populate('creador', 'nombre apellido');
}

// @route GET /api/court-metrics
const listCourtMetrics = asyncHandler(async (req, res) => {
    const { CourtMetric } = req.models;
    const filter = {};
    if (req.query.estado === 'archivada') filter.estado = 'archivada';
    else if (req.query.estado !== 'todas') filter.estado = 'activa';
    if (req.query.categoria && mongoose.Types.ObjectId.isValid(req.query.categoria)) {
        filter.categorias = req.query.categoria;
    }
    if (!isStaff(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const list = await populateMetric(CourtMetric.find(filter).sort({ updatedAt: -1 })).lean();
    res.json({ metrics: list });
});

// @route GET /api/court-metrics/me
const listMyCourtMetrics = asyncHandler(async (req, res) => {
    const { CourtMetric, Enrollment } = req.models;
    let atletaId = req.user._id;
    if (userHasRole(req.user, 'tutor') && req.query.atletaId) {
        atletaId = req.query.atletaId;
    }
    if (!userHasRole(req.user, 'atleta') && !userHasRole(req.user, 'tutor') && !isStaff(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    if (isStaff(req.user) && req.query.atletaId) {
        atletaId = req.query.atletaId;
    }

    const catIds = await athleteCategoryIds(Enrollment, atletaId);
    const list = await populateMetric(
        CourtMetric.find({
            estado: 'activa',
            $or: [{ atletas: atletaId }, ...(catIds.length ? [{ categorias: { $in: catIds } }] : [])],
        }).sort({ updatedAt: -1 }),
    ).lean();

    // One metric can match via several categories and/or the individual list;
    // always return a single card per shoot-around for the athlete.
    res.json({ metrics: uniqueById(list), atletaId });
});

// @route POST /api/court-metrics
const createCourtMetric = asyncHandler(async (req, res) => {
    if (!isStaff(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const { CourtMetric } = req.models;
    const titulo = String(req.body?.titulo || '').trim();
    const deporte = String(req.body?.deporte || '').trim();
    const imagenUrl = String(req.body?.imagenUrl || '').trim();
    if (!titulo) {
        res.status(400);
        throw new Error('Indicá un título.');
    }
    if (!COURT_DEPORTES.includes(deporte)) {
        res.status(400);
        throw new Error('Deporte inválido.');
    }
    if (!imagenUrl) {
        res.status(400);
        throw new Error('Indicá la imagen de la cancha (preset o URL).');
    }
    const pines = normalizePins(req.body?.pines);
    const categorias = normalizeIdList(req.body?.categorias);
    const atletas = normalizeIdList(req.body?.atletas);
    const estado = req.body?.estado === 'archivada' ? 'archivada' : 'activa';
    if (estado === 'activa') assertAssignment(categorias, atletas, { publishing: true });

    const doc = await CourtMetric.create({
        titulo,
        deporte,
        imagenUrl,
        imagenPublicId: req.body?.imagenPublicId ? String(req.body.imagenPublicId).trim() : undefined,
        pines,
        categorias,
        atletas,
        creador: req.user._id,
        estado,
    });
    const full = await populateMetric(CourtMetric.findById(doc._id)).lean();
    res.status(201).json(full);
});

// @route GET /api/court-metrics/:id
const getCourtMetric = asyncHandler(async (req, res) => {
    const { CourtMetric } = req.models;
    const metric = await populateMetric(CourtMetric.findById(req.params.id)).lean();
    if (!metric) {
        res.status(404);
        throw new Error('Métrica no encontrada.');
    }
    if (isStaff(req.user)) {
        return res.json(metric);
    }
    const atletaId = userHasRole(req.user, 'atleta') ? req.user._id : req.query.atletaId;
    if (!atletaId || !(await athleteCanAccessMetric(req.models, metric, atletaId))) {
        res.status(403);
        throw new Error('No tenés acceso a esta métrica.');
    }
    res.json(metric);
});

// @route PATCH /api/court-metrics/:id
const updateCourtMetric = asyncHandler(async (req, res) => {
    const { CourtMetric } = req.models;
    const metric = await CourtMetric.findById(req.params.id);
    if (!metric) {
        res.status(404);
        throw new Error('Métrica no encontrada.');
    }
    await assertCanManageMetric(req, metric);

    if (req.body?.titulo != null) metric.titulo = String(req.body.titulo).trim() || metric.titulo;
    if (req.body?.deporte != null) {
        const d = String(req.body.deporte).trim();
        if (!COURT_DEPORTES.includes(d)) {
            res.status(400);
            throw new Error('Deporte inválido.');
        }
        metric.deporte = d;
    }
    if (req.body?.imagenUrl != null) {
        const url = String(req.body.imagenUrl).trim();
        if (!url) {
            res.status(400);
            throw new Error('Imagen inválida.');
        }
        metric.imagenUrl = url;
    }
    if (req.body?.imagenPublicId !== undefined) {
        metric.imagenPublicId = req.body.imagenPublicId
            ? String(req.body.imagenPublicId).trim()
            : undefined;
    }
    if (req.body?.pines != null) metric.pines = normalizePins(req.body.pines);
    if (req.body?.categorias != null) metric.categorias = normalizeIdList(req.body.categorias);
    if (req.body?.atletas != null) metric.atletas = normalizeIdList(req.body.atletas);
    if (req.body?.estado === 'activa' || req.body?.estado === 'archivada') {
        metric.estado = req.body.estado;
    }
    if (metric.estado === 'activa') {
        assertAssignment(metric.categorias.map(String), metric.atletas.map(String), {
            publishing: true,
        });
    }
    await metric.save();
    const full = await populateMetric(CourtMetric.findById(metric._id)).lean();
    res.json(full);
});

// @route DELETE /api/court-metrics/:id
const deleteCourtMetric = asyncHandler(async (req, res) => {
    if (!isStaff(req.user)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    const { CourtMetric, CourtMetricRun, CourtMetricResult } = req.models;
    const metric = await CourtMetric.findById(req.params.id);
    if (!metric) {
        res.status(404);
        throw new Error('Métrica no encontrada.');
    }
    await assertCanManageMetric(req, metric);
    const metricId = metric._id;
    await CourtMetricResult.deleteMany({ metric: metricId });
    await CourtMetricRun.deleteMany({ metric: metricId });
    await metric.deleteOne();
    res.json({ message: 'Métrica eliminada.', _id: metricId });
});

// @route POST /api/court-metrics/:id/runs
const startCourtMetricRun = asyncHandler(async (req, res) => {
    const { CourtMetric, CourtMetricRun } = req.models;
    const metric = await CourtMetric.findById(req.params.id).lean();
    if (!metric || metric.estado !== 'activa') {
        res.status(404);
        throw new Error('Métrica no encontrada o archivada.');
    }
    const atletaId = await resolveTargetAthlete(req, req.body?.atletaId);
    if (!isStaff(req.user) && !(await athleteCanAccessMetric(req.models, metric, atletaId))) {
        res.status(403);
        throw new Error('No tenés acceso a esta métrica.');
    }

    const conReloj = Boolean(req.body?.conReloj);
    const open = await CourtMetricRun.findOne({
        metric: metric._id,
        atleta: atletaId,
        estado: 'en_curso',
    });
    if (open) {
        if (conReloj && !open.usaReloj) {
            open.usaReloj = true;
            open.iniciadoEn = new Date();
            await open.save();
        }
        return res.json(open);
    }

    const now = new Date();
    const run = await CourtMetricRun.create({
        metric: metric._id,
        atleta: atletaId,
        registradoPor: req.user._id,
        usaReloj: conReloj,
        iniciadoEn: conReloj ? now : now,
        estado: 'en_curso',
        duracionSegundos: null,
    });
    res.status(201).json(run);
});

// @route PATCH /api/court-metrics/:id/runs/:runId/finish
const finishCourtMetricRun = asyncHandler(async (req, res) => {
    const { CourtMetric, CourtMetricRun } = req.models;
    const metric = await CourtMetric.findById(req.params.id).lean();
    if (!metric) {
        res.status(404);
        throw new Error('Métrica no encontrada.');
    }
    const run = await CourtMetricRun.findOne({ _id: req.params.runId, metric: metric._id });
    if (!run) {
        res.status(404);
        throw new Error('Entrenamiento no encontrado.');
    }
    if (!canActOnAthleteRun(req, run.atleta)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    if (run.estado !== 'en_curso') {
        return res.json(run);
    }

    const now = new Date();
    run.finalizadoEn = now;
    run.estado = 'finalizada';
    if (run.usaReloj && run.iniciadoEn) {
        const manual = req.body?.duracionSegundos;
        if (manual != null && Number.isFinite(Number(manual)) && Number(manual) >= 0) {
            run.duracionSegundos = Math.round(Number(manual));
        } else {
            run.duracionSegundos = Math.max(
                0,
                Math.round((now.getTime() - new Date(run.iniciadoEn).getTime()) / 1000),
            );
        }
    } else {
        run.duracionSegundos = null;
    }
    await run.save();
    res.json(run);
});

// @route POST /api/court-metrics/:id/runs/:runId/results
const addCourtMetricResult = asyncHandler(async (req, res) => {
    const { CourtMetric, CourtMetricRun, CourtMetricResult } = req.models;
    const metric = await CourtMetric.findById(req.params.id);
    if (!metric || metric.estado !== 'activa') {
        res.status(404);
        throw new Error('Métrica no encontrada o archivada.');
    }
    let run = await CourtMetricRun.findOne({ _id: req.params.runId, metric: metric._id });
    if (!run) {
        res.status(404);
        throw new Error('Entrenamiento no encontrado.');
    }
    if (!canActOnAthleteRun(req, run.atleta)) {
        res.status(403);
        throw new Error('No autorizado.');
    }
    if (run.estado === 'cancelada') {
        res.status(400);
        throw new Error('Este entrenamiento está cancelado.');
    }

    const pinId = req.body?.pinId;
    const pin = metric.pines.id(pinId);
    if (!pin) {
        res.status(400);
        throw new Error('Punto de la cancha inválido.');
    }
    const aciertos = Math.floor(Number(req.body?.aciertos));
    const intentos = Math.floor(Number(req.body?.intentos));
    if (!Number.isFinite(aciertos) || !Number.isFinite(intentos) || intentos < 1 || aciertos < 0) {
        res.status(400);
        throw new Error('Indicá aciertos e intentos válidos.');
    }
    if (aciertos > intentos) {
        res.status(400);
        throw new Error('Los aciertos no pueden ser mayores que los intentos.');
    }
    const porcentaje = Math.round((1000 * aciertos) / intentos) / 10;

    const result = await CourtMetricResult.create({
        run: run._id,
        metric: metric._id,
        pinId: pin._id,
        atleta: run.atleta,
        registradoPor: req.user._id,
        aciertos,
        intentos,
        porcentaje,
        fecha: req.body?.fecha ? new Date(req.body.fecha) : new Date(),
        notasExtra: String(req.body?.notasExtra || '').trim(),
    });

    res.status(201).json(result);
});

// @route GET /api/court-metrics/:id/runs
const listCourtMetricRuns = asyncHandler(async (req, res) => {
    const { CourtMetric, CourtMetricRun, CourtMetricResult } = req.models;
    const metric = await CourtMetric.findById(req.params.id).lean();
    if (!metric) {
        res.status(404);
        throw new Error('Métrica no encontrada.');
    }

    const filter = { metric: metric._id, estado: { $ne: 'cancelada' } };
    if (req.query.atleta && mongoose.Types.ObjectId.isValid(req.query.atleta)) {
        filter.atleta = req.query.atleta;
    } else if (!isStaff(req.user)) {
        filter.atleta = req.user._id;
    }

    if (!isStaff(req.user)) {
        if (!(await athleteCanAccessMetric(req.models, metric, filter.atleta))) {
            res.status(403);
            throw new Error('No tenés acceso.');
        }
    }

    const runs = await CourtMetricRun.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(100, Number(req.query.limit) || 40))
        .populate('atleta', 'nombre apellido')
        .lean();

    const runIds = runs.map((r) => r._id);
    const results = runIds.length
        ? await CourtMetricResult.find({ run: { $in: runIds } }).lean()
        : [];
    const byRun = {};
    for (const r of results) {
        const id = String(r.run);
        if (!byRun[id]) byRun[id] = [];
        byRun[id].push(r);
    }

    res.json({
        runs: runs.map((run) => {
            const rs = byRun[String(run._id)] || [];
            const avg =
                rs.length > 0
                    ? Math.round((rs.reduce((s, x) => s + x.porcentaje, 0) / rs.length) * 10) / 10
                    : null;
            return { ...run, resultados: rs, porcentajePromedio: avg };
        }),
    });
});

// @route GET /api/court-metrics/:id/results/series
const getCourtMetricSeries = asyncHandler(async (req, res) => {
    const { CourtMetric, CourtMetricResult, CourtMetricRun } = req.models;
    const metric = await CourtMetric.findById(req.params.id).lean();
    if (!metric) {
        res.status(404);
        throw new Error('Métrica no encontrada.');
    }
    let atletaId = req.query.atleta;
    if (!isStaff(req.user)) {
        atletaId = String(req.user._id);
        if (!(await athleteCanAccessMetric(req.models, metric, atletaId))) {
            res.status(403);
            throw new Error('No tenés acceso.');
        }
    } else if (!atletaId || !mongoose.Types.ObjectId.isValid(atletaId)) {
        res.status(400);
        throw new Error('Indicá atleta.');
    }

    const filter = { metric: metric._id, atleta: atletaId };
    if (req.query.pinId && mongoose.Types.ObjectId.isValid(req.query.pinId)) {
        filter.pinId = req.query.pinId;
    }
    const results = await CourtMetricResult.find(filter).sort({ fecha: 1 }).lean();
    const runIds = [...new Set(results.map((r) => String(r.run)))];
    const runs = runIds.length
        ? await CourtMetricRun.find({ _id: { $in: runIds } }).select('duracionSegundos usaReloj').lean()
        : [];
    const runMap = Object.fromEntries(runs.map((r) => [String(r._id), r]));

    const pinMap = Object.fromEntries(
        (metric.pines || []).map((p) => [String(p._id), p.label]),
    );

    res.json({
        series: results.map((r) => ({
            fecha: r.fecha,
            porcentaje: r.porcentaje,
            pinId: r.pinId,
            pinLabel: pinMap[String(r.pinId)] || '',
            aciertos: r.aciertos,
            intentos: r.intentos,
            duracionSegundos: runMap[String(r.run)]?.duracionSegundos ?? null,
            runId: r.run,
        })),
    });
});

export {
    listCourtMetrics,
    listMyCourtMetrics,
    createCourtMetric,
    getCourtMetric,
    updateCourtMetric,
    deleteCourtMetric,
    startCourtMetricRun,
    finishCourtMetricRun,
    addCourtMetricResult,
    listCourtMetricRuns,
    getCourtMetricSeries,
};
