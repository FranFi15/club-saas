import asyncHandler from 'express-async-handler';

// @desc    Reportar nueva lesión y poner al atleta como "Inactivo"
// @route   POST /api/medical/injuries
const reportInjury = asyncHandler(async (req, res) => {
    const { atleta, diagnostico, tipoLesion, totalEtapas } = req.body;
    const { Injury, User, News } = req.models;

    // 1. Creamos el registro médico
    const injury = await Injury.create({
        atleta,
        diagnostico,
        tipoLesion,
        totalEtapas,
        medico: req.user._id,
        estaDisponibleParaEntrenar: false
    });

    // 2. MAGIA: Marcamos al usuario como inactivo para que PF y DT lo vean
    await User.findByIdAndUpdate(atleta, { disponibilidad: 'lesionado' });

    // 3. Notificación automática al Muro (Para que el Profe se entere)
    await News.create({
        titulo: 'Parte Médico Actualizado',
        contenido: `El atleta ha iniciado un proceso de recuperación por: ${diagnostico}. No estará disponible para entrenamientos.`,
        autor: req.user._id,
        tipo: 'urgente',
        alcance: 'usuario',
        targetUsuarios: [atleta]
    });

    res.status(201).json(injury);
});

// @desc    Actualizar etapa de recuperación (Subir de nivel)
// @route   PATCH /api/medical/injuries/:id/next-stage
const updateRecoveryStage = asyncHandler(async (req, res) => {
    const { Injury, User } = req.models;
    const { nuevaEtapa, descripcion, estadoRecuperacion, estaDisponible } = req.body;

    const injury = await Injury.findById(req.params.id);
    if (!injury) { res.status(404); throw new Error('Registro no encontrado'); }

    injury.etapaActual = nuevaEtapa;
    injury.estadoRecuperacion = estadoRecuperacion;
    injury.estaDisponibleParaEntrenar = estaDisponible;
    
    injury.historialEtapas.push({ etapa: nuevaEtapa, descripcion });

    // Si le dan el alta médica
    if (estadoRecuperacion === 'alta_medica') {
        await User.findByIdAndUpdate(injury.atleta, { disponibilidad: 'disponible' });
    }

    await injury.save();
    res.json(injury);
});

export { reportInjury, updateRecoveryStage };