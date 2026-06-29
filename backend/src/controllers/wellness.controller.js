import asyncHandler from 'express-async-handler';
import { sortPaymentsByAtleta } from '../utils/listSort.js';

async function assertCategoryStaffAccess(req, res, categoriaId) {
    const { Category } = req.models;
    const rol = req.user.rol;
    if (rol === 'admin_club' || rol === 'administrativo') return;

    if (rol === 'profe') {
        const ok = await Category.findOne({ _id: categoriaId, profesores: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return;
    }
    if (rol === 'preparador_fisico') {
        const ok = await Category.findOne({ _id: categoriaId, preparadoresFisicos: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return;
    }
    if (rol === 'nutricionista') {
        const ok = await Category.findOne({ _id: categoriaId, nutricionistas: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return;
    }
    if (rol === 'psicologo') {
        const ok = await Category.findOne({ _id: categoriaId, psicologos: req.user._id });
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso a esta categoría.');
        }
        return;
    }
    res.status(403);
    throw new Error('No tenés permiso.');
}

function utcStartToday() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function utcEndToday() {
    const d = utcStartToday();
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
}

async function findTodayPre(Wellness, atletaId) {
    return Wellness.findOne({
        atleta: atletaId,
        tipo: 'pre',
        fecha: { $gte: utcStartToday(), $lt: utcEndToday() },
    });
}

async function assertSessionWellnessAccess(req, res, sessionId, atletaId) {
    const { Session, Enrollment } = req.models;
    const sess = await Session.findById(sessionId).select('categoria atletaIndividual estado').lean();
    if (!sess) {
        res.status(404);
        throw new Error('Sesión no encontrada.');
    }
    const categoriaId = sess.categoria?._id || sess.categoria;
    const isStaff = ['admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo', 'administrativo'].includes(
        req.user.rol,
    );

    if (isStaff) {
        await assertCategoryStaffAccess(req, res, categoriaId);
        return { sess, categoriaId };
    }

    if (req.user.rol === 'atleta') {
        if (String(req.user._id) !== String(atletaId)) {
            res.status(403);
            throw new Error('No podés cargar wellness por otro atleta.');
        }
        const ind = sess.atletaIndividual ? String(sess.atletaIndividual) : null;
        if (ind && ind !== String(atletaId)) {
            res.status(403);
            throw new Error('Esta sesión no es tuya.');
        }
        const enr = await Enrollment.findOne({ atleta: atletaId, categoria: categoriaId, estado: 'activo' });
        if (!enr) {
            res.status(403);
            throw new Error('No estás inscripto en la categoría de esta sesión.');
        }
        return { sess, categoriaId };
    }

    res.status(403);
    throw new Error('Sin permiso.');
}

function utcStartDaysAgo(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function ymdUtc(date) {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const WELLNESS_METRICS = [
    { key: 'sueno', label: 'Sueño', tipo: 'pre', scaleMax: 10 },
    { key: 'estres', label: 'Estrés', tipo: 'pre', scaleMax: 10 },
    { key: 'fatiga', label: 'Fatiga', tipo: 'pre', scaleMax: 10 },
    { key: 'dolorMuscular', label: 'Dolor muscular', tipo: 'pre', scaleMax: 10 },
    { key: 'rpe', label: 'RPE', tipo: 'post', scaleMax: 10 },
];

/** Valor de métrica en un documento (compatibilidad con registros antiguos). */
function wellnessMetricValue(doc, key) {
    const raw = doc[key];
    if (raw != null && !Number.isNaN(Number(raw))) return Number(raw);
    if (key === 'sueno' && doc.suenoCalidad != null && !Number.isNaN(Number(doc.suenoCalidad))) {
        return Number(doc.suenoCalidad);
    }
    return null;
}

function labelFromYmd(ymd) {
    const parts = ymd.split('-');
    return `${parts[2]}/${parts[1]}`;
}

function buildWellnessHistorial(docs) {
    const sorted = [...docs].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const registros = sorted.map((w) => {
        const ymd = ymdUtc(w.fecha);
        return {
            fecha: ymd,
            label: labelFromYmd(ymd),
            tipo: w.tipo,
            sueno: wellnessMetricValue(w, 'sueno'),
            estres: wellnessMetricValue(w, 'estres'),
            fatiga: wellnessMetricValue(w, 'fatiga'),
            dolorMuscular: wellnessMetricValue(w, 'dolorMuscular'),
            rpe: w.rpe ?? null,
        };
    });

    const series = WELLNESS_METRICS.map((def) => {
        const puntos = sorted
            .map((w) => {
                if (w.tipo !== def.tipo) return null;
                const valor = wellnessMetricValue(w, def.key);
                if (valor == null) return null;
                const ymd = ymdUtc(w.fecha);
                return {
                    fecha: ymd,
                    label: labelFromYmd(ymd),
                    valor,
                    tipo: w.tipo,
                };
            })
            .filter(Boolean);
        return {
            key: def.key,
            label: def.label,
            tipo: def.tipo,
            scaleMax: def.scaleMax,
            puntos,
        };
    }).filter((s) => s.puntos.length > 0);

    return { registros, series };
}

// @desc    Cargar formulario Wellness (Pre o Post)
// @route   POST /api/wellness
const submitWellness = asyncHandler(async (req, res) => {
    // Agregamos atletaId al destructuring
    const { atletaId, tipo, sesion, sueno, estres, fatiga, dolorMuscular, rpe } = req.body;
    const { Wellness } = req.models;

    if (!tipo || !['pre', 'post'].includes(tipo)) {
        res.status(400);
        throw new Error('tipo debe ser pre o post.');
    }

    let idDestinatario = req.user._id;

    const isStaff = ['admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'].includes(req.user.rol);

    if (atletaId && isStaff) {
        idDestinatario = atletaId;
    } else if (req.user.rol === 'tutor' && atletaId) {
        const { User } = req.models;
        const hijo = await User.findById(atletaId).select('rol tutorPrincipal').lean();
        if (!hijo || hijo.rol !== 'atleta' || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            res.status(403);
            throw new Error('No podés cargar wellness por este atleta.');
        }
        idDestinatario = atletaId;
    } else if (atletaId && String(atletaId) !== String(req.user._id)) {
        res.status(403);
        throw new Error('No podés cargar wellness por otro atleta.');
    }

    const fields = {};
    if (tipo === 'pre') {
        if (sueno != null) fields.sueno = sueno;
        if (estres != null) fields.estres = estres;
        if (fatiga != null) fields.fatiga = fatiga;
        if (dolorMuscular != null) fields.dolorMuscular = dolorMuscular;
    } else if (rpe != null) {
        fields.rpe = rpe;
    }

    if (tipo === 'pre') {
        if (sesion) {
            await assertSessionWellnessAccess(req, res, sesion, idDestinatario);
        }
        const existing = await findTodayPre(Wellness, idDestinatario);
        if (existing) {
            Object.assign(existing, fields);
            if (sesion) existing.sesion = sesion;
            await existing.save();
            return res.json(existing);
        }
        const report = await Wellness.create({
            atleta: idDestinatario,
            tipo: 'pre',
            sesion: sesion || undefined,
            ...fields,
        });
        return res.status(201).json(report);
    }

    if (!sesion) {
        res.status(400);
        throw new Error('El RPE requiere una sesión de entrenamiento.');
    }

    await assertSessionWellnessAccess(req, res, sesion, idDestinatario);

    const existingPost = await Wellness.findOne({ atleta: idDestinatario, sesion, tipo: 'post' });
    if (existingPost) {
        Object.assign(existingPost, fields);
        await existingPost.save();
        return res.json(existingPost);
    }

    const report = await Wellness.create({
        atleta: idDestinatario,
        tipo: 'post',
        sesion,
        ...fields,
    });

    res.status(201).json(report);
});

// @desc    Ver estado de wellness del equipo (Para el Profe)
// @route   GET /api/wellness/equipo/:categoriaId
const getTeamWellness = asyncHandler(async (req, res) => {
    const { Wellness, Enrollment } = req.models;
    const { categoriaId } = req.params;

    await assertCategoryStaffAccess(req, res, categoriaId);

    // 1. Buscamos los atletas de la categoría
    const inscritos = await Enrollment.find({ categoria: categoriaId, estado: 'activo' });
    const atletasIds = inscritos.map(i => i.atleta);

    // 2. Traemos los reportes de hoy
    const reportes = await Wellness.find({
        atleta: { $in: atletasIds },
        fecha: { $gte: utcStartToday(), $lt: utcEndToday() },
    }).populate('atleta', 'nombre apellido');

    res.json(reportes);
});

// @desc Wellness de una sesión: pre del día + RPE post de esta sesión
// @route GET /api/wellness/sesion/:sessionId
const getSessionWellness = asyncHandler(async (req, res) => {
    const { Wellness, Enrollment } = req.models;
    const { sessionId } = req.params;
    const { Session } = req.models;

    const sess = await Session.findById(sessionId).select('categoria').lean();
    if (!sess) {
        res.status(404);
        throw new Error('Sesión no encontrada.');
    }
    const categoriaId = sess.categoria?._id || sess.categoria;
    await assertCategoryStaffAccess(req, res, categoriaId);

    const inscritos = await Enrollment.find({ categoria: categoriaId, estado: 'activo' }).select('atleta').lean();
    const atletasIds = inscritos.map((i) => i.atleta);

    const [preHoy, postSesion] = await Promise.all([
        Wellness.find({
            atleta: { $in: atletasIds },
            tipo: 'pre',
            fecha: { $gte: utcStartToday(), $lt: utcEndToday() },
        })
            .populate('atleta', 'nombre apellido')
            .lean(),
        Wellness.find({ sesion: sessionId, tipo: 'post' })
            .populate('atleta', 'nombre apellido')
            .lean(),
    ]);

    res.json({
        preHoy: sortPaymentsByAtleta(preHoy),
        postSesion: sortPaymentsByAtleta(postSesion),
    });
});

// @desc Estado wellness del atleta (o hijo del tutor) para hoy
// @route GET /api/wellness/mi-hoy?atletaId=
const getMyWellnessToday = asyncHandler(async (req, res) => {
    const { Wellness, Session, Enrollment } = req.models;
    let atletaId = req.user._id;

    if (req.user.rol === 'tutor' && req.query.atletaId) {
        const { User } = req.models;
        const hijo = await User.findById(req.query.atletaId).select('rol tutorPrincipal').lean();
        if (!hijo || hijo.rol !== 'atleta' || String(hijo.tutorPrincipal) !== String(req.user._id)) {
            res.status(403);
            throw new Error('No podés ver el wellness de este atleta.');
        }
        atletaId = hijo._id;
    } else if (req.user.rol !== 'atleta') {
        res.status(403);
        throw new Error('Solo atletas o tutores pueden usar este endpoint.');
    }

    const pre = await findTodayPre(Wellness, atletaId);

    const enrollments = await Enrollment.find({ atleta: atletaId, estado: 'activo' }).select('categoria').lean();
    const catIds = enrollments.map((e) => e.categoria);

    const sesionesHoy = await Session.find({
        categoria: { $in: catIds },
        fecha: { $gte: utcStartToday(), $lt: utcEndToday() },
        estado: { $ne: 'cancelada' },
        tipo: { $in: ['entrenamiento', 'partido'] },
    })
        .select('fecha horaInicio horaFin tipo categoria estado')
        .populate('categoria', 'nombre')
        .sort({ horaInicio: 1 })
        .lean();

    const sessionIds = sesionesHoy.map((s) => s._id);
    const posts = sessionIds.length
        ? await Wellness.find({ atleta: atletaId, tipo: 'post', sesion: { $in: sessionIds } }).lean()
        : [];
    const postBySession = Object.fromEntries(posts.map((p) => [String(p.sesion), p]));

    res.json({
        pre,
        preHecho: !!pre,
        sesionesHoy: sesionesHoy.map((s) => ({
            ...s,
            post: postBySession[String(s._id)] || null,
            postHecho: !!postBySession[String(s._id)],
        })),
    });
});

// @route GET /api/wellness/atleta/:atletaId/historial?dias=30
const getAthleteWellnessHistory = asyncHandler(async (req, res) => {
    const { Wellness, Enrollment, Category } = req.models;
    const { atletaId } = req.params;
    const dias = Math.min(90, Math.max(7, parseInt(req.query.dias, 10) || 30));
    const categoriaId = req.query.categoriaId;

    const isStaff = ['admin_club', 'administrativo', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'].includes(
        req.user.rol,
    );
    if (!isStaff) {
        res.status(403);
        throw new Error('Sin permiso.');
    }

    if (categoriaId) {
        await assertCategoryStaffAccess(req, res, categoriaId);
        const enr = await Enrollment.findOne({ atleta: atletaId, categoria: categoriaId, estado: 'activo' });
        if (!enr) {
            res.status(403);
            throw new Error('El atleta no pertenece a esta categoría.');
        }
    } else if (req.user.rol !== 'admin_club' && req.user.rol !== 'administrativo') {
        const enrollments = await Enrollment.find({ atleta: atletaId, estado: 'activo' }).select('categoria').lean();
        const catIds = enrollments.map((e) => e.categoria);
        const rol = req.user.rol;
        let ok = false;
        if (rol === 'profe') {
            ok = !!(await Category.findOne({ _id: { $in: catIds }, profesores: req.user._id }));
        } else if (rol === 'preparador_fisico') {
            ok = !!(await Category.findOne({ _id: { $in: catIds }, preparadoresFisicos: req.user._id }));
        } else if (rol === 'nutricionista') {
            ok = !!(await Category.findOne({ _id: { $in: catIds }, nutricionistas: req.user._id }));
        } else if (rol === 'psicologo') {
            ok = !!(await Category.findOne({ _id: { $in: catIds }, psicologos: req.user._id }));
        }
        if (!ok) {
            res.status(403);
            throw new Error('No tenés acceso al historial de este atleta.');
        }
    }

    const desde = utcStartDaysAgo(dias - 1);
    const docs = await Wellness.find({ atleta: atletaId, fecha: { $gte: desde } })
        .sort({ fecha: 1 })
        .lean();

    res.json({ dias, ...buildWellnessHistorial(docs) });
});

// @route GET /api/wellness/categoria/:categoriaId/historial?dias=30
const getCategoryWellnessHistory = asyncHandler(async (req, res) => {
    const { Wellness, Enrollment } = req.models;
    const { categoriaId } = req.params;
    const dias = Math.min(90, Math.max(7, parseInt(req.query.dias, 10) || 30));

    await assertCategoryStaffAccess(req, res, categoriaId);

    const inscritos = await Enrollment.find({ categoria: categoriaId, estado: 'activo' }).select('atleta').lean();
    const atletasIds = inscritos.map((i) => i.atleta);
    if (!atletasIds.length) {
        return res.json({ dias, porAtleta: {} });
    }

    const desde = utcStartDaysAgo(dias - 1);
    const docs = await Wellness.find({ atleta: { $in: atletasIds }, fecha: { $gte: desde } })
        .sort({ fecha: 1 })
        .lean();

    const porAtleta = {};
    atletasIds.forEach((id) => {
        porAtleta[String(id)] = { series: [], registros: [] };
    });

    const grouped = {};
    docs.forEach((w) => {
        const key = String(w.atleta);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(w);
    });
    Object.keys(grouped).forEach((key) => {
        porAtleta[key] = buildWellnessHistorial(grouped[key]);
    });

    res.json({ dias, porAtleta });
});

export {
    submitWellness,
    getTeamWellness,
    getSessionWellness,
    getMyWellnessToday,
    getAthleteWellnessHistory,
    getCategoryWellnessHistory,
};