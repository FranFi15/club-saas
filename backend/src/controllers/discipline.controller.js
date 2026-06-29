import asyncHandler from 'express-async-handler';
import { sortByField } from '../utils/listSort.js';

// @desc    Crear nueva disciplina
// @route   POST /api/disciplines
// @access  Private (Admin del Club)
const createDiscipline = asyncHandler(async (req, res) => {
    const { nombre, descripcion, coordinador, planDefault } = req.body;
    
    const { Discipline } = req.models;

    const exists = await Discipline.findOne({ nombre });
    if (exists) {
        res.status(400);
        throw new Error('Esta disciplina ya está registrada en el club');
    }

    const discipline = await Discipline.create({
        nombre,
        descripcion,
        coordinador: coordinador || req.user._id,
        planDefault: planDefault || undefined
    });

    res.status(201).json(discipline);
});

// @desc    Obtener todas las disciplinas
// @route   GET /api/disciplines
const getDisciplines = asyncHandler(async (req, res) => {
    const { Discipline } = req.models;
    
    const disciplines = await Discipline.find({})
        .populate('coordinador', 'nombre apellido')
        .populate('planDefault', 'nombre monto')
        .sort({ nombre: 1 })
        .lean();
    res.json(sortByField(disciplines));
});

// @desc    Editar una disciplina (Ej: Cambiar el coordinador o el nombre)
// @route   PUT /api/disciplines/:id
const updateDiscipline = asyncHandler(async (req, res) => {
    const { Discipline } = req.models;
    const { nombre, descripcion, coordinador, planDefault } = req.body;

    const discipline = await Discipline.findById(req.params.id);

    if (!discipline) {
        res.status(404);
        throw new Error('Disciplina no encontrada');
    }

    discipline.nombre = nombre || discipline.nombre;
    discipline.descripcion = descripcion !== undefined ? descripcion : discipline.descripcion;
    if (coordinador) discipline.coordinador = coordinador;
    if (planDefault !== undefined) discipline.planDefault = planDefault || null;

    const updatedDiscipline = await discipline.save();
    await updatedDiscipline.populate('planDefault', 'nombre monto');
    res.json(updatedDiscipline);
});

// @desc    Eliminar disciplina (EFECTO DOMINÓ: Borra categorías y da de baja alumnos)
// @route   DELETE /api/disciplines/:id
const deleteDiscipline = asyncHandler(async (req, res) => {
    // Necesitamos traer los tres modelos involucrados
    const { Discipline, Category, Enrollment } = req.models;
    
    const discipline = await Discipline.findById(req.params.id);

    if (!discipline) {
        res.status(404);
        throw new Error('Disciplina no encontrada');
    }

    // 1. Buscamos todas las categorías que pertenecen a esta disciplina
    const categoriasAfectadas = await Category.find({ disciplina: discipline._id });
    const categoriasIds = categoriasAfectadas.map(cat => cat._id);

    // 2. Si había categorías, ejecutamos el efecto dominó
    if (categoriasIds.length > 0) {
        // PASO A: Damos de baja a todos los atletas activos en estas categorías
        // Usamos $in para buscar cualquier alumno que esté en alguna de esas categorías
        await Enrollment.updateMany(
            { categoria: { $in: categoriasIds }, estado: 'activo' },
            { $set: { estado: 'inactivo', fechaBaja: Date.now() } }
        );

        // PASO B: Eliminamos físicamente las categorías
        await Category.deleteMany({ disciplina: discipline._id });
    }

    // 3. Finalmente, eliminamos la disciplina
    await discipline.deleteOne();

    res.json({ 
        message: 'Disciplina eliminada con éxito',
        detalles: `Se eliminaron ${categoriasIds.length} categoría(s) y se dio de baja a sus alumnos correspondientes.`
    });
});

export { createDiscipline, getDisciplines, updateDiscipline, deleteDiscipline };