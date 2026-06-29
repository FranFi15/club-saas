/**
 * Flujo de ejemplo completo para probar la app (staff, atletas, docs, finanzas).
 *
 * Prerrequisito: club creado en super-admin con urlIdentifier (ej. club-demo).
 *
 * Uso (desde /backend):
 *   npm run seed:demo
 *
 * Variables (.env):
 *   SEED_CLUB_IDENTIFIER=club-demo
 *   SUPER_ADMIN_URL=http://localhost:4000
 *   INTERNAL_ADMIN_API_KEY=...
 *
 *   Opcional: SEED_MONGODB_URI=mongodb://...  (conexión directa al tenant)
 *   SEED_FORCE=true  → borra datos demo y vuelve a crearlos
 */
import 'dotenv/config';
import axios from 'axios';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { markOverduePayments } from '../services/overduePayments.service.js';
import { setGlobalFamilyDiscountPct } from '../services/familyDiscount.service.js';

const DEMO_PREFIX = 'Demo —';
const DEMO_PASSWORD = 'Demo2026!';
const DEMO_TAG = 'seed:demo';

const DEMO_EMAILS = {
    coach: 'demo.coach@clubdemo.local',
    preparador: 'demo.prep@clubdemo.local',
    nutricionista: 'demo.nutri@clubdemo.local',
    psicologo: 'demo.psico@clubdemo.local',
    administrativo: 'demo.staff@clubdemo.local',
    tutor: 'demo.tutor@clubdemo.local',
    ana: 'demo.ana@clubdemo.local',
    luca: 'demo.luca@clubdemo.local',
    mia: 'demo.mia@clubdemo.local',
};

const PLACEHOLDER_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const PLACEHOLDER_IMG = 'https://picsum.photos/seed/clubdemo/800/600.jpg';

async function resolveTenantConnection() {
    const uri = process.env.SEED_MONGODB_URI;
    const clubId = process.env.SEED_CLUB_IDENTIFIER || process.env.SEED_CLUB || 'club-demo';

    if (uri) {
        const db = await getTenantDB(clubId, uri.replace(/([^:]\/)\/+/g, '$1'));
        return { db, identifier: clubId };
    }

    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!clubId || !superUrl || !internalKey) {
        throw new Error(
            'Configurá SEED_CLUB_IDENTIFIER + SUPER_ADMIN_URL + INTERNAL_ADMIN_API_KEY en backend/.env',
        );
    }

    const { data } = await axios.get(
        `${superUrl.replace(/\/$/, '')}/api/clubs/internal/${clubId}/db-info`,
        { headers: { 'x-internal-api-key': internalKey }, timeout: 30000 },
    );
    const cs = String(data.connectionStringDB).replace(/([^:]\/)\/+/g, '$1');
    const db = await getTenantDB(clubId, cs);
    return { db, identifier: clubId };
}

async function upsertUser(User, fields) {
    const { email, passwordPlain, ...rest } = fields;
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
        Object.assign(user, rest);
        if (passwordPlain) user.password = passwordPlain;
        await user.save();
        return user;
    }
    return User.create({ ...rest, email: email.toLowerCase(), password: passwordPlain || DEMO_PASSWORD });
}

function birth(yearsAgo) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    return d;
}

