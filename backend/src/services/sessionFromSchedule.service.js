/**
 * Materializa la grilla semanal (Schedule) en sesiones concretas (Session).
 */

const DIAS_MAPA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const DIAS_ORDEN = {
    Domingo: 0,
    Lunes: 1,
    Martes: 2,
    Miércoles: 3,
    Jueves: 4,
    Viernes: 5,
    Sábado: 6,
};

const DEFAULT_MIN_FUTURE = () => {
    const n = Number(process.env.SESSION_MIN_FUTURE_COUNT);
    return Number.isFinite(n) && n > 0 ? n : 30;
};

/** YYYY-MM-DD o ISO → fin de ese día calendario (UTC). */
export function parseCalendarEndDate(isoOrDate) {
    if (!isoOrDate) return null;
    const raw = String(isoOrDate).trim();
    const ymd = raw.includes('T') ? raw.split('T')[0] : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    return new Date(`${ymd}T23:59:59.999Z`);
}

export function startOfTodayUtc() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function weekdayNameFromDate(d) {
    return DIAS_MAPA[d.getUTCDay()];
}

/** Mueve la fecha al mismo número de semana hacia el día de semana objetivo. */
function shiftDateToWeekday(fromDate, targetDayName) {
    const current = weekdayNameFromDate(fromDate);
    const curIdx = DIAS_ORDEN[current];
    const tgtIdx = DIAS_ORDEN[targetDayName];
    if (curIdx === undefined || tgtIdx === undefined) return new Date(fromDate);
    let delta = tgtIdx - curIdx;
    if (delta < 0) delta += 7;
    const out = new Date(fromDate);
    out.setUTCDate(out.getUTCDate() + delta);
    out.setUTCHours(0, 0, 0, 0);
    return out;
}

async function getOrCreateClubSettings(ClubSettings) {
    let doc = await ClubSettings.findOne();
    if (!doc) doc = await ClubSettings.create({});
    return doc;
}

export async function getSessionGenerationSettings(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return {
        sesionesMinimoFuturas: doc.sesionesMinimoFuturas ?? DEFAULT_MIN_FUTURE(),
    };
}

/** Fecha tope del rango de generación = el máximo vigenteHasta entre horarios activos. */
async function getGenerationEndDateFromSchedules(models) {
    const { Schedule } = models;
    const hoy = startOfTodayUtc();
    const schedules = await Schedule.find({ vigenteHasta: { $gte: hoy } }).select('vigenteHasta').lean();
    if (!schedules.length) return null;
    return schedules.reduce(
        (max, s) => (s.vigenteHasta > max ? s.vigenteHasta : max),
        schedules[0].vigenteHasta,
    );
}

/** Elimina sesiones programadas futuras de un horario que quedaron después de acortar vigenteHasta. */
export async function trimSessionsBeyondSchedule(models, schedule, vigenteHasta) {
    const { Session } = models;
    const fin = vigenteHasta instanceof Date ? vigenteHasta : parseCalendarEndDate(vigenteHasta);
    if (!fin) return { eliminadas: 0 };

    const hoy = startOfTodayUtc();
    const query = {
        tipo: 'entrenamiento',
        estado: 'programada',
        fecha: { $gt: fin, $gte: hoy },
        $or: [
            { grillaHorario: schedule._id },
            {
                grillaHorario: { $in: [null, undefined] },
                categoria: schedule.categoria,
                espacio: schedule.espacio,
                horaInicio: schedule.horaInicio,
            },
        ],
    };

    const sessions = await Session.find(query);
    const prevDia = schedule.diaSemana;
    let eliminadas = 0;
    for (const sess of sessions) {
        if (!sess.grillaHorario && weekdayNameFromDate(sess.fecha) !== prevDia) continue;
        await sess.deleteOne();
        eliminadas += 1;
    }
    return { eliminadas };
}

export async function countFutureProgrammedSessions(models) {
    const { Session } = models;
    const hoy = startOfTodayUtc();
    return Session.countDocuments({
        tipo: 'entrenamiento',
        estado: 'programada',
        fecha: { $gte: hoy },
    });
}

/**
 * @param {object} models
 * @param {Date} inicio
 * @param {Date} fin
 * @param {object} [scheduleExtraQuery]
 */
