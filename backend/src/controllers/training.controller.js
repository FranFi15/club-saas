import asyncHandler from 'express-async-handler';

// @desc    Crear un plan de entrenamiento
// @route   POST /api/training/plans
const createTrainingPlan = asyncHandler(async (req, res) => {
    const { TrainingPlan } = req.models;
    const plan = await TrainingPlan.create({ ...req.body, creador: req.user._id });
    res.status(201).json(plan);
});

// @desc    Obtener un plan por ID
// @route   GET /api/training/plans/:id
const getTrainingPlan = asyncHandler(async (req, res) => {
    const { TrainingPlan } = req.models;
    const plan = await TrainingPlan.findById(req.params.id);
    if (!plan) { res.status(404); throw new Error('Plan no encontrado'); }
    res.json(plan);
});

// @desc    Análisis Táctico Semanal (La joya de la corona)
// @route   GET /api/training/analytics/:categoriaId
const getTacticalAnalytics = asyncHandler(async (req, res) => {
    const { Session } = req.models;
    
    // Buscamos las sesiones de los últimos 7 días
    const sieteDiasAtras = new Date();
    sieteDiasAtras.setDate(sieteDiasAtras.getDate() - 7);

    // Traemos las sesiones completadas CON sus planes de entrenamiento pegados
    const sesiones = await Session.find({
        categoria: req.params.categoriaId,
        fecha: { $gte: sieteDiasAtras },
        estado: 'completada'
    }).populate('planEntrenamiento');

    // Acá el backend "mastica" los datos para que tu React solo dibuje gráficos
    let estadisticas = {
        totalMinutos: 0,
        porEnfoque: { ofensivo: 0, defensivo: 0, fisico: 0, tecnico: 0, transicion_ataque: 0, transicion_defensa: 0, neutro: 0 },
        porFormato: {} // Acá sumaremos los "5vs5", "3vs2", etc.
    };

    sesiones.forEach(sesion => {
        if (sesion.planEntrenamiento && sesion.planEntrenamiento.bloques) {
            sesion.planEntrenamiento.bloques.forEach(bloque => {
                estadisticas.totalMinutos += bloque.duracionMinutos;
                
                // Sumamos minutos por enfoque (Ofensivo/Defensivo)
                if (estadisticas.porEnfoque[bloque.enfoque] !== undefined) {
                    estadisticas.porEnfoque[bloque.enfoque] += bloque.duracionMinutos;
                }

                // Sumamos minutos por formato (5vs5, etc)
                if (!estadisticas.porFormato[bloque.formato]) {
                    estadisticas.porFormato[bloque.formato] = 0;
                }
                estadisticas.porFormato[bloque.formato] += bloque.duracionMinutos;
            });
        }
    });

    res.json({
        sesionesAnalizadas: sesiones.length,
        estadisticas
    });
});

export { createTrainingPlan, getTrainingPlan, getTacticalAnalytics };