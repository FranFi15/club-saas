/**
 * Club de ejemplo grande: 3 disciplinas × 4 categorías × 10 atletas.
 *
 * Crea el club en Super-Admin si no existe (usa super/.env: MONGO_URI + MONGO_DB_HOST).
 *
 *   cd backend
 *   npm run seed:ejemplo
 *   SEED_FORCE=true npm run seed:ejemplo   # borra plantel ejemplo y vuelve a crear
 */
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { markOverduePayments } from '../services/overduePayments.service.js';
import { generateSessionsInDateRange, startOfTodayUtc } from '../services/sessionFromSchedule.service.js';
import { generateMonthlyPaymentsForTenant } from '../services/generateMonthlyPayments.service.js';

const CLUB_ID = (process.env.SEED_CLUB_IDENTIFIER || 'ejemplo').toLowerCase();
const PASSWORD = process.env.SEED_EXAMPLE_PASSWORD || 'Demo2026!';
const EMAIL_DOMAIN = 'clubejemplo.local';
const TERMS_VERSION = '2026-08-15';

const FEE_PLANS = [
    { key: 'infantil', nombre: 'Cuota infantiles', monto: 12000, diaVencimiento: 10, porcentajeRecargo: 5, descripcion: 'Sub-9 y Sub-13', maxEdad: 13 },
    { key: 'juvenil', nombre: 'Cuota juveniles', monto: 16000, diaVencimiento: 10, porcentajeRecargo: 10, descripcion: 'Sub-17', maxEdad: 17 },
    { key: 'primera', nombre: 'Cuota primera', monto: 22000, diaVencimiento: 10, porcentajeRecargo: 10, descripcion: 'Plantel de primera', maxEdad: 99 },
];

const TRAINING_PLAN_DEFS = [
    {
        disciplina: 'Fútbol',
        nombre: 'Rueda de pases + 5vs5',
        objetivoSesion: 'Circuito de activación, pases y juego reducido.',
        bloques: [
            { tituloBloque: 'Activación', formato: 'Individual', enfoque: 'fisico', duracionMinutos: 15, descripcionDetallada: 'Movilidad y rondo 4vs1' },
            { tituloBloque: 'Rueda de pases', formato: 'Ruedas', enfoque: 'tecnico', duracionMinutos: 20, descripcionDetallada: 'Pases al primer toque' },
            { tituloBloque: 'Juego reducido', formato: '5vs5', enfoque: 'ofensivo', duracionMinutos: 30, descripcionDetallada: 'Porterías chicas, 2 toques' },
        ],
    },
    {
        disciplina: 'Básquet',
        nombre: 'Fundamentos + 3vs3',
        objetivoSesion: 'Tiro, 1vs1 y juego corto.',
        bloques: [
            { tituloBloque: 'Entrada en calor', formato: 'Individual', enfoque: 'fisico', duracionMinutos: 12 },
            { tituloBloque: 'Tiro en movimiento', formato: 'Ruedas', enfoque: 'tecnico', duracionMinutos: 20 },
            { tituloBloque: '3vs3 media cancha', formato: '3vs3', enfoque: 'ofensivo', duracionMinutos: 25 },
        ],
    },
    {
        disciplina: 'Hockey',
        nombre: 'Conducción + 4vs4',
        objetivoSesion: 'Manejo de stick y transiciones.',
        bloques: [
            { tituloBloque: 'Conducción', formato: 'Individual', enfoque: 'tecnico', duracionMinutos: 15 },
            { tituloBloque: 'Salida de presión', formato: '4vs2', enfoque: 'transicion_ataque', duracionMinutos: 20 },
            { tituloBloque: 'Juego 4vs4', formato: '4vs4', enfoque: 'neutro', duracionMinutos: 25 },
        ],
    },
];

