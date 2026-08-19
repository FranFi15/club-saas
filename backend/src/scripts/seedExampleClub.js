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
const DIAS_MAPA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function generateUpcomingSessions(models, weeks = 4) {
    const { Schedule, Session } = models;
    const schedules = await Schedule.find();
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + weeks * 7);
    let creadas = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const nombreDia = DIAS_MAPA[d.getUTCDay()];
        const fechaDia = new Date(d);
        for (const p of schedules) {
            if (p.diaSemana !== nombreDia) continue;
            if (p.vigenteHasta && fechaDia > p.vigenteHasta) continue;
            const exists = await Session.findOne({
                categoria: p.categoria,
                fecha: fechaDia,
                horaInicio: p.horaInicio,
                tipo: 'entrenamiento',
            });
            if (exists) continue;
            await Session.create({
                tipo: 'entrenamiento',
                categoria: p.categoria,
                fecha: fechaDia,
                horaInicio: p.horaInicio,
                horaFin: p.horaFin,
                espacio: p.espacio,
                grillaHorario: p._id,
                estado: 'programada',
            });
            creadas += 1;
        }
    }
    return { creadasCount: creadas };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../super/.env') });

const CLUB_ID = (process.env.SEED_CLUB_IDENTIFIER || 'ejemplo').toLowerCase();
const PASSWORD = process.env.SEED_EXAMPLE_PASSWORD || 'Demo2026!';
const EMAIL_DOMAIN = 'clubejemplo.local';
const TERMS_VERSION = '2026-08-15';

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