async function generateLoop(models, inicio, fin, scheduleExtraQuery = {}) {
    const { Schedule, Session } = models;
    const detalles = [];
    const errores = [];

    if (fin < inicio) {
        return { creadasCount: 0, detalles, errores };
    }

    let current = new Date(inicio);
    while (current <= fin) {
        const nombreDia = DIAS_MAPA[current.getUTCDay()];
        const plantillas = await Schedule.find({ diaSemana: nombreDia, ...scheduleExtraQuery });

        for (const p of plantillas) {
            if (!p.vigenteHasta || current > p.vigenteHasta) {
                continue;
            }
            const existe = await Session.findOne({
                categoria: p.categoria,
                fecha: new Date(current),
                horaInicio: p.horaInicio,
                espacio: p.espacio,
                tipo: 'entrenamiento',
            });

            if (!existe) {
                try {
                    const nuevaSesion = await Session.create({
                        tipo: 'entrenamiento',
                        categoria: p.categoria,
                        fecha: new Date(current),
                        horaInicio: p.horaInicio,
                        horaFin: p.horaFin,
                        espacio: p.espacio,
                        estado: 'programada',
                        grillaHorario: p._id,
                    });
                    detalles.push(nuevaSesion);
                } catch (err) {
                    errores.push({ dia: current.toISOString(), scheduleId: String(p._id), error: err.message });
                }
            }
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return { creadasCount: detalles.length, detalles, errores };
}

/** Rango explícito (POST /sessions/generate manual). */
export async function generateSessionsInDateRange(models, fechaInicio, fechaFin) {
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    return generateLoop(models, inicio, fin, {});
}

/**
 * Cron diario: si hay menos de N sesiones futuras, crea las faltantes respetando el vigenteHasta de cada horario.
 */
export async function maintainSessionBufferForTenant(models) {
    const settings = await getSessionGenerationSettings(models);
    const minCount = settings.sesionesMinimoFuturas ?? DEFAULT_MIN_FUTURE();
    const hoy = startOfTodayUtc();
    const horizon = await getGenerationEndDateFromSchedules(models);

    if (!horizon) {
        return {
            creadasCount: 0,
            futurasAntes: 0,
            futurasDespues: 0,
            omitido: true,
            motivo: 'Ningún horario tiene fecha de fin de generación vigente.',
        };
    }

    const futurasAntes = await countFutureProgrammedSessions(models);
    if (futurasAntes >= minCount) {
        return { creadasCount: 0, futurasAntes, futurasDespues: futurasAntes, omitido: false };
    }

    const { creadasCount, errores } = await generateLoop(models, hoy, horizon, {});
    const futurasDespues = await countFutureProgrammedSessions(models);

    return { creadasCount, futurasAntes, futurasDespues, errores, omitido: false };
}

/**
 * Al editar día/hora de la grilla: actualiza sesiones programadas futuras que aún no empezaron.
 */
export async function syncFutureSessionsForSchedule(models, schedule, previous) {
    const { Session } = models;
    const hoy = startOfTodayUtc();
    const prev = previous || {};

    const prevDia = prev.diaSemana ?? schedule.diaSemana;
    const prevCategoria = prev.categoria ?? schedule.categoria;
    const prevEspacio = prev.espacio ?? schedule.espacio;
    const prevHoraInicio = prev.horaInicio ?? schedule.horaInicio;

    const sessions = await Session.find({
        tipo: 'entrenamiento',
        estado: 'programada',
        fecha: { $gte: hoy },
    });

    let actualizadas = 0;

    for (const sess of sessions) {
        const linked = sess.grillaHorario && String(sess.grillaHorario) === String(schedule._id);
        const legacyMatch =
            !sess.grillaHorario &&
            String(sess.categoria) === String(prevCategoria) &&
            String(sess.espacio) === String(prevEspacio) &&
            sess.horaInicio === prevHoraInicio &&
            weekdayNameFromDate(sess.fecha) === prevDia;

        if (!linked && !legacyMatch) {
            continue;
        }

        if (prev.diaSemana && schedule.diaSemana && prev.diaSemana !== schedule.diaSemana) {
            sess.fecha = shiftDateToWeekday(sess.fecha, schedule.diaSemana);
        }
        sess.horaInicio = schedule.horaInicio;
        sess.horaFin = schedule.horaFin;
        sess.categoria = schedule.categoria;
        sess.espacio = schedule.espacio;
        sess.grillaHorario = schedule._id;
        await sess.save();
        actualizadas += 1;
    }

    return { actualizadas };
}
