import asyncHandler from 'express-async-handler';
import { calcEdad } from '../utils/ageHelper.js';
import { categorySexoFromEnrollments, resolveAtletaSexo } from '../utils/atletaSexo.js';
import { getClubBodyFatMethod, setClubBodyFatMethod } from '../services/nutriClubSettings.service.js';

// --- SECCIÓN MÉTRICAS (PF / NUTRI) ---

const AREAS_BY_ROLE = {
    admin_club: [
        'fisico',
        'nutricion',
        'medico',
        'pliegues_cutaneos',
        'metodologia_isak',
        'diametros_oseos',
        'datos_basicos',
        'perimetros',
    ],
    administrativo: [
        'fisico',
        'nutricion',
        'medico',
        'pliegues_cutaneos',
        'metodologia_isak',
        'diametros_oseos',
        'datos_basicos',
        'perimetros',
    ],
    profe: ['fisico'],
    preparador_fisico: ['fisico'],
    nutricionista: ['datos_basicos', 'metodologia_isak', 'diametros_oseos', 'perimetros'],
};

function assertAreaAllowedForRole(res, rol, area) {
    const allowed = AREAS_BY_ROLE[rol];
    if (!allowed) {
        res.status(403);
        throw new Error('Tu rol no puede crear definiciones de métricas.');
    }
    if (!allowed.includes(area)) {
        res.status(400);
        const msg =
            rol === 'nutricionista'
                ? 'Como nutricionista solo podés crear métricas ISAK o diámetros óseos.'
                : rol === 'preparador_fisico' || rol === 'profe'
                  ? 'Solo podés crear métricas de área física.'
                  : 'Área de métrica no permitida para tu rol.';
        throw new Error(msg);
    }
}

// @desc    Crear una nueva definición de métrica
// @route   POST /api/performance/metrics/definitions
const createMetricDefinition = asyncHandler(async (req, res) => {
    const { nombre, unidad, mejorDireccion, area } = req.body;
    const { MetricDefinition } = req.models;

    const VALID_AREAS = [
        'fisico',
        'nutricion',
        'medico',
        'pliegues_cutaneos',
        'metodologia_isak',
        'diametros_oseos',
        'datos_basicos',
        'perimetros',
    ];
    if (!area || !VALID_AREAS.includes(area)) {
        res.status(400);
        throw new Error('Indicá un área de métrica válida.');
    }

    assertAreaAllowedForRole(res, req.user.rol, area);

    const definition = await MetricDefinition.create({
        nombre,
        unidad,
        mejorDireccion,
        area,
        creador: req.user._id
    });

    res.status(201).json(definition);
});

// @desc    Listar definiciones de métricas del club
// @route   GET /api/performance/metrics/definitions
const listMetricDefinitions = asyncHandler(async (req, res) => {
    const { MetricDefinition } = req.models;
    const list = await MetricDefinition.find({}).sort({ nombre: 1 });
    res.json(list);
});

// @desc    Registrar una medición para un atleta
// @route   POST /api/performance/measurements
const addMeasurement = asyncHandler(async (req, res) => {
    const { atleta, metrica, valor, notasExtra, visibleParaAtleta, visibleParaTutor, fechaMedicion } = req.body;
    const { Measurement } = req.models;

    const measurement = await Measurement.create({
        atleta,
        metrica,
        valor,
        notasExtra,
        visibleParaAtleta,
        visibleParaTutor,
        evaluador: req.user._id,
        ...(fechaMedicion != null && String(fechaMedicion).trim() !== ''
            ? { fechaMedicion: new Date(fechaMedicion) }
            : {}),
    });

    res.status(201).json(measurement);
});