async function cleanupDemoData(models) {
    const {
        Plan, Payment, Enrollment, User, Category, Discipline,
        Requirement, Submission, News,
    } = models;

    const demoReqs = await Requirement.find({ titulo: new RegExp(`^${DEMO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).select('_id');
    const reqIds = demoReqs.map((r) => r._id);
    if (reqIds.length) {
        await Submission.deleteMany({ requerimiento: { $in: reqIds } });
        await Requirement.deleteMany({ _id: { $in: reqIds } });
    }

    const demoPlans = await Plan.find({ nombre: new RegExp(`^${DEMO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).select('_id');
    const planIds = demoPlans.map((p) => p._id);
    if (planIds.length) {
        await Payment.deleteMany({ plan: { $in: planIds } });
        await Enrollment.deleteMany({ plan: { $in: planIds } });
        await Plan.deleteMany({ _id: { $in: planIds } });
    }

    const demoEmails = Object.values(DEMO_EMAILS);
    const demoUsers = await User.find({ email: { $in: demoEmails } }).select('_id');
    const userIds = demoUsers.map((u) => u._id);
    if (userIds.length) {
        await Payment.deleteMany({ atleta: { $in: userIds } });
        await Enrollment.deleteMany({ atleta: { $in: userIds } });
        await Submission.deleteMany({ atleta: { $in: userIds } });
        await User.deleteMany({ _id: { $in: userIds } });
    }

    await Category.deleteMany({ nombre: new RegExp(`^${DEMO_PREFIX}`) });
    await Discipline.deleteMany({ nombre: new RegExp(`^${DEMO_PREFIX}`) });
    await News.deleteMany({ titulo: new RegExp(`^${DEMO_PREFIX}`) });
}

async function seedClubDemoFlow(models) {
    const {
        User, Plan, Discipline, Category, Enrollment, Payment,
        Requirement, Submission, ClubSettings, News,
    } = models;

    const admin = await User.findOne({ rol: 'admin_club' });
    if (!admin) {
        throw new Error('No hay admin_club en el tenant. Creá el club desde super-admin primero.');
    }

    const plan = await Plan.findOneAndUpdate(
        { nombre: `${DEMO_PREFIX} Cuota mensual` },
        {
            nombre: `${DEMO_PREFIX} Cuota mensual`,
            monto: 15000,
            diaVencimiento: 10,
            porcentajeRecargo: 10,
            descripcion: 'Plan demo para pruebas',
            activo: true,
        },
        { upsert: true, new: true },
    );

    let disc = await Discipline.findOne({ nombre: `${DEMO_PREFIX} Fútbol` });
    if (!disc) {
        disc = await Discipline.create({
            nombre: `${DEMO_PREFIX} Fútbol`,
            descripcion: 'Disciplina de ejemplo',
            planDefault: plan._id,
        });
    } else {
        disc.planDefault = plan._id;
        await disc.save();
    }

    const coach = await upsertUser(User, {
        email: DEMO_EMAILS.coach,
        nombre: 'Diego',
        apellido: 'Profe',
        rol: 'profe',
        telefono: '11-5555-0101',
        passwordPlain: DEMO_PASSWORD,
    });

    const preparador = await upsertUser(User, {
        email: DEMO_EMAILS.preparador,
        nombre: 'Pablo',
        apellido: 'Prep',
        rol: 'preparador_fisico',
        passwordPlain: DEMO_PASSWORD,
    });

    const nutricionista = await upsertUser(User, {
        email: DEMO_EMAILS.nutricionista,
        nombre: 'Nora',
        apellido: 'Nutri',
        rol: 'nutricionista',
        passwordPlain: DEMO_PASSWORD,
    });

    const psicologo = await upsertUser(User, {
        email: DEMO_EMAILS.psicologo,
        nombre: 'Silvia',
        apellido: 'Psico',
        rol: 'psicologo',
        passwordPlain: DEMO_PASSWORD,
    });

    await upsertUser(User, {
        email: DEMO_EMAILS.administrativo,
        nombre: 'Laura',
        apellido: 'Admin',
        rol: 'administrativo',
        passwordPlain: DEMO_PASSWORD,
    });

    let cat = await Category.findOne({ nombre: `${DEMO_PREFIX} Sub-15`, disciplina: disc._id });
    if (!cat) {
        cat = await Category.create({
            nombre: `${DEMO_PREFIX} Sub-15`,
            disciplina: disc._id,
            planDefault: plan._id,
            edadMinima: 12,
            edadMaxima: 15,
            profesores: [coach._id],
            preparadoresFisicos: [preparador._id],
            nutricionistas: [nutricionista._id],
            psicologos: [psicologo._id],
        });
    } else {
        cat.planDefault = plan._id;
        cat.profesores = [coach._id];
        cat.preparadoresFisicos = [preparador._id];
        cat.nutricionistas = [nutricionista._id];
        cat.psicologos = [psicologo._id];
        await cat.save();
    }

    const tutor = await upsertUser(User, {
        email: DEMO_EMAILS.tutor,
        nombre: 'María',
        apellido: 'García',
        rol: 'tutor',
        telefono: '11-5555-0202',
        descuentoFamiliar: 10,
        passwordPlain: DEMO_PASSWORD,
    });

    const ana = await upsertUser(User, {
        email: DEMO_EMAILS.ana,
        nombre: 'Ana',
        apellido: 'García',
        rol: 'atleta',
        tutorPrincipal: tutor._id,
        fechaNacimiento: birth(14),
        sexo: 'F',
        passwordPlain: DEMO_PASSWORD,
    });

    const luca = await upsertUser(User, {
        email: DEMO_EMAILS.luca,
        nombre: 'Luca',
        apellido: 'García',
        rol: 'atleta',
        tutorPrincipal: tutor._id,
        fechaNacimiento: birth(13),
        sexo: 'M',
        passwordPlain: DEMO_PASSWORD,
    });

    const mia = await upsertUser(User, {
        email: DEMO_EMAILS.mia,
        nombre: 'Mía',
        apellido: 'López',
        rol: 'atleta',
        fechaNacimiento: birth(14),
        sexo: 'F',
        passwordPlain: DEMO_PASSWORD,
    });

    async function upsertEnrollment(atleta) {
        let enr = await Enrollment.findOne({ atleta: atleta._id, categoria: cat._id });
        if (enr) {
            enr.plan = plan._id;
            enr.estado = 'activo';
            await enr.save();
            return enr;
        }
        return Enrollment.create({
            atleta: atleta._id,
            categoria: cat._id,
            plan: plan._id,
            estado: 'activo',
            aptoMedico: true,
        });
    }

    await upsertEnrollment(ana);
    await upsertEnrollment(luca);
    await upsertEnrollment(mia);

    await setGlobalFamilyDiscountPct(models, 10);

    let settings = await ClubSettings.findOne();
    if (!settings) {
        settings = await ClubSettings.create({});
    }
    settings.transferenciaTitular = 'Club Demo S.A.';
    settings.transferenciaBanco = 'Banco Demo';
    settings.transferenciaCbu = '0000003100010000000001';
    settings.transferenciaAlias = 'club.demo.ar';
    await settings.save();

    async function upsertRequirement(titulo, extra = {}) {
        let req = await Requirement.findOne({ titulo });
        if (req) {
            Object.assign(req, extra);
            await req.save();
            return req;
        }
        return Requirement.create({
            titulo,
            descripcion: extra.descripcion || 'Documento de ejemplo para pruebas',
            obligatorio: true,
            alcance: 'categoria',
            targetCategoria: cat._id,
            creadoPor: coach._id,
            activo: true,
            ...extra,
        });
    }

    const reqApto = await upsertRequirement(`${DEMO_PREFIX} Apto médico`, {
        descripcion: 'Apto médico vigente de la temporada',
    });
    const reqDni = await upsertRequirement(`${DEMO_PREFIX} DNI (frente y dorso)`, {
        descripcion: 'Foto o PDF legible del documento',
    });
    const reqViaje = await upsertRequirement(`${DEMO_PREFIX} Autorización de viaje`, {
        descripcion: 'Solo para Ana — torneo fuera de casa',
        alcance: 'usuario',
        targetUsuario: ana._id,
        targetCategoria: undefined,
        creadoPor: coach._id,
    });

    async function upsertSubmission(requerimiento, atleta, estado, fileUrl, extra = {}) {
        let sub = await Submission.findOne({ requerimiento: requerimiento._id, atleta: atleta._id });
        const base = {
            requerimiento: requerimiento._id,
            atleta: atleta._id,
            fileUrl,
            estado,
            ...extra,
        };
        if (sub) {
            Object.assign(sub, base);
            await sub.save();
            return sub;
        }
        return Submission.create(base);
    }

    await upsertSubmission(reqApto, ana, 'revision', PLACEHOLDER_PDF);
    await upsertSubmission(reqApto, luca, 'revision', PLACEHOLDER_PDF);
    await upsertSubmission(reqDni, luca, 'rechazado', PLACEHOLDER_IMG, {
        motivoRechazo: 'La imagen está borrosa. Volvé a subir el DNI con buena luz.',
        revisadoPor: coach._id,
        fechaRevision: new Date(),
    });
    await upsertSubmission(reqApto, mia, 'aprobado', PLACEHOLDER_PDF, {
        revisadoPor: coach._id,
        fechaRevision: new Date(),
    });
    await upsertSubmission(reqViaje, ana, 'revision', PLACEHOLDER_PDF);

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();

    async function upsertPayment(atleta, estado, extra = {}) {
        const exists = await Payment.findOne({
            atleta: atleta._id,
            plan: plan._id,
            mes,
            anio,
            notasAdmin: DEMO_TAG,
        });
        if (exists) {
            Object.assign(exists, { estado, ...extra });
            await exists.save();
            return exists;
        }
        const monto = plan.monto;
        return Payment.create({
            atleta: atleta._id,
            plan: plan._id,
            categoria: cat._id,
            mes,
            anio,
            montoOriginal: monto,
            descuentoAplicado: 0,
            montoFinal: monto,
            fechaVencimiento: new Date(anio, mes - 1, 10, 23, 59, 59),
            estado,
            metodoPago: estado === 'en_revision' ? 'transferencia' : 'efectivo',
            comprobante: estado === 'en_revision' ? PLACEHOLDER_IMG : undefined,
            transferGrupoId: estado === 'en_revision' ? `demo-${Date.now()}` : undefined,
            notasAdmin: DEMO_TAG,
            ...extra,
        });
    }

    await upsertPayment(ana, 'pendiente');
    await upsertPayment(luca, 'en_revision', {
        comprobante: PLACEHOLDER_IMG,
        transferGrupoId: `demo-transfer-${luca._id}`,
    });
    await upsertPayment(mia, 'pagado', { fechaPago: new Date() });

    await markOverduePayments(models);

    await News.findOneAndUpdate(
        { titulo: `${DEMO_PREFIX} Bienvenida al club` },
        {
            titulo: `${DEMO_PREFIX} Bienvenida al club`,
            contenido: 'Este es un comunicado de ejemplo. Podés probar notificaciones y novedades.',
            autor: admin._id,
            alcance: 'global',
            tipo: 'general',
        },
        { upsert: true, new: true },
    );

    return {
        categoryName: cat.nombre,
        disciplineName: disc.nombre,
        mes,
        anio,
        adminEmail: admin.email,
    };
}

function printGuide(identifier, summary) {
    const line = '─'.repeat(56);
    console.log(`\n${line}`);
    console.log('  GUÍA RÁPIDA — Flujo demo del club');
    console.log(line);
    console.log(`\n  Código del club (app):  ${identifier}`);
    console.log(`  Contraseña demo:        ${DEMO_PASSWORD}`);
    console.log(`\n  Categoría: ${summary.disciplineName} → ${summary.categoryName}`);
    console.log(`  Cuotas del mes: ${summary.mes}/${summary.anio}`);
    console.log('\n  USUARIOS DE PRUEBA');
    console.log('  Rol              Email');
    console.log('  ───────────────  ─────────────────────────────');
    console.log(`  Admin club       ${summary.adminEmail}  (creado al registrar el club)`);
    console.log(`  Coach            ${DEMO_EMAILS.coach}`);
    console.log(`  Preparador       ${DEMO_EMAILS.preparador}`);
    console.log(`  Nutricionista    ${DEMO_EMAILS.nutricionista}`);
    console.log(`  Psicólogo        ${DEMO_EMAILS.psicologo}`);
    console.log(`  Administrativo   ${DEMO_EMAILS.administrativo}`);
    console.log(`  Tutor            ${DEMO_EMAILS.tutor}`);
    console.log(`  Atleta           ${DEMO_EMAILS.ana} / ${DEMO_EMAILS.luca} / ${DEMO_EMAILS.mia}`);
    console.log('\n  QUÉ PROBAR');
    console.log('  1. App → buscar club → login con cada rol');
    console.log('  2. Coach → categoría Sub-15 → Documentación enviada');
    console.log('     · Aprobar/rechazar entregas en revisión (Ana, Luca)');
    console.log('  3. Admin → Revisar documentación / Finanzas → Comprobantes');
    console.log('     · Luca tiene transferencia en revisión');
    console.log('  4. Tutor → pagar cuota de Ana (datos bancarios demo)');
    console.log('  5. Atleta → subir documentación pendiente');
    console.log(`\n  Más detalle: backend/DEMO_FLOW.md`);
    console.log(`${line}\n`);
}

async function main() {
    console.log('🌱 Seed club demo — inicio');
    const { db, identifier } = await resolveTenantConnection();
    const models = getTenantModels(db);
    console.log(`   Club / tenant: ${identifier}`);

    if (process.env.SEED_FORCE === 'true') {
        console.log('   SEED_FORCE=true → limpiando datos demo previos...');
        await cleanupDemoData(models);
    }

    const hasDemo = await models.Requirement.findOne({
        titulo: new RegExp(`^${DEMO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    });
    if (hasDemo && process.env.SEED_FORCE !== 'true') {
        console.log('   Ya existen datos demo. Usá SEED_FORCE=true para regenerar.');
        printGuide(identifier, {
            categoryName: `${DEMO_PREFIX} Sub-15`,
            disciplineName: `${DEMO_PREFIX} Fútbol`,
            mes: new Date().getMonth() + 1,
            anio: new Date().getFullYear(),
            adminEmail: (await models.User.findOne({ rol: 'admin_club' }))?.email || '(admin)',
        });
        process.exit(0);
    }

    const summary = await seedClubDemoFlow(models);
    console.log('✅ Seed club demo completado.');
    printGuide(identifier, summary);
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Seed club demo falló:', err.response?.data?.message || err.message);
    process.exit(1);
});