const STRUCTURE = [
    {
        nombre: 'Fútbol',
        descripcion: 'Escuela y planteles competitivos',
        space: { nombre: 'Cancha de fútbol 11', tipo: 'cancha' },
        coach: { nombre: 'Diego', apellido: 'Moreno', email: `coach.futbol@${EMAIL_DOMAIN}` },
        categories: [
            { nombre: 'Sub-9', edadMinima: 7, edadMaxima: 9, days: ['Lunes', 'Miércoles'], horaInicio: '17:00', horaFin: '18:15' },
            { nombre: 'Sub-13', edadMinima: 10, edadMaxima: 13, days: ['Martes', 'Jueves'], horaInicio: '17:00', horaFin: '18:30' },
            { nombre: 'Sub-17', edadMinima: 14, edadMaxima: 17, days: ['Lunes', 'Miércoles'], horaInicio: '18:30', horaFin: '20:00' },
            { nombre: 'Primera', edadMinima: 18, edadMaxima: 40, days: ['Martes', 'Jueves'], horaInicio: '20:00', horaFin: '21:30' },
        ],
    },
    {
        nombre: 'Básquet',
        descripcion: 'Formativas y primera',
        space: { nombre: 'Gimnasio cubierto', tipo: 'gimnasio' },
        coach: { nombre: 'Carla', apellido: 'Benítez', email: `coach.basquet@${EMAIL_DOMAIN}` },
        categories: [
            { nombre: 'Sub-9', edadMinima: 7, edadMaxima: 9, days: ['Martes', 'Jueves'], horaInicio: '17:00', horaFin: '18:15' },
            { nombre: 'Sub-13', edadMinima: 10, edadMaxima: 13, days: ['Lunes', 'Miércoles'], horaInicio: '17:00', horaFin: '18:30' },
            { nombre: 'Sub-17', edadMinima: 14, edadMaxima: 17, days: ['Martes', 'Jueves'], horaInicio: '18:30', horaFin: '20:00' },
            { nombre: 'Primera', edadMinima: 18, edadMaxima: 40, days: ['Lunes', 'Miércoles'], horaInicio: '20:00', horaFin: '21:30' },
        ],
    },
    {
        nombre: 'Hockey',
        descripcion: 'Hockey sobre césped',
        space: { nombre: 'Cancha de hockey', tipo: 'cancha' },
        coach: { nombre: 'Luciana', apellido: 'Paz', email: `coach.hockey@${EMAIL_DOMAIN}` },
        categories: [
            { nombre: 'Sub-9', edadMinima: 7, edadMaxima: 9, days: ['Sábado'], horaInicio: '09:00', horaFin: '10:15' },
            { nombre: 'Sub-13', edadMinima: 10, edadMaxima: 13, days: ['Sábado'], horaInicio: '10:30', horaFin: '12:00' },
            { nombre: 'Sub-17', edadMinima: 14, edadMaxima: 17, days: ['Viernes', 'Sábado'], horaInicio: '18:00', horaFin: '19:30' },
            { nombre: 'Primera', edadMinima: 18, edadMaxima: 40, days: ['Martes', 'Jueves'], horaInicio: '21:00', horaFin: '22:30' },
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
    const { User, Enrollment, Payment, Category, Discipline, Schedule, Space, News, Submission, Requirement } = models;
    const emailRe = new RegExp(`@${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
    const users = await User.find({ email: emailRe, rol: { $ne: 'admin_club' } }).select('_id');
    const ids = users.map((u) => u._id);
    if (ids.length) {
        await Payment.deleteMany({ atleta: { $in: ids } });
        await Enrollment.deleteMany({ atleta: { $in: ids } });
        await Submission.deleteMany({ atleta: { $in: ids } });
        await User.deleteMany({ _id: { $in: ids } });
    }
    const discs = await Discipline.find({ nombre: { $in: STRUCTURE.map((d) => d.nombre) } }).select('_id');
    const discIds = discs.map((d) => d._id);
    if (discIds.length) {
        const cats = await Category.find({ disciplina: { $in: discIds } }).select('_id');
        const catIds = cats.map((c) => c._id);
        if (catIds.length) {
            await Schedule.deleteMany({ categoria: { $in: catIds } });
            await Enrollment.deleteMany({ categoria: { $in: catIds } });
            await Requirement.deleteMany({ targetCategoria: { $in: catIds } });
            await Category.deleteMany({ _id: { $in: catIds } });
        }
        await Discipline.deleteMany({ _id: { $in: discIds } });
    }
    await Space.deleteMany({ nombre: { $in: STRUCTURE.map((d) => d.space.nombre) } });
    await News.deleteMany({ titulo: 'Bienvenida a la temporada' });
}

async function seed(models) {
    const {
        User, Plan, Discipline, Category, Enrollment, Payment,
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

    let plan = await Plan.findOne({ nombre: 'Cuota mensual' });
    if (!plan) {
        plan = await Plan.create({
            nombre: 'Cuota mensual',
            monto: 18000,
            diaVencimiento: 10,
            porcentajeRecargo: 10,
            descripcion: 'Cuota general del club',
            activo: true,
        });
    } else {
        plan.monto = 18000;
        plan.diaVencimiento = 10;
        plan.porcentajeRecargo = 10;
        plan.activo = true;
        await plan.save();
    }

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
                planDefault: plan._id,
            });
        } else {
            disc.planDefault = plan._id;
            await disc.save();
        }

        for (const catDef of discDef.categories) {
            let cat = await Category.findOne({ nombre: catDef.nombre, disciplina: disc._id });
            if (!cat) {
                cat = await Category.create({
                    nombre: catDef.nombre,
                    disciplina: disc._id,
                    planDefault: plan._id,
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
                cat.planDefault = plan._id;
                cat.profesores = [coach._id];
                cat.preparadoresFisicos = [staffPrep._id];
                cat.nutricionistas = [staffNutri._id];
                cat.psicologos = [staffPsico._id];
                await cat.save();
            }

            for (const dia of catDef.days) {
                await Schedule.updateOne(
                    { categoria: cat._id, diaSemana: dia, horaInicio: catDef.horaInicio },
                    {
                        $set: {
                            categoria: cat._id,
                            diaSemana: dia,
                            horaInicio: catDef.horaInicio,
                            horaFin: catDef.horaFin,
                            espacio: space._id,
                            vigenteHasta: vigenteHasta(),
                        },
                    },
                    { upsert: true },
                );
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
                        plan: plan._id,
                        estado: 'activo',
                        aptoMedico: i % 4 !== 0,
                    });
                }

                if (discDef.nombre === 'Fútbol' && catDef.nombre === 'Sub-13' && i < 3) {
                    const estado = i === 0 ? 'pendiente' : i === 1 ? 'pagado' : 'en_revision';
                    const payExists = await Payment.findOne({
                        atleta: atleta._id,
                        plan: plan._id,
                        mes,
                        anio,
                    });
                    if (!payExists) {
                        await Payment.create({
                            atleta: atleta._id,
                            plan: plan._id,
                            categoria: cat._id,
                            mes,
                            anio,
                            montoOriginal: plan.monto,
                            descuentoAplicado: 0,
                            montoFinal: plan.monto,
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

    try {
        await markOverduePayments(models);
    } catch (e) {
        console.warn('   markOverduePayments omitido:', e.message);
    }
    const sessions = await generateUpcomingSessions(models);

    return { sampleLogins, sessions, mes, anio };
}

function printGuide({ sampleLogins, sessions, mes, anio }) {
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
    console.log('  · Horarios + sesiones generadas para entrenar asistencia');
    console.log(`  · Cuotas de ejemplo en Fútbol Sub-13 (${mes}/${anio})`);
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
    console.log('\n  Recorrido sugerido');
    console.log('  1. App → código "ejemplo" → entrar como admin.');
    console.log('     Estructura: disciplinas, categorías y plantel de 10 por categoría.');
    console.log('  2. Finanzas: cuotas de Fútbol Sub-13 (pendiente / pagada / en revisión).');
    console.log('  3. Login coach.futbol → sesiones e asistencia del plantel.');
    console.log('  4. Login tutor de Fútbol Sub-9 → ver hijos y cuotas.');
    console.log('  5. Login atleta de Primera → entrenos, noticias, perfil.');
    if (sessions?.creadasCount) {
        console.log(`\n  Sesiones creadas en este seed: ${sessions.creadasCount}`);
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
        console.log('   Estructura ya cargada. Generando sesiones si faltan...');
        const sessions = await generateUpcomingSessions(models).catch((e) => {
            console.warn('   Sesiones:', e.message);
            return null;
        });
        const admin = await models.User.findOne({ rol: 'admin_club' });
        printGuide({
            sampleLogins: {
                admin: admin?.email || `admin@${EMAIL_DOMAIN}`,
                coaches: STRUCTURE.map((d) => d.coach.email),
                tutor: `tutor.futbol.sub9@${EMAIL_DOMAIN}`,
                athleteMinor: `atleta.futbol.sub9.01@${EMAIL_DOMAIN}`,
                athlete: `atleta.futbol.primera.01@${EMAIL_DOMAIN}`,
            },
            sessions,
            mes: new Date().getMonth() + 1,
            anio: new Date().getFullYear(),
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