// @desc    Registrar varias mediciones a la vez (misma fecha / notas / visibilidad)
// @route   POST /api/performance/measurements/bulk
const addMeasurementsBulk = asyncHandler(async (req, res) => {
    const {
        atleta,
        mediciones,
        notasExtra,
        visibleParaAtleta,
        visibleParaTutor,
        fechaMedicion,
    } = req.body;
    const { Measurement } = req.models;

    if (!atleta) {
        res.status(400);
        throw new Error('Indicá el atleta.');
    }
    if (!Array.isArray(mediciones) || !mediciones.length) {
        res.status(400);
        throw new Error('Indicá al menos un valor para guardar.');
    }

    const fecha =
        fechaMedicion != null && String(fechaMedicion).trim() !== ''
            ? new Date(fechaMedicion)
            : new Date();

    const notas = (notasExtra || '').trim() || undefined;
    const visAtleta = visibleParaAtleta !== false;
    const visTutor = visibleParaTutor !== false;

    const created = [];
    for (const item of mediciones) {
        if (!item?.metrica) continue;
        const num = Number(item.valor);
        if (!Number.isFinite(num)) continue;

        const measurement = await Measurement.create({
            atleta,
            metrica: item.metrica,
            valor: num,
            notasExtra: notas,
            visibleParaAtleta: visAtleta,
            visibleParaTutor: visTutor,
            evaluador: req.user._id,
            fechaMedicion: fecha,
        });
        created.push(measurement);
    }

    if (!created.length) {
        res.status(400);
        throw new Error('Ningún valor numérico válido. Revisá los campos ingresados.');
    }

    res.status(201).json({
        message: `Se guardaron ${created.length} medición(es).`,
        guardados: created.length,
        mediciones: created,
    });
});

// --- SECCIÓN NOTAS CLÍNICAS (PSICO / MÉDICO) ---

// @desc    Crear una nota evolutiva (Rich Text)
// @route   POST /api/performance/clinical-notes
const createClinicalNote = asyncHandler(async (req, res) => {
    const { atleta, titulo, contenidoRichText, visibleParaAtleta, visibleParaTutor } = req.body;
    const { ClinicalNote, Category, Enrollment } = req.models;

    if (!atleta) {
        res.status(400);
        throw new Error('Indicá el atleta.');
    }
    const tituloTxt = String(titulo || '').trim();
    const contenidoTxt = String(contenidoRichText || '').trim();
    if (!tituloTxt || !contenidoTxt) {
        res.status(400);
        throw new Error('Título y contenido de la nota son obligatorios.');
    }

    if (req.user.rol === 'psicologo') {
        const misCats = await Category.find({ psicologos: req.user._id }).select('_id');
        const catIds = misCats.map((c) => c._id);
        const enr = await Enrollment.findOne({
            atleta,
            categoria: { $in: catIds },
            estado: 'activo',
        }).select('_id');
        if (!enr) {
            res.status(403);
            throw new Error('No tenés acceso a este atleta.');
        }
    }

    const note = await ClinicalNote.create({
        atleta,
        autor: req.user._id,
        area: 'psicologia',
        titulo: tituloTxt.slice(0, 120),
        contenidoRichText: contenidoTxt,
        visibleParaAtleta: visibleParaAtleta === true,
        visibleParaTutor: visibleParaTutor === true,
    });

    res.status(201).json(note);
});

// --- SECCIÓN CONSULTAS (FEED / HISTORIAL) ---

