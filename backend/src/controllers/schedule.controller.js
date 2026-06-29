import asyncHandler from 'express-async-handler';
import { hasTimeOverlap } from '../utils/timeHelper.js';
import {
    parseCalendarEndDate,
    syncFutureSessionsForSchedule,
    trimSessionsBeyondSchedule,
} from '../services/sessionFromSchedule.service.js';

function parseVigenteHastaRequired(vigenteHasta) {
    const fin = parseCalendarEndDate(vigenteHasta);
    if (!fin) {
        const err = new Error('Indicá hasta qué fecha crear sesiones para este horario (AAAA-MM-DD).');
        err.statusCode = 400;
        throw err;
    }
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    if (fin < hoy) {
        const err = new Error('La fecha de fin debe ser hoy o una fecha futura.');
        err.statusCode = 400;
        throw err;
    }
    return fin;
}

// @desc    Agregar horarios a una categoría (Soporta múltiples días)
// @route   POST /api/schedules
const addSchedule = asyncHandler(async (req, res) => {
    const { categoria, diasSemana, horaInicio, horaFin, espacio, vigenteHasta } = req.body;
    const { Schedule, Space } = req.models;

    if (!Array.isArray(diasSemana) || diasSemana.length === 0) {
        res.status(400);
        throw new Error('Debe seleccionar al menos un día');
    }

    const finVigencia = parseVigenteHastaRequired(vigenteHasta);

    const spaceInfo = await Space.findById(espacio);
    if (!spaceInfo) {
        res.status(404);
        throw new Error('El espacio seleccionado no existe');
    }

    if (!spaceInfo.admiteSubdivision) {
        const horariosExistentes = await Schedule.find({
            diaSemana: { $in: diasSemana },
            espacio,
        });

        const choque = horariosExistentes.find((h) =>
            hasTimeOverlap(horaInicio, horaFin, h.horaInicio, h.horaFin),
        );

        if (choque) {
            res.status(400);
            throw new Error(
                `Choque de horarios: El espacio está ocupado el ${choque.diaSemana} de ${choque.horaInicio} a ${choque.horaFin}`,
            );
        }
    }

    const schedulesToInsert = diasSemana.map((dia) => ({
        categoria,
        diaSemana: dia,
        horaInicio,
        horaFin,
        espacio,
        vigenteHasta: finVigencia,
    }));

    const schedules = await Schedule.insertMany(schedulesToInsert);

    res.status(201).json({
        message: `Horarios creados (${schedules.length}). El cron generará sesiones hasta la fecha indicada en cada uno.`,
        count: schedules.length,
        schedules,
    });
});

// @desc    Obtener grilla completa del club (ordenada por día y hora)
// @route   GET /api/schedules
const getFullGrid = asyncHandler(async (req, res) => {
    const { Schedule } = req.models;

    const grid = await Schedule.find({})
        .populate({
            path: 'categoria',
            select: 'nombre disciplina',
            populate: { path: 'disciplina', select: 'nombre' },
        })
        .populate('espacio', 'nombre tipo estado admiteSubdivision notasMantenimiento')
        .sort({ diaSemana: 1, horaInicio: 1 });

    res.json(grid);
});

// @desc    Actualizar un horario
// @route   PUT /api/schedules/:id
const updateSchedule = asyncHandler(async (req, res) => {
    const { categoria, diaSemana, horaInicio, horaFin, espacio, vigenteHasta } = req.body;
    const { Schedule, Space } = req.models;

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
        res.status(404);
        throw new Error('Horario no encontrado');
    }

    const previous = {
        categoria: schedule.categoria,
        diaSemana: schedule.diaSemana,
        horaInicio: schedule.horaInicio,
        horaFin: schedule.horaFin,
        espacio: schedule.espacio,
    };

    const spaceInfo = await Space.findById(espacio || schedule.espacio);
    if (!spaceInfo.admiteSubdivision) {
        const horariosExistentes = await Schedule.find({
            diaSemana: diaSemana || schedule.diaSemana,
            espacio: espacio || schedule.espacio,
            _id: { $ne: schedule._id },
        });

        const choque = horariosExistentes.find((h) =>
            hasTimeOverlap(
                horaInicio || schedule.horaInicio,
                horaFin || schedule.horaFin,
                h.horaInicio,
                h.horaFin,
            ),
        );

        if (choque) {
            res.status(400);
            throw new Error(`Choque de horarios: El espacio está ocupado de ${choque.horaInicio} a ${choque.horaFin}`);
        }
    }

    schedule.categoria = categoria || schedule.categoria;
    schedule.diaSemana = diaSemana || schedule.diaSemana;
    schedule.horaInicio = horaInicio || schedule.horaInicio;
    schedule.horaFin = horaFin || schedule.horaFin;
    schedule.espacio = espacio || schedule.espacio;

    let sesionesEliminadas = 0;
    if (vigenteHasta !== undefined) {
        const finVigencia = parseVigenteHastaRequired(vigenteHasta);
        const anterior = schedule.vigenteHasta;
        schedule.vigenteHasta = finVigencia;
        if (!anterior || finVigencia < anterior) {
            const trim = await trimSessionsBeyondSchedule(req.models, schedule, finVigencia);
            sesionesEliminadas = trim.eliminadas;
        }
    }

    await schedule.save();

    const { actualizadas } = await syncFutureSessionsForSchedule(req.models, schedule, previous);

    res.json({
        ...schedule.toObject(),
        sesionesActualizadas: actualizadas,
        sesionesEliminadas,
    });
});

// @desc    Eliminar un horario
// @route   DELETE /api/schedules/:id
const deleteSchedule = asyncHandler(async (req, res) => {
    const { Schedule } = req.models;
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        res.status(404);
        throw new Error('Horario no encontrado');
    }

    await schedule.deleteOne();
    res.json({ message: 'Horario eliminado con éxito' });
});

// @desc    Obtener horarios fijos de un espacio específico
// @route   GET /api/schedules/espacio/:spaceId
const getSchedulesBySpace = asyncHandler(async (req, res) => {
    const { Schedule } = req.models;
    const schedules = await Schedule.find({ espacio: req.params.spaceId })
        .populate({
            path: 'categoria',
            select: 'nombre disciplina',
            populate: { path: 'disciplina', select: 'nombre' },
        })
        .sort({ diaSemana: 1, horaInicio: 1 });
    res.json(schedules);
});

export { addSchedule, getFullGrid, updateSchedule, deleteSchedule, getSchedulesBySpace };
