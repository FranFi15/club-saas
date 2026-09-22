import asyncHandler from 'express-async-handler';
import { hasTimeOverlap } from '../utils/timeHelper.js';
import {
    parseCalendarEndDate,
    parseCalendarStartDate,
    computePartialMonths,
    syncFutureSessionsForSchedule,
    trimSessionsBeyondSchedule,
} from '../services/sessionFromSchedule.service.js';
import { resumeBillingForCategory } from '../services/endBillingAfterGrilla.service.js';
import { retargetOpenPaymentsFromEnrollments } from '../services/generateMonthlyPayments.service.js';

async function applyPartialMonthDiscountsToOpenPayments(models, categoriaId, descuentos) {
    if (!categoriaId || !Array.isArray(descuentos) || !descuentos.length) {
        return { updated: 0 };
    }
    const { Enrollment } = models;
    const athleteIds = await Enrollment.distinct('atleta', {
        categoria: categoriaId,
        estado: 'activo',
    });
    if (!athleteIds.length) return { updated: 0 };
    try {
        return await retargetOpenPaymentsFromEnrollments(models, athleteIds, {
            scope: 'all_open',
        });
    } catch (e) {
        console.warn('[schedules] retarget mitad cuotas:', e.message);
        return { updated: 0 };
    }
}
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

function parseVigenteDesdeOptional(vigenteDesde, finVigencia) {
    if (vigenteDesde == null || vigenteDesde === '') {
        const hoy = new Date();
        hoy.setUTCHours(0, 0, 0, 0);
        return hoy;
    }
    const inicio = parseCalendarStartDate(vigenteDesde);
    if (!inicio) {
        const err = new Error('Indicá desde qué fecha crear sesiones (AAAA-MM-DD).');
        err.statusCode = 400;
        throw err;
    }
    if (finVigencia && inicio > finVigencia) {
        const err = new Error('La fecha de inicio no puede ser posterior a la de fin.');
        err.statusCode = 400;
        throw err;
    }
    return inicio;
}

function resolveDescuentosMesesParciales(raw, aplicarMitad, inicio, fin) {
    if (Array.isArray(raw)) {
        return raw
            .map((d) => ({
                mes: Number(d.mes),
                anio: Number(d.anio),
                porcentaje: Math.min(100, Math.max(0, Number(d.porcentaje) || 50)),
            }))
            .filter((d) => d.mes >= 1 && d.mes <= 12 && d.anio > 2000);
    }
    if (aplicarMitad) return computePartialMonths(inicio, fin, 50);
    return [];
}