// @desc    Obtener el perfil de rendimiento de un atleta (Lo que el pibe/padre ven)
// @route   GET /api/performance/atleta/:atletaId
const getAthletePerformance = asyncHandler(async (req, res) => {
    const { Measurement, ClinicalNote, User, Session, Enrollment } = req.models;
    const userId = req.user._id;
    const isOwner = userId.toString() === req.params.atletaId;
    const isStaff = ['admin_club', 'profe', 'preparador_fisico', 'nutricionista', 'psicologo'].includes(req.user.rol);

    // Filtros de visibilidad
    let measurementFilter = { atleta: req.params.atletaId };
    let noteFilter = { atleta: req.params.atletaId };

    if (!isStaff) {
        // Si no es staff, filtramos por lo que el profesional permitió ver
        if (isOwner) {
            measurementFilter.visibleParaAtleta = true;
            noteFilter.visibleParaAtleta = true;
        } else {
            // Asumimos que es el tutor (esto se validaría con la relación en el modelo User)
            measurementFilter.visibleParaTutor = true;
            noteFilter.visibleParaTutor = true;
        }
    }

    const mediciones = await Measurement.find(measurementFilter)
        .populate('metrica')
        .populate('evaluador', 'nombre apellido rol')
        .sort({ fechaMedicion: -1 });

    const notas = await ClinicalNote.find(noteFilter)
        .populate('autor', 'nombre apellido rol')
        .sort({ fecha: -1 });

    const psychFilter = {
        tipo: 'consulta_psicologia',
        atletaIndividual: req.params.atletaId,
        estado: { $ne: 'cancelada' },
        informeSesion: { $exists: true, $nin: [null, ''] },
    };
    if (!isStaff) {
        if (isOwner) {
            psychFilter.informeVisibleParaAtleta = { $ne: false };
        } else {
            psychFilter.informeVisibleParaTutor = { $ne: false };
        }
    }

    const informesPsicologia = await Session.find(psychFilter)
        .select('fecha horaInicio horaFin informeSesion estado categoria')
        .populate('categoria', 'nombre')
        .sort({ fecha: -1 })
        .limit(80)
        .lean();

    const notasPsicologia = (notas || []).filter((n) => n.area === 'psicologia');

    const atletaUser = await User.findById(req.params.atletaId)
        .select('nombre apellido fechaNacimiento sexo')
        .lean();
    const categorySexo = atletaUser
        ? await categorySexoFromEnrollments(Enrollment, req.params.atletaId)
        : '';
    const atleta =
        atletaUser != null
            ? {
                  _id: atletaUser._id,
                  nombre: atletaUser.nombre,
                  apellido: atletaUser.apellido,
                  sexo: resolveAtletaSexo(atletaUser.sexo || '', categorySexo),
                  edad: calcEdad(atletaUser.fechaNacimiento),
              }
            : null;

    const metodoGrasaCorporal = await getClubBodyFatMethod(req.models);

    res.json({
        mediciones,
        notas,
        notasPsicologia,
        informesPsicologia,
        atleta,
        nutricion: { metodoGrasaCorporal },
    });
});

// @desc    ¿El tutor tiene mediciones visibles para algún hijo?
// @route   GET /api/performance/tutor-metrics-access
const getTutorMetricsAccess = asyncHandler(async (req, res) => {
    const { User, Measurement } = req.models;

    if (req.user.rol !== 'tutor') {
        res.status(403);
        throw new Error('Solo disponible para tutores.');
    }

    const hijos = await User.find({ tutorPrincipal: req.user._id, rol: 'atleta' }).select('_id').lean();
    const ids = hijos.map((h) => h._id);

    if (!ids.length) {
        return res.json({ available: false, count: 0 });
    }

    const count = await Measurement.countDocuments({
        atleta: { $in: ids },
        visibleParaTutor: true,
    });

    res.json({ available: count > 0, count });
});

// @desc    Configuración nutrición del club (% grasa)
// @route   GET /api/performance/nutricion/settings
const getNutritionClubSettings = asyncHandler(async (req, res) => {
    const metodoGrasaCorporal = await getClubBodyFatMethod(req.models);
    res.json({ metodoGrasaCorporal });
});

// @desc    Nutricionista: fórmula de % grasa para todo el club
// @route   PATCH /api/performance/nutricion/settings
const setNutritionClubSettings = asyncHandler(async (req, res) => {
    const metodoGrasaCorporal = await setClubBodyFatMethod(req.models, req.body.metodo);
    res.json({
        metodoGrasaCorporal,
        message: 'Método de % grasa del club actualizado',
    });
});