const ISAK_PRESETS = [
    { nombre: 'Masa corporal', unidad: 'kg', mejorDireccion: 'menor_es_mejor', area: 'datos_basicos' },
    { nombre: 'Estatura', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'datos_basicos' },
    { nombre: 'Tríceps', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Subescapular', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Bíceps', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Cresta ilíaca', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Supraespinal', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Abdominal', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Muslo medial', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Pantorrilla medial', unidad: 'mm', mejorDireccion: 'menor_es_mejor', area: 'metodologia_isak' },
    { nombre: 'Brazo relajado', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
    { nombre: 'Brazo flexionado y en tensión', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
    { nombre: 'Cintura', unidad: 'cm', mejorDireccion: 'menor_es_mejor', area: 'perimetros' },
    { nombre: 'Cadera (glúteo)', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
    { nombre: 'Pantorrilla máxima', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'perimetros' },
    { nombre: 'Biestiloideo', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'diametros_oseos' },
    { nombre: 'Bicondíleo del fémur', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'diametros_oseos' },
];

const FISICO_PRESETS = [
    { nombre: 'Salto vertical', unidad: 'cm', mejorDireccion: 'mayor_es_mejor', area: 'fisico' },
    { nombre: 'Sprint 20 m', unidad: 's', mejorDireccion: 'menor_es_mejor', area: 'fisico' },
    { nombre: 'Yo-Yo IR1', unidad: 'm', mejorDireccion: 'mayor_es_mejor', area: 'fisico' },
];

const MEASUREMENT_ATLETES = [
    `atleta.futbol.primera.01@${EMAIL_DOMAIN}`,
    `atleta.futbol.primera.02@${EMAIL_DOMAIN}`,
    `atleta.futbol.sub13.01@${EMAIL_DOMAIN}`,
    `atleta.basquet.primera.01@${EMAIL_DOMAIN}`,
    `atleta.hockey.primera.01@${EMAIL_DOMAIN}`,
    `atleta.basquet.sub13.02@${EMAIL_DOMAIN}`,
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../super/.env') });

const FIRST_NAMES_M = [
    'Mateo', 'Benjamín', 'Thiago', 'Lautaro', 'Felipe', 'Santino', 'Bautista', 'Joaquín', 'Tomás', 'Ignacio',
];
const FIRST_NAMES_F = [
    'Sofía', 'Valentina', 'Emma', 'Martina', 'Olivia', 'Catalina', 'Isabella', 'Mía', 'Lucía', 'Delfina',
];
const LAST_NAMES = [
    'Gómez', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'García', 'Romero', 'Díaz',
    'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Castro', 'Moreno', 'Silva',
];

const SPACES = [
    { nombre: 'Cancha de fútbol 11', tipo: 'cancha', admiteSubdivision: true },
    { nombre: 'Cancha de fútbol 5', tipo: 'cancha', admiteSubdivision: true },
    { nombre: 'Gimnasio cubierto', tipo: 'gimnasio', admiteSubdivision: true },
    { nombre: 'Cancha de hockey', tipo: 'cancha', admiteSubdivision: false },
    { nombre: 'Salón de usos múltiples', tipo: 'salon', admiteSubdivision: false },
    { nombre: 'Predio de entrenamiento', tipo: 'otro', admiteSubdivision: true },
];

const STRUCTURE = [
    {
        nombre: 'Fútbol',
        descripcion: 'Escuela y planteles competitivos',
        space: { nombre: 'Cancha de fútbol 11', tipo: 'cancha' },
        coach: { nombre: 'Diego', apellido: 'Moreno', email: `coach.futbol@${EMAIL_DOMAIN}` },
        categories: [
            { nombre: 'Sub-9', edadMinima: 7, edadMaxima: 9, space: 'Cancha de fútbol 5', slots: [
                { days: ['Lunes', 'Miércoles'], horaInicio: '17:00', horaFin: '18:15' },
                { days: ['Sábado'], horaInicio: '09:00', horaFin: '10:15' },
            ] },
            { nombre: 'Sub-13', edadMinima: 10, edadMaxima: 13, space: 'Cancha de fútbol 11', slots: [
                { days: ['Martes', 'Jueves'], horaInicio: '17:00', horaFin: '18:30' },
                { days: ['Sábado'], horaInicio: '10:30', horaFin: '12:00' },
            ] },
            { nombre: 'Sub-17', edadMinima: 14, edadMaxima: 17, space: 'Cancha de fútbol 11', slots: [
                { days: ['Lunes', 'Miércoles'], horaInicio: '18:30', horaFin: '20:00' },
            ] },
            { nombre: 'Primera', edadMinima: 18, edadMaxima: 40, space: 'Cancha de fútbol 11', slots: [
                { days: ['Martes', 'Jueves'], horaInicio: '20:00', horaFin: '21:30' },
            ] },
        ],
    },
    {
        nombre: 'Básquet',
        descripcion: 'Formativas y primera',
        space: { nombre: 'Gimnasio cubierto', tipo: 'gimnasio' },
        coach: { nombre: 'Carla', apellido: 'Benítez', email: `coach.basquet@${EMAIL_DOMAIN}` },
        categories: [
            { nombre: 'Sub-9', edadMinima: 7, edadMaxima: 9, space: 'Gimnasio cubierto', slots: [
                { days: ['Martes', 'Jueves'], horaInicio: '17:00', horaFin: '18:15' },
            ] },
            { nombre: 'Sub-13', edadMinima: 10, edadMaxima: 13, space: 'Gimnasio cubierto', slots: [
                { days: ['Lunes', 'Miércoles'], horaInicio: '17:00', horaFin: '18:30' },
            ] },
            { nombre: 'Sub-17', edadMinima: 14, edadMaxima: 17, space: 'Gimnasio cubierto', slots: [
                { days: ['Martes', 'Jueves'], horaInicio: '18:30', horaFin: '20:00' },
            ] },
            { nombre: 'Primera', edadMinima: 18, edadMaxima: 40, space: 'Gimnasio cubierto', slots: [
                { days: ['Lunes', 'Miércoles'], horaInicio: '20:00', horaFin: '21:30' },
            ] },
        ],
    },
    {
        nombre: 'Hockey',
        descripcion: 'Hockey sobre césped',
        space: { nombre: 'Cancha de hockey', tipo: 'cancha' },
        coach: { nombre: 'Luciana', apellido: 'Paz', email: `coach.hockey@${EMAIL_DOMAIN}` },
        categories: [
            { nombre: 'Sub-9', edadMinima: 7, edadMaxima: 9, space: 'Cancha de hockey', slots: [
                { days: ['Sábado'], horaInicio: '09:00', horaFin: '10:15' },
            ] },
            { nombre: 'Sub-13', edadMinima: 10, edadMaxima: 13, space: 'Cancha de hockey', slots: [
                { days: ['Sábado'], horaInicio: '10:30', horaFin: '12:00' },
            ] },
            { nombre: 'Sub-17', edadMinima: 14, edadMaxima: 17, space: 'Cancha de hockey', slots: [
                { days: ['Viernes'], horaInicio: '18:00', horaFin: '19:30' },
                { days: ['Sábado'], horaInicio: '16:00', horaFin: '17:30' },
            ] },
            { nombre: 'Primera', edadMinima: 18, edadMaxima: 40, space: 'Cancha de hockey', slots: [
                { days: ['Martes', 'Jueves'], horaInicio: '21:00', horaFin: '22:30' },
            ] },
        ],
    },
];

/** Familias de ejemplo: un tutor con varios hijos (mismo apellido) en distintas categorías. */
const FAMILIES = [
    {
        tutor: { email: `tutor.familia.gomez@${EMAIL_DOMAIN}`, nombre: 'Carolina', apellido: 'Gómez', telefono: '11-4411-1001' },
        kids: [
            { email: `atleta.futbol.sub9.01@${EMAIL_DOMAIN}`, nombre: 'Sofía', apellido: 'Gómez', sexo: 'F' },
            { email: `atleta.futbol.sub13.01@${EMAIL_DOMAIN}`, nombre: 'Mateo', apellido: 'Gómez', sexo: 'M' },
            { email: `atleta.basquet.sub9.01@${EMAIL_DOMAIN}`, nombre: 'Emma', apellido: 'Gómez', sexo: 'F' },
        ],
    },
    {
        tutor: { email: `tutor.familia.rodriguez@${EMAIL_DOMAIN}`, nombre: 'Andrés', apellido: 'Rodríguez', telefono: '11-4411-1002' },
        kids: [
            { email: `atleta.hockey.sub9.01@${EMAIL_DOMAIN}`, nombre: 'Valentina', apellido: 'Rodríguez', sexo: 'F' },
            { email: `atleta.hockey.sub13.01@${EMAIL_DOMAIN}`, nombre: 'Thiago', apellido: 'Rodríguez', sexo: 'M' },
            { email: `atleta.basquet.sub13.02@${EMAIL_DOMAIN}`, nombre: 'Lautaro', apellido: 'Rodríguez', sexo: 'M' },
        ],
    },
    {
        tutor: { email: `tutor.familia.fernandez@${EMAIL_DOMAIN}`, nombre: 'Lucía', apellido: 'Fernández', telefono: '11-4411-1003' },
        kids: [
            { email: `atleta.futbol.sub17.01@${EMAIL_DOMAIN}`, nombre: 'Martina', apellido: 'Fernández', sexo: 'F' },
            { email: `atleta.futbol.sub17.02@${EMAIL_DOMAIN}`, nombre: 'Felipe', apellido: 'Fernández', sexo: 'M' },
        ],
    },
    {
        tutor: { email: `tutor.familia.lopez@${EMAIL_DOMAIN}`, nombre: 'Martín', apellido: 'López', telefono: '11-4411-1004' },
        kids: [
            { email: `atleta.hockey.sub17.01@${EMAIL_DOMAIN}`, nombre: 'Olivia', apellido: 'López', sexo: 'F' },
            { email: `atleta.basquet.sub17.01@${EMAIL_DOMAIN}`, nombre: 'Santino', apellido: 'López', sexo: 'M' },
            { email: `atleta.futbol.sub9.02@${EMAIL_DOMAIN}`, nombre: 'Benjamín', apellido: 'López', sexo: 'M' },
        ],
    },
];

function slug(s) {
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function birthFromAge(age) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - age);
    d.setMonth(3);
    d.setDate(12);
    return d;
}

function vigenteHasta() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    d.setMonth(11, 31);
    d.setHours(23, 59, 59, 999);
    return d;
}

async function ensureSpacesAndGrid(models) {
    const { Space, Schedule, Discipline, Category } = models;
    const byName = {};
    for (const spec of SPACES) {
        let space = await Space.findOne({ nombre: spec.nombre });
        if (!space) space = await Space.create(spec);
        else {
            space.tipo = spec.tipo;
            space.admiteSubdivision = spec.admiteSubdivision;
            space.estado = 'disponible';
            await space.save();
        }
        byName[spec.nombre] = space;
    }

    let slots = 0;
    for (const discDef of STRUCTURE) {
        const disc = await Discipline.findOne({ nombre: discDef.nombre });
        if (!disc) continue;
        for (const catDef of discDef.categories) {
            const cat = await Category.findOne({ nombre: catDef.nombre, disciplina: disc._id });
            if (!cat) continue;
            const space = byName[catDef.space] || byName[discDef.space.nombre];
            if (!space) continue;
            for (const slot of catDef.slots || []) {
                for (const dia of slot.days) {
                    await Schedule.updateOne(
                        { categoria: cat._id, diaSemana: dia, horaInicio: slot.horaInicio },
                        {
                            $set: {
                                categoria: cat._id,
                                diaSemana: dia,
                                horaInicio: slot.horaInicio,
                                horaFin: slot.horaFin,
                                espacio: space._id,
                                vigenteHasta: vigenteHasta(),
                            },
                        },
                        { upsert: true },
                    );
                    slots += 1;
                }
            }
        }
    }
    return { spaces: Object.keys(byName).length, slots };
}

async function syncFamilies(models) {
    const { User } = models;
    const linked = [];
    for (const family of FAMILIES) {
        const tutor = await upsertUser(User, {
            email: family.tutor.email,
            nombre: family.tutor.nombre,
            apellido: family.tutor.apellido,
            rol: 'tutor',
            telefono: family.tutor.telefono,
            descuentoFamiliar: 15,
            passwordPlain: PASSWORD,
        });
        const kidsOk = [];
        for (const kid of family.kids) {
            const atleta = await User.findOne({ email: kid.email.toLowerCase(), rol: 'atleta' });
            if (!atleta) continue;
            atleta.nombre = kid.nombre;
            atleta.apellido = kid.apellido;
            atleta.sexo = kid.sexo;
            atleta.tutorPrincipal = tutor._id;
            await atleta.save();
            kidsOk.push(`${kid.nombre} ${kid.apellido}`);
        }
        linked.push({ tutor: family.tutor.email, kids: kidsOk });
    }
    return linked;
}

function utcDaysAgo(n) {
    const d = startOfTodayUtc();
    d.setUTCDate(d.getUTCDate() - n);
    return d;
}

function feePlanForAge(plansByKey, edadMaxima) {
    if (edadMaxima <= 13) return plansByKey.infantil;
    if (edadMaxima <= 17) return plansByKey.juvenil;
    return plansByKey.primera;
}

async function ensureFeePlans(models) {
    const { Plan, Discipline, Category, Enrollment } = models;
    const plansByKey = {};
    for (const def of FEE_PLANS) {
        let plan = await Plan.findOne({ nombre: def.nombre });
        if (!plan) {
            plan = await Plan.create({
                nombre: def.nombre,
                monto: def.monto,
                diaVencimiento: def.diaVencimiento,
                porcentajeRecargo: def.porcentajeRecargo,
                descripcion: def.descripcion,
                activo: true,
            });
        } else {
            plan.monto = def.monto;
            plan.diaVencimiento = def.diaVencimiento;
            plan.porcentajeRecargo = def.porcentajeRecargo;
            plan.descripcion = def.descripcion;
            plan.activo = true;
            await plan.save();
        }
        plansByKey[def.key] = plan;
    }

    let assignedCats = 0;
    for (const discDef of STRUCTURE) {
        const disc = await Discipline.findOne({ nombre: discDef.nombre });
        if (!disc) continue;
        disc.planDefault = plansByKey.primera._id;
        await disc.save();
        for (const catDef of discDef.categories) {
            const cat = await Category.findOne({ nombre: catDef.nombre, disciplina: disc._id });
            if (!cat) continue;
            const plan = feePlanForAge(plansByKey, catDef.edadMaxima);
            cat.planDefault = plan._id;
            await cat.save();
            await Enrollment.updateMany(
                { categoria: cat._id, estado: 'activo' },
                { $set: { plan: plan._id } },
            );
            assignedCats += 1;
        }
    }
    return { plansByKey, assignedCats };
}

async function ensureTrainingPlans(models) {
    const { TrainingPlan, Discipline, User } = models;
    const created = [];
    for (const def of TRAINING_PLAN_DEFS) {
        const disc = await Discipline.findOne({ nombre: def.disciplina });
        if (!disc) continue;
        const coachEmail = STRUCTURE.find((d) => d.nombre === def.disciplina)?.coach.email;
        const coach = coachEmail ? await User.findOne({ email: coachEmail.toLowerCase() }) : null;
        let plan = await TrainingPlan.findOne({ nombre: def.nombre, disciplina: disc._id });
        if (!plan) {
            plan = await TrainingPlan.create({
                nombre: def.nombre,
                disciplina: disc._id,
                objetivoSesion: def.objetivoSesion,
                bloques: def.bloques,
                creador: coach?._id,
            });
        } else {
            plan.objetivoSesion = def.objetivoSesion;
            plan.bloques = def.bloques;
            if (coach) plan.creador = coach._id;
            await plan.save();
        }
        created.push(plan);
    }
    return created;
}

async function generateExampleSessions(models, weeksAhead = 4, weeksBack = 1) {
    const hoy = startOfTodayUtc();
    const inicio = new Date(hoy);
    inicio.setUTCDate(inicio.getUTCDate() - weeksBack * 7);
    const fin = new Date(hoy);
    fin.setUTCDate(fin.getUTCDate() + weeksAhead * 7);
    return generateSessionsInDateRange(models, inicio, fin);
}

async function attachPlansAndCompletePastSessions(models, trainingPlans) {
    const { Session, Enrollment, Category } = models;
    const hoy = startOfTodayUtc();
    const planByDiscId = new Map(trainingPlans.map((plan) => [String(plan.disciplina), plan]));

    const upcoming = await Session.find({
        tipo: 'entrenamiento',
        estado: 'programada',
        fecha: { $gte: hoy },
    }).select('_id categoria planEntrenamiento').lean();

    const catIds = [...new Set(upcoming.map((s) => String(s.categoria)))];
    const cats = await Category.find({ _id: { $in: catIds } }).select('disciplina').lean();
    const discByCat = new Map(cats.map((c) => [String(c._id), String(c.disciplina)]));

    let attached = 0;
    for (const sess of upcoming) {
        if (sess.planEntrenamiento) continue;
        const plan = planByDiscId.get(discByCat.get(String(sess.categoria)));
        if (!plan) continue;
        await Session.updateOne({ _id: sess._id }, { $set: { planEntrenamiento: plan._id } });
        attached += 1;
    }

    const past = await Session.find({
        tipo: 'entrenamiento',
        fecha: { $lt: hoy },
        estado: 'programada',
    });
    const enrollByCat = {};
    let completed = 0;
    for (const sess of past) {
        const key = String(sess.categoria);
        if (!enrollByCat[key]) {
            enrollByCat[key] = await Enrollment.find({ categoria: sess.categoria, estado: 'activo' })
                .select('atleta')
                .lean();
        }
        const roster = enrollByCat[key];
        sess.estado = 'completada';
        sess.asistencia = roster.map((enr, i) => ({
            atleta: enr.atleta,
            estado: i % 7 === 0 ? 'ausente' : i % 5 === 0 ? 'tarde' : 'presente',
        }));
        let discId = discByCat.get(key);
        if (!discId) {
            const cat = await Category.findById(sess.categoria).select('disciplina').lean();
            discId = cat ? String(cat.disciplina) : '';
        }
        const plan = planByDiscId.get(discId);
        if (plan) sess.planEntrenamiento = plan._id;
        await sess.save();
        completed += 1;
    }

    return { attached, completed, upcoming: upcoming.length };
}

async function ensureMetricDefs(models, creadorId) {
    const { MetricDefinition } = models;
    const defs = [];
    for (const preset of [...ISAK_PRESETS, ...FISICO_PRESETS]) {
        let def = await MetricDefinition.findOne({ nombre: preset.nombre, area: preset.area });
        if (!def) def = await MetricDefinition.create({ ...preset, creador: creadorId });
        defs.push(def);
    }
    return defs;
}

function measurementValues(atleta, dateIndex) {
    const female = atleta.sexo === 'F';
    const age = atleta.fechaNacimiento
        ? Math.max(8, new Date().getFullYear() - new Date(atleta.fechaNacimiento).getFullYear())
        : 16;
    const minor = age < 16;
    const trend = dateIndex * 0.6;
    const peso = (female ? 52 : 68) + (minor ? -12 : 0) + dateIndex * -0.4;
    const talla = (female ? 162 : 176) + (minor ? -18 : 0);
    return {
        'Masa corporal': Number(peso.toFixed(1)),
        Estatura: talla,
        Tríceps: Number(((female ? 12 : 9) - trend * 0.4).toFixed(1)),
        Subescapular: Number(((female ? 14 : 12) - trend * 0.3).toFixed(1)),
        Bíceps: Number(((female ? 7 : 5.5) - trend * 0.2).toFixed(1)),
        'Cresta ilíaca': Number(((female ? 13 : 11) - trend * 0.3).toFixed(1)),
        Supraespinal: Number(((female ? 13 : 11.5) - trend * 0.3).toFixed(1)),
        Abdominal: Number(((female ? 18 : 15) - trend * 0.5).toFixed(1)),
        'Muslo medial': Number(((female ? 18 : 15) - trend * 0.3).toFixed(1)),
        'Pantorrilla medial': Number(((female ? 12 : 9.5) - trend * 0.2).toFixed(1)),
        'Brazo relajado': Number(((female ? 26 : 29) + trend * 0.2).toFixed(1)),
        'Brazo flexionado y en tensión': Number(((female ? 28 : 32) + trend * 0.2).toFixed(1)),
        Cintura: Number(((female ? 70 : 78) - trend * 0.4).toFixed(1)),
        'Cadera (glúteo)': Number(((female ? 94 : 96) - trend * 0.2).toFixed(1)),
        'Pantorrilla máxima': Number(((female ? 34 : 36) + trend * 0.1).toFixed(1)),
        Biestiloideo: female ? 5.2 : 5.7,
        'Bicondíleo del fémur': female ? 8.6 : 9.1,
        'Salto vertical': Number(((female ? 32 : 42) + (minor ? -8 : 0) + dateIndex * 1.2).toFixed(1)),
        'Sprint 20 m': Number(((female ? 3.55 : 3.2) + (minor ? 0.35 : 0) - dateIndex * 0.04).toFixed(2)),
        'Yo-Yo IR1': Math.round((female ? 640 : 880) + (minor ? -200 : 0) + dateIndex * 40),
    };
}

async function ensureMeasurements(models) {
    const { User, Measurement } = models;
    const nutri = await User.findOne({ email: `nutri@${EMAIL_DOMAIN}` });
    const prep = await User.findOne({ email: `prep@${EMAIL_DOMAIN}` });
    const evaluador = nutri || prep;
    if (!evaluador) return { atletas: 0, creadas: 0 };

    const defs = await ensureMetricDefs(models, evaluador._id);
    const defByName = new Map(defs.map((d) => [d.nombre, d]));
    const fechas = [utcDaysAgo(90), utcDaysAgo(45), utcDaysAgo(7)];
    let creadas = 0;
    let atletas = 0;

    for (const email of MEASUREMENT_ATLETES) {
        const atleta = await User.findOne({ email: email.toLowerCase(), rol: 'atleta' });
        if (!atleta) continue;
        atletas += 1;
        for (let i = 0; i < fechas.length; i += 1) {
            const valores = measurementValues(atleta, i);
            const notas = i === 0 ? 'Evaluación inicial' : i === 1 ? 'Control intermedio' : 'Control actual';
            for (const [nombre, valor] of Object.entries(valores)) {
                const def = defByName.get(nombre);
                if (!def || valor == null) continue;
                const exists = await Measurement.findOne({
                    atleta: atleta._id,
                    metrica: def._id,
                    fechaMedicion: fechas[i],
                });
                if (exists) continue;
                const isFisico = FISICO_PRESETS.some((p) => p.nombre === nombre);
                await Measurement.create({
                    atleta: atleta._id,
                    metrica: def._id,
                    valor,
                    evaluador: (isFisico ? prep : nutri)?._id || evaluador._id,
                    fechaMedicion: fechas[i],
                    notasExtra: notas,
                    visibleParaAtleta: true,
                    visibleParaTutor: true,
                });
                creadas += 1;
            }
        }
    }
    return { atletas, creadas };
}

async function seedSessionsPlansMeasurements(models) {
    const extras = {
        feePlans: 0,
        assignedCats: 0,
        trainingPlans: 0,
        sessionsCreated: 0,
        sessionsAttached: 0,
        sessionsCompleted: 0,
        paymentsCreated: 0,
        measurements: 0,
        measurementAthletes: 0,
        mes: new Date().getMonth() + 1,
        anio: new Date().getFullYear(),
    };

    const fee = await ensureFeePlans(models);
    extras.feePlans = Object.keys(fee.plansByKey).length;
    extras.assignedCats = fee.assignedCats;
    console.log(`   Planes de cuota: ${extras.feePlans} (asignados a ${extras.assignedCats} categorías)`);

    try {
        const payments = await generateMonthlyPaymentsForTenant(models, extras.mes, extras.anio);
        extras.paymentsCreated = payments.cuotasCreadas || 0;
        console.log(`   Cuotas nuevas: ${extras.paymentsCreated}`);
    } catch (e) {
        console.warn('   Cuotas del mes omitidas:', e.message);
    }

    const trainingPlans = await ensureTrainingPlans(models);
    extras.trainingPlans = trainingPlans.length;
    console.log(`   Planes de entrenamiento: ${extras.trainingPlans}`);

    const sessions = await generateExampleSessions(models);
    extras.sessionsCreated = sessions.creadasCount || 0;
    if (sessions.errores?.length) {
        console.warn(`   Sesiones con error: ${sessions.errores.length} (${sessions.errores[0]?.error || ''})`);
    }
    console.log(`   Sesiones nuevas: ${extras.sessionsCreated}`);

    const sessionExtra = await attachPlansAndCompletePastSessions(models, trainingPlans);
    extras.sessionsAttached = sessionExtra.attached;
    extras.sessionsCompleted = sessionExtra.completed;
    console.log(`   Sesiones con plan: ${extras.sessionsAttached} · pasadas completadas: ${extras.sessionsCompleted}`);

    const measurements = await ensureMeasurements(models);
    extras.measurements = measurements.creadas;
    extras.measurementAthletes = measurements.atletas;
    console.log(`   Mediciones: ${extras.measurements} (${extras.measurementAthletes} atletas)`);

    extras.sessions = sessions;
    return extras;
}

async function upsertUser(User, fields) {
    const { email, passwordPlain, ...rest } = fields;
    const normalized = email.toLowerCase();
    let user = await User.findOne({ email: normalized });
    if (user) {
        Object.assign(user, rest);
        if (passwordPlain) user.password = passwordPlain;
        await user.save();
        return user;
    }
    return User.create({
        ...rest,
        email: normalized,
        password: passwordPlain || PASSWORD,
        acceptedTermsVersion: TERMS_VERSION,
        acceptedTermsAt: new Date(),
    });
}

async function ensureClubInSuper() {
    const mongoUri = process.env.MONGO_URI;
    const mongoHost = process.env.MONGO_DB_HOST;
    if (!mongoUri || !mongoHost) {
        throw new Error('Faltan MONGO_URI o MONGO_DB_HOST (cargá super/.env).');
    }

    const superConn = await mongoose.createConnection(mongoUri).asPromise();
    const clubs = superConn.db.collection('clubs');
    const existing = await clubs.findOne({ urlIdentifier: CLUB_ID });
    if (existing?.connectionStringDB) {
        await superConn.close();
        return { created: false, connectionStringDB: existing.connectionStringDB };
    }

    const clubId = randomUUID();
    const uniqueDbSuffix = clubId.substring(0, 8);
    const tenantDbName = `club_${CLUB_ID.replace(/-/g, '_')}_${uniqueDbSuffix}`;
    const connectionStringDB = `${mongoHost.replace(/\/$/, '')}/${tenantDbName}?retryWrites=true&w=majority`;

    await clubs.insertOne({
        nombre: 'Club Atlético Ejemplo',
        urlIdentifier: CLUB_ID,
        emailContacto: `contacto@${EMAIL_DOMAIN}`,
        clubId,
        apiSecretKey: randomUUID().replace(/-/g, '') + Date.now().toString(36),
        estadoSuscripcion: 'periodo_prueba',
        logoUrl: '',
        primaryColor: '#0f766e',
        connectionStringDB,
        userCount: 0,
        mercadopagoUserId: '',
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await superConn.close();
    return { created: true, connectionStringDB };
}

async function cleanupExample(models) {
    const {
        User, Enrollment, Payment, Category, Discipline, Schedule, Space, News,
        Submission, Requirement, Session, TrainingPlan, Measurement, MetricDefinition, Plan,
    } = models;
    const emailRe = new RegExp(`@${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
    const users = await User.find({ email: emailRe, rol: { $ne: 'admin_club' } }).select('_id');
    const ids = users.map((u) => u._id);
    if (ids.length) {
        await Payment.deleteMany({ atleta: { $in: ids } });
        await Enrollment.deleteMany({ atleta: { $in: ids } });
        await Submission.deleteMany({ atleta: { $in: ids } });
        await Measurement.deleteMany({ atleta: { $in: ids } });
        await User.deleteMany({ _id: { $in: ids } });
    }
    const discs = await Discipline.find({ nombre: { $in: STRUCTURE.map((d) => d.nombre) } }).select('_id');
    const discIds = discs.map((d) => d._id);
    if (discIds.length) {
        const cats = await Category.find({ disciplina: { $in: discIds } }).select('_id');
        const catIds = cats.map((c) => c._id);
        if (catIds.length) {
            await Session.deleteMany({ categoria: { $in: catIds } });
            await Schedule.deleteMany({ categoria: { $in: catIds } });
            await Enrollment.deleteMany({ categoria: { $in: catIds } });
            await Requirement.deleteMany({ targetCategoria: { $in: catIds } });
            await Category.deleteMany({ _id: { $in: catIds } });
        }
        await TrainingPlan.deleteMany({ disciplina: { $in: discIds } });
        await Discipline.deleteMany({ _id: { $in: discIds } });
    }
    await Space.deleteMany({ nombre: { $in: [...SPACES.map((s) => s.nombre), ...STRUCTURE.map((d) => d.space.nombre)] } });
    await Plan.deleteMany({ nombre: { $in: FEE_PLANS.map((p) => p.nombre) } }).catch(() => {});
    await MetricDefinition.deleteMany({ nombre: { $in: [...ISAK_PRESETS, ...FISICO_PRESETS].map((p) => p.nombre) } });
    await News.deleteMany({ titulo: 'Bienvenida a la temporada' });
}

async function seed(models) {
    const {
        User, Discipline, Category, Enrollment, Payment,
        Space, Schedule, ClubSettings, News,
    } = models;

    let admin = await User.findOne({ rol: 'admin_club' });
    if (!admin) {
        admin = await upsertUser(User, {
            email: `admin@${EMAIL_DOMAIN}`,
            nombre: 'Marina',
            apellido: 'Admin',
            rol: 'admin_club',
            telefono: '11-4000-1000',
            passwordPlain: PASSWORD,
        });
    } else {
        admin.acceptedTermsVersion = TERMS_VERSION;
        admin.acceptedTermsAt = new Date();
        await admin.save();
    }

    const { plansByKey } = await ensureFeePlans(models);

    let settings = await ClubSettings.findOne();
    if (!settings) settings = await ClubSettings.create({});
    settings.transferenciaTitular = 'Club Atlético Ejemplo';
    settings.transferenciaBanco = 'Banco Nación';
    settings.transferenciaCbu = '0110599520000001234567';
    settings.transferenciaAlias = 'club.ejemplo.nacion';
    await settings.save();

    const staffPrep = await upsertUser(User, {
        email: `prep@${EMAIL_DOMAIN}`,
        nombre: 'Pablo',
        apellido: 'Rivas',
        rol: 'preparador_fisico',
        passwordPlain: PASSWORD,
    });
    const staffNutri = await upsertUser(User, {
        email: `nutri@${EMAIL_DOMAIN}`,
        nombre: 'Nora',
        apellido: 'Vega',
        rol: 'nutricionista',
        passwordPlain: PASSWORD,
    });
    const staffPsico = await upsertUser(User, {
        email: `psico@${EMAIL_DOMAIN}`,
        nombre: 'Silvia',
        apellido: 'Arias',
        rol: 'psicologo',
        passwordPlain: PASSWORD,
    });
    await upsertUser(User, {
        email: `staff@${EMAIL_DOMAIN}`,
        nombre: 'Laura',
        apellido: 'Méndez',
        rol: 'administrativo',
        passwordPlain: PASSWORD,
    });

    const sampleLogins = {
        admin: admin.email,
        coaches: [],
        tutor: null,
        athlete: null,
        athleteMinor: null,
    };

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();
    let athleteIndex = 0;

    for (const discDef of STRUCTURE) {
        let space = await Space.findOne({ nombre: discDef.space.nombre });
        if (!space) space = await Space.create(discDef.space);

        const coach = await upsertUser(User, {
            email: discDef.coach.email,
            nombre: discDef.coach.nombre,
            apellido: discDef.coach.apellido,
            rol: 'profe',
            telefono: '11-4000-2000',
            passwordPlain: PASSWORD,
        });
        sampleLogins.coaches.push(discDef.coach.email);

        let disc = await Discipline.findOne({ nombre: discDef.nombre });
        if (!disc) {
            disc = await Discipline.create({
                nombre: discDef.nombre,
                descripcion: discDef.descripcion,
                planDefault: plansByKey.primera._id,
            });
        } else {
            disc.planDefault = plansByKey.primera._id;
            await disc.save();
        }

        for (const catDef of discDef.categories) {
            const catPlan = feePlanForAge(plansByKey, catDef.edadMaxima);
            let cat = await Category.findOne({ nombre: catDef.nombre, disciplina: disc._id });
            if (!cat) {
                cat = await Category.create({
                    nombre: catDef.nombre,
                    disciplina: disc._id,
                    planDefault: catPlan._id,
                    edadMinima: catDef.edadMinima,
                    edadMaxima: catDef.edadMaxima,
                    sexo: 'ambos',
                    profesores: [coach._id],
                    preparadoresFisicos: [staffPrep._id],
                    nutricionistas: [staffNutri._id],
                    psicologos: [staffPsico._id],
                    chatAtletaProfesionalEnabled: catDef.edadMinima >= 18,
                    chatGrupalCategoriaEnabled: catDef.edadMinima >= 14,
                });
            } else {
                cat.planDefault = catPlan._id;
                cat.profesores = [coach._id];
                cat.preparadoresFisicos = [staffPrep._id];
                cat.nutricionistas = [staffNutri._id];
                cat.psicologos = [staffPsico._id];
                await cat.save();
            }

            for (const slot of catDef.slots || []) {
                const spaceName = catDef.space || discDef.space.nombre;
                let catSpace = await Space.findOne({ nombre: spaceName });
                if (!catSpace) {
                    const spec = SPACES.find((s) => s.nombre === spaceName) || { nombre: spaceName, tipo: 'cancha' };
                    catSpace = await Space.create(spec);
                }
                for (const dia of slot.days) {
                    await Schedule.updateOne(
                        { categoria: cat._id, diaSemana: dia, horaInicio: slot.horaInicio },
                        {
                            $set: {
                                categoria: cat._id,
                                diaSemana: dia,
                                horaInicio: slot.horaInicio,
                                horaFin: slot.horaFin,
                                espacio: catSpace._id,
                                vigenteHasta: vigenteHasta(),
                            },
                        },
                        { upsert: true },
                    );
                }
            }

            const isMinorCat = catDef.edadMaxima < 18;
            const tutor = isMinorCat
                ? await upsertUser(User, {
                    email: `tutor.${slug(discDef.nombre)}.${slug(catDef.nombre)}@${EMAIL_DOMAIN}`,
                    nombre: 'María',
                    apellido: LAST_NAMES[athleteIndex % LAST_NAMES.length],
                    rol: 'tutor',
                    telefono: '11-4000-3000',
                    descuentoFamiliar: 10,
                    passwordPlain: PASSWORD,
                })
                : null;

            if (tutor && !sampleLogins.tutor) sampleLogins.tutor = tutor.email;

            for (let i = 0; i < 10; i += 1) {
                const female = i % 2 === 0;
                const names = female ? FIRST_NAMES_F : FIRST_NAMES_M;
                const age = catDef.edadMinima + (i % Math.max(1, catDef.edadMaxima - catDef.edadMinima + 1));
                const n = String(i + 1).padStart(2, '0');
                const email = `atleta.${slug(discDef.nombre)}.${slug(catDef.nombre)}.${n}@${EMAIL_DOMAIN}`;
                const atleta = await upsertUser(User, {
                    email,
                    nombre: names[i % names.length],
                    apellido: LAST_NAMES[(athleteIndex + i) % LAST_NAMES.length],
                    rol: 'atleta',
                    sexo: female ? 'F' : 'M',
                    fechaNacimiento: birthFromAge(age),
                    telefono: `11-5${String(4000 + athleteIndex).padStart(4, '0')}-${n}`,
                    tutorPrincipal: tutor && i < 6 ? tutor._id : undefined,
                    passwordPlain: PASSWORD,
                });

                if (!sampleLogins.athleteMinor && tutor && i === 0) sampleLogins.athleteMinor = email;
                if (!sampleLogins.athlete && !isMinorCat && i === 0) sampleLogins.athlete = email;

                const exists = await Enrollment.findOne({ atleta: atleta._id, categoria: cat._id });
                if (!exists) {
                    await Enrollment.create({
                        atleta: atleta._id,
                        categoria: cat._id,
                        plan: catPlan._id,
                        estado: 'activo',
                        aptoMedico: i % 4 !== 0,
                    });
                }

                if (discDef.nombre === 'Fútbol' && catDef.nombre === 'Sub-13' && i < 3) {
                    const estado = i === 0 ? 'pendiente' : i === 1 ? 'pagado' : 'en_revision';
                    const payExists = await Payment.findOne({
                        atleta: atleta._id,
                        plan: catPlan._id,
                        mes,
                        anio,
                    });
                    if (!payExists) {
                        await Payment.create({
                            atleta: atleta._id,
                            plan: catPlan._id,
                            categoria: cat._id,
                            mes,
                            anio,
                            montoOriginal: catPlan.monto,
                            descuentoAplicado: 0,
                            montoFinal: catPlan.monto,
                            fechaVencimiento: new Date(anio, mes - 1, 10, 23, 59, 59),
                            estado,
                            metodoPago: estado === 'en_revision' ? 'transferencia' : 'efectivo',
                            comprobante: estado === 'en_revision' ? 'https://picsum.photos/seed/comprobante/800/600.jpg' : undefined,
                            fechaPago: estado === 'pagado' ? new Date() : undefined,
                            notasAdmin: 'seed:ejemplo',
                        });
                    }
                }
            }
            athleteIndex += 10;
        }
    }

    await News.updateOne(
        { titulo: 'Bienvenida a la temporada' },
        {
            $set: {
                titulo: 'Bienvenida a la temporada',
                contenido:
                    'Ya están cargados los planteles de Fútbol, Básquet y Hockey. Revisá horarios, documentación y cuotas en la app.',
                autor: admin._id,
                alcance: 'global',
                tipo: 'general',
            },
        },
        { upsert: true },
    );

    await ensureSpacesAndGrid(models);
    const families = await syncFamilies(models);
    const extras = await seedSessionsPlansMeasurements(models);

    try {
        await markOverduePayments(models);
    } catch (e) {
        console.warn('   markOverduePayments omitido:', e.message);
    }

    return { sampleLogins, families, extras, mes: extras.mes, anio: extras.anio };
}

function printGuide({ sampleLogins, extras, mes, anio }) {
    const line = '─'.repeat(60);
    console.log(`\n${line}`);
    console.log('  CLUB EJEMPLO — cómo usarlo');
    console.log(line);
    console.log(`\n  Código del club:   ${CLUB_ID}`);
    console.log(`  Contraseña:        ${PASSWORD}`);
    console.log('\n  Estructura');
    console.log('  · 3 disciplinas: Fútbol, Básquet, Hockey');
    console.log('  · 4 categorías c/u: Sub-9, Sub-13, Sub-17, Primera');
    console.log('  · 10 atletas por categoría (120 en total)');
    console.log('  · 6 espacios físicos y grilla semanal por categoría');
    console.log('  · Familias de ejemplo (tutor con 2–3 hijos)');
    console.log('  · 3 planes de cuota (infantiles / juveniles / primera)');
    console.log('  · 3 planes de entrenamiento (uno por disciplina)');
    console.log('  · Sesiones de la grilla (1 semana pasada + 4 futuras)');
    console.log('  · Mediciones ISAK + físicas en 6 atletas (3 controles)');
    if (mes && anio) console.log(`  · Cuotas del mes ${mes}/${anio}`);
    console.log('\n  Logins (todos con la misma contraseña)');
    console.log(`  Admin            ${sampleLogins.admin}`);
    console.log(`  Coach fútbol     ${sampleLogins.coaches[0]}`);
    console.log(`  Coach básquet    ${sampleLogins.coaches[1]}`);
    console.log(`  Coach hockey     ${sampleLogins.coaches[2]}`);
    console.log(`  Prep. físico     prep@${EMAIL_DOMAIN}`);
    console.log(`  Nutricionista    nutri@${EMAIL_DOMAIN}`);
    console.log(`  Psicólogo        psico@${EMAIL_DOMAIN}`);
    console.log(`  Administrativo   staff@${EMAIL_DOMAIN}`);
    if (sampleLogins.tutor) console.log(`  Tutor            ${sampleLogins.tutor}`);
    if (sampleLogins.athleteMinor) console.log(`  Atleta (menor)   ${sampleLogins.athleteMinor}`);
    if (sampleLogins.athlete) console.log(`  Atleta (primera) ${sampleLogins.athlete}`);
    console.log('\n  Familias (mismo tutor + hermanos)');
    console.log(`  Gómez            tutor.familia.gomez@${EMAIL_DOMAIN}  → Sofía (Fútbol Sub-9), Mateo (Fútbol Sub-13), Emma (Básquet Sub-9)`);
    console.log(`  Rodríguez        tutor.familia.rodriguez@${EMAIL_DOMAIN}`);
    console.log(`  Fernández        tutor.familia.fernandez@${EMAIL_DOMAIN}`);
    console.log(`  López            tutor.familia.lopez@${EMAIL_DOMAIN}`);
    console.log('\n  Recorrido sugerido');
    console.log('  1. App → código "ejemplo" → entrar como admin.');
    console.log('     Estructura, espacios, grilla, Finanzas → Planes y cuotas.');
    console.log('  2. Login coach.futbol → agenda de sesiones, plan de entreno y asistencia.');
    console.log('  3. Login nutri / prep → mediciones ISAK y físicas de Primera / Sub-13.');
    console.log('  4. Login tutor.familia.gomez → hijos y cuotas.');
    console.log('  5. Login atleta de Primera → entrenos, mediciones y perfil.');
    if (extras) {
        console.log('\n  Este seed');
        console.log(`  · Planes cuota: ${extras.feePlans} · planes de entreno: ${extras.trainingPlans}`);
        console.log(`  · Sesiones nuevas: ${extras.sessionsCreated} · con plan: ${extras.sessionsAttached} · pasadas completadas: ${extras.sessionsCompleted}`);
        console.log(`  · Cuotas nuevas: ${extras.paymentsCreated}`);
        console.log(`  · Mediciones: ${extras.measurements} (${extras.measurementAthletes} atletas)`);
    }
    console.log(`${line}\n`);
}

async function main() {
    console.log('🌱 Seed club ejemplo — inicio');
    const { created, connectionStringDB } = await ensureClubInSuper();
    console.log(created ? `   Club "${CLUB_ID}" creado en Super-Admin` : `   Club "${CLUB_ID}" ya existía`);

    const db = await getTenantDB(CLUB_ID, connectionStringDB.replace(/([^:]\/)\/+/g, '$1'));
    const models = getTenantModels(db);

    if (process.env.SEED_FORCE === 'true') {
        console.log('   SEED_FORCE=true → limpiando plantel de ejemplo...');
        await cleanupExample(models);
    }

    const already = await models.Discipline.findOne({ nombre: 'Fútbol' });
    const athleteCount = await models.User.countDocuments({ rol: 'atleta' });
    if (already && athleteCount >= 120 && process.env.SEED_FORCE !== 'true') {
        console.log('   Estructura ya cargada. Actualizando espacios, grilla, sesiones, planes y mediciones...');
        const grid = await ensureSpacesAndGrid(models);
        console.log(`   Espacios: ${grid.spaces} · slots de grilla: ${grid.slots}`);
        const families = await syncFamilies(models);
        families.forEach((f) => console.log(`   Familia ${f.tutor}: ${f.kids.join(', ') || '(sin hijos encontrados)'}`));
        const extras = await seedSessionsPlansMeasurements(models).catch((e) => {
            console.warn('   Sesiones/planes/mediciones:', e.message);
            console.warn(e.stack);
            return null;
        });
        if (extras) {
            console.log(`   Planes cuota: ${extras.feePlans} · planes de entreno: ${extras.trainingPlans}`);
            console.log(`   Sesiones nuevas: ${extras.sessionsCreated} · con plan: ${extras.sessionsAttached} · pasadas: ${extras.sessionsCompleted}`);
            console.log(`   Cuotas nuevas: ${extras.paymentsCreated} · mediciones: ${extras.measurements}`);
        }
        const admin = await models.User.findOne({ rol: 'admin_club' });
        printGuide({
            sampleLogins: {
                admin: admin?.email || `admin@${EMAIL_DOMAIN}`,
                coaches: STRUCTURE.map((d) => d.coach.email),
                tutor: `tutor.familia.gomez@${EMAIL_DOMAIN}`,
                athleteMinor: `atleta.futbol.sub9.01@${EMAIL_DOMAIN}`,
                athlete: `atleta.futbol.primera.01@${EMAIL_DOMAIN}`,
            },
            extras,
            mes: extras?.mes || new Date().getMonth() + 1,
            anio: extras?.anio || new Date().getFullYear(),
        });
        process.exit(0);
    }

    const summary = await seed(models);
    try {
        const superConn = await mongoose.createConnection(process.env.MONGO_URI).asPromise();
        await superConn.db.collection('clubs').updateOne(
            { urlIdentifier: CLUB_ID },
            { $set: { userCount: 120, updatedAt: new Date() } },
        );
        await superConn.close();
    } catch {
        /* ignore billing count */
    }

    console.log('✅ Seed club ejemplo completado.');
    printGuide(summary);
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Seed club ejemplo falló:', err.response?.data?.message || err.message);
    console.error(err.stack);
    process.exit(1);
});