// @desc    Agregar horarios a una categoría (Soporta múltiples días)
// @route   POST /api/schedules
const addSchedule = asyncHandler(async (req, res) => {
    const {
        categoria,
        diasSemana,
        horaInicio,
        horaFin,
        espacio,
        vigenteDesde,
        vigenteHasta,
        terminarCuotasAlFinalizar = false,
        aplicarMitadMesesParciales = false,
        descuentosMesesParciales,
    } = req.body;
    const { Schedule, Space } = req.models;

    if (!Array.isArray(diasSemana) || diasSemana.length === 0) {
        res.status(400);
        throw new Error('Debe seleccionar al menos un día');
    }

    const finVigencia = parseVigenteHastaRequired(vigenteHasta);
    const inicioVigencia = parseVigenteDesdeOptional(vigenteDesde, finVigencia);

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

    const terminarCuotas = Boolean(terminarCuotasAlFinalizar);
    const descuentos = resolveDescuentosMesesParciales(
        descuentosMesesParciales,
        Boolean(aplicarMitadMesesParciales),
        inicioVigencia,
        finVigencia,
    );

    const schedulesToInsert = diasSemana.map((dia) => ({
        categoria,
        diaSemana: dia,
        horaInicio,
        horaFin,
        espacio,
        vigenteDesde: inicioVigencia,
        vigenteHasta: finVigencia,
        terminarCuotasAlFinalizar: terminarCuotas,
        descuentosMesesParciales: descuentos,
    }));

    const schedules = await Schedule.insertMany(schedulesToInsert);

    let facturacion = { resumed: 0 };
    try {
        facturacion = await resumeBillingForCategory(req.models, categoria);
    } catch (e) {
        console.warn('[addSchedule] resume billing:', e.message);
    }

    let cuotasMitad = { updated: 0 };
    if (descuentos.length) {
        cuotasMitad = await applyPartialMonthDiscountsToOpenPayments(
            req.models,
            categoria,
            descuentos,
        );
    }

    const partialNote = descuentos.length
        ? ` Mitad de cuota en: ${descuentos.map((d) => `${d.mes}/${d.anio}`).join(', ')}.`
        : '';
    const resumeNote =
        facturacion.resumed > 0
            ? ` Se reanudó la facturación de ${facturacion.resumed} inscripción(es).`
            : '';
    const retargetNote =
        cuotasMitad.updated > 0
            ? ` Se actualizaron ${cuotasMitad.updated} cuota(s) abierta(s) con el descuento.`
            : '';

    res.status(201).json({
        message: terminarCuotas
            ? `Horarios creados (${schedules.length}). Sesiones desde–hasta la fecha indicada; al finalizar se dejarán de generar cuotas.${partialNote}${resumeNote}${retargetNote}`
            : `Horarios creados (${schedules.length}). El cron generará sesiones en el rango indicado.${partialNote}${resumeNote}${retargetNote}`,
        count: schedules.length,
        schedules,
        descuentosMesesParciales: descuentos,
        facturacion,
        cuotasMitad,
        mesesParcialesSugeridos: computePartialMonths(inicioVigencia, finVigencia, 50),
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

// @desc    Preview de meses parciales para un rango (antes de guardar)
// @route   POST /api/schedules/preview-partial-months
const previewPartialMonths = asyncHandler(async (req, res) => {
    const { vigenteDesde, vigenteHasta } = req.body || {};
    const fin = parseCalendarEndDate(vigenteHasta);
    const inicio = parseVigenteDesdeOptional(vigenteDesde, fin);
    if (!fin) {
        res.status(400);
        throw new Error('Indicá la fecha hasta.');
    }
    if (inicio > fin) {
        res.status(400);
        throw new Error('La fecha de inicio no puede ser posterior a la de fin.');
    }
    const meses = computePartialMonths(inicio, fin, 50);
    res.json({ mesesParciales: meses });
});

// @desc    Actualizar un horario
// @route   PUT /api/schedules/:id
const updateSchedule = asyncHandler(async (req, res) => {
    const {
        categoria,
        diaSemana,
        horaInicio,
        horaFin,
        espacio,
        vigenteDesde,
        vigenteHasta,
        terminarCuotasAlFinalizar,
        aplicarMitadMesesParciales,
        descuentosMesesParciales,
    } = req.body;
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

    if (terminarCuotasAlFinalizar !== undefined) {
        schedule.terminarCuotasAlFinalizar = Boolean(terminarCuotasAlFinalizar);
    }

    let sesionesEliminadas = 0;
    let finVigencia = schedule.vigenteHasta;
    if (vigenteHasta !== undefined) {
        finVigencia = parseVigenteHastaRequired(vigenteHasta);
        const anterior = schedule.vigenteHasta;
        schedule.vigenteHasta = finVigencia;
        if (!anterior || finVigencia < anterior) {
            const trim = await trimSessionsBeyondSchedule(req.models, schedule, finVigencia);
            sesionesEliminadas = trim.eliminadas;
        }
    }

    if (vigenteDesde !== undefined) {
        schedule.vigenteDesde = parseVigenteDesdeOptional(vigenteDesde, finVigencia);
    } else if (vigenteHasta !== undefined && schedule.vigenteDesde && schedule.vigenteDesde > finVigencia) {
        schedule.vigenteDesde = parseVigenteDesdeOptional(schedule.vigenteDesde, finVigencia);
    }

    if (descuentosMesesParciales !== undefined || aplicarMitadMesesParciales !== undefined) {
        const desde = schedule.vigenteDesde || parseCalendarStartDate(new Date().toISOString());
        schedule.descuentosMesesParciales = resolveDescuentosMesesParciales(
            descuentosMesesParciales,
            Boolean(aplicarMitadMesesParciales),
            desde,
            schedule.vigenteHasta,
        );
    }

    await schedule.save();

    const { actualizadas } = await syncFutureSessionsForSchedule(req.models, schedule, previous);

    let facturacion = { resumed: 0 };
    try {
        facturacion = await resumeBillingForCategory(req.models, schedule.categoria);
    } catch (e) {
        console.warn('[updateSchedule] resume billing:', e.message);
    }

    let cuotasMitad = { updated: 0 };
    if ((schedule.descuentosMesesParciales || []).length) {
        cuotasMitad = await applyPartialMonthDiscountsToOpenPayments(
            req.models,
            schedule.categoria,
            schedule.descuentosMesesParciales,
        );
    }

    res.json({
        ...schedule.toObject(),
        sesionesActualizadas: actualizadas,
        sesionesEliminadas,
        facturacion,
        cuotasMitad,
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

export {
    addSchedule,
    getFullGrid,
    updateSchedule,
    deleteSchedule,
    getSchedulesBySpace,
    previewPartialMonths,
};