// @desc    Editar una medición
// @route   PUT /api/performance/measurements/:id
const updateMeasurement = asyncHandler(async (req, res) => {
    const { Measurement } = req.models;
    const { valor, notasExtra, visibleParaAtleta, visibleParaTutor, fechaMedicion } = req.body;

    const measurement = await Measurement.findById(req.params.id);

    if (!measurement) {
        res.status(404);
        throw new Error('Medición no encontrada');
    }

    const canManage =
        measurement.evaluador.toString() === req.user._id.toString() ||
        req.user.rol === 'admin_club' ||
        req.user.rol === 'nutricionista';
    if (!canManage) {
        res.status(403);
        throw new Error('No tenés permiso para editar esta medición');
    }

    measurement.valor = valor !== undefined ? valor : measurement.valor;
    measurement.notasExtra = notasExtra !== undefined ? notasExtra : measurement.notasExtra;
    measurement.visibleParaAtleta = visibleParaAtleta !== undefined ? visibleParaAtleta : measurement.visibleParaAtleta;
    measurement.visibleParaTutor = visibleParaTutor !== undefined ? visibleParaTutor : measurement.visibleParaTutor;
    if (fechaMedicion !== undefined && String(fechaMedicion).trim() !== '') {
        measurement.fechaMedicion = new Date(fechaMedicion);
    }

    const updatedMeasurement = await measurement.save();
    res.json(updatedMeasurement);
});

// @desc    Eliminar una medición
// @route   DELETE /api/performance/measurements/:id
const deleteMeasurement = asyncHandler(async (req, res) => {
    const { Measurement } = req.models;
    const measurement = await Measurement.findById(req.params.id);

    if (!measurement) {
        res.status(404);
        throw new Error('Medición no encontrada');
    }

    const canManage =
        measurement.evaluador.toString() === req.user._id.toString() ||
        req.user.rol === 'admin_club' ||
        req.user.rol === 'nutricionista';
    if (!canManage) {
        res.status(403);
        throw new Error('No tenés permiso para eliminar esta medición');
    }

    await measurement.deleteOne();
    res.json({ message: 'Medición eliminada correctamente' });
});


// --- EDICIÓN Y BORRADO DE NOTAS CLÍNICAS (PSICO / MÉDICO) ---

// @desc    Editar una nota evolutiva
// @route   PUT /api/performance/clinical-notes/:id
const updateClinicalNote = asyncHandler(async (req, res) => {
    const { ClinicalNote } = req.models;
    const { titulo, contenidoRichText, visibleParaAtleta, visibleParaTutor } = req.body;

    const note = await ClinicalNote.findById(req.params.id);

    if (!note) {
        res.status(404);
        throw new Error('Nota clínica no encontrada');
    }

    // Seguridad estricta: Las notas médicas son delicadas. Solo el autor puede tocarlas.
    if (note.autor.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Privacidad: Solo el profesional que redactó la nota puede editarla');
    }

    note.titulo = titulo || note.titulo;
    note.contenidoRichText = contenidoRichText || note.contenidoRichText;
    note.visibleParaAtleta = visibleParaAtleta !== undefined ? visibleParaAtleta : note.visibleParaAtleta;
    note.visibleParaTutor = visibleParaTutor !== undefined ? visibleParaTutor : note.visibleParaTutor;

    const updatedNote = await note.save();
    res.json(updatedNote);
});

// @desc    Eliminar una nota evolutiva
// @route   DELETE /api/performance/clinical-notes/:id
const deleteClinicalNote = asyncHandler(async (req, res) => {
    const { ClinicalNote } = req.models;
    const note = await ClinicalNote.findById(req.params.id);

    if (!note) {
        res.status(404);
        throw new Error('Nota clínica no encontrada');
    }

    if (note.autor.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Privacidad: Solo el profesional que redactó la nota puede eliminarla');
    }

    await note.deleteOne();
    res.json({ message: 'Nota clínica eliminada correctamente' });
});

export {
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
};