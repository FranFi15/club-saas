/**
 * Datos de ejemplo para Finanzas (planes, asignación, familias, cuotas con recargo).
 *
 * Uso (desde /backend):
 *   npm run seed:finanzas
 *
 * Variables (.env):
 *   Opción A — conexión directa:
 *     SEED_MONGODB_URI=mongodb://...
 *     SEED_CLUB_IDENTIFIER=tu-club   (opcional, solo para logs)
 *
 *   Opción B — vía super-admin (como el cron):
 *     SEED_CLUB_IDENTIFIER=tu-club
 *     SUPER_ADMIN_URL=...
 *     INTERNAL_ADMIN_API_KEY=...
 *
 *   SEED_FORCE=true   → borra datos Demo —* y vuelve a crearlos
 */
import 'dotenv/config';
import axios from 'axios';
import { getTenantDB } from '../config/db.js';
import { getTenantModels } from '../utils/tenantModels.js';
import { markOverduePayments } from '../services/overduePayments.service.js';
import { setGlobalFamilyDiscountPct } from '../services/familyDiscount.service.js';

const DEMO_PREFIX = 'Demo —';
const DEMO_PASSWORD = 'Demo2026!';

const PLAN_DEFS = [
    { nombre: `${DEMO_PREFIX} Cuota estándar`, monto: 12000, diaVencimiento: 10, porcentajeRecargo: 10, descripcion: 'Ejemplo con 10% de recargo al vencer' },
    { nombre: `${DEMO_PREFIX} Cuota infantil`, monto: 8000, diaVencimiento: 5, porcentajeRecargo: 5, descripcion: 'Ejemplo con 5% de recargo' },
    { nombre: `${DEMO_PREFIX} Cuota premium`, monto: 18000, diaVencimiento: 15, porcentajeRecargo: 15, descripcion: 'Ejemplo con 15% de recargo' },
    { nombre: `${DEMO_PREFIX} Sin recargo`, monto: 10000, diaVencimiento: 10, porcentajeRecargo: 0, descripcion: 'Sin recargo por mora' },
];

async function resolveTenantConnection() {
    const uri = process.env.SEED_MONGODB_URI;
    const clubId = process.env.SEED_CLUB_IDENTIFIER || process.env.SEED_CLUB;

    if (uri) {
        const id = clubId || 'seed-local';
        const db = await getTenantDB(id, uri.replace(/([^:]\/)\/+/g, '$1'));
        return { db, identifier: id };
    }

    const superUrl = process.env.SUPER_ADMIN_URL;
    const internalKey = process.env.INTERNAL_ADMIN_API_KEY;
    if (!clubId || !superUrl || !internalKey) {
        throw new Error(
            'Configurá SEED_MONGODB_URI o bien SEED_CLUB_IDENTIFIER + SUPER_ADMIN_URL + INTERNAL_ADMIN_API_KEY en backend/.env',
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

async function cleanupDemoData(models) {
    const { Plan, Payment, Enrollment, User, Category, Discipline } = models;
    const demoPlans = await Plan.find({ nombre: new RegExp(`^${DEMO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).select('_id');
    const planIds = demoPlans.map((p) => p._id);

    if (planIds.length) {
        await Payment.deleteMany({ plan: { $in: planIds } });
        await Enrollment.deleteMany({ plan: { $in: planIds } });
    }

    const demoEmails = [
        'demo.tutor@finanzas.local',
        'demo.hijo1@finanzas.local',
        'demo.hijo2@finanzas.local',
        'demo.solo@finanzas.local',
    ];
    const demoUsers = await User.find({ email: { $in: demoEmails } }).select('_id');
    const userIds = demoUsers.map((u) => u._id);
    if (userIds.length) {
        await Payment.deleteMany({ atleta: { $in: userIds } });
        await Enrollment.deleteMany({ atleta: { $in: userIds } });
        await User.deleteMany({ _id: { $in: userIds } });
    }

    await Category.deleteMany({ nombre: new RegExp(`^${DEMO_PREFIX}`) });
    await Discipline.deleteMany({ nombre: new RegExp(`^${DEMO_PREFIX}`) });
    await Plan.deleteMany({ _id: { $in: planIds } });
}

async function seedFinanzasExamples(models) {
    const { Plan, Discipline, Category, User, Enrollment, Payment } = models;

    const plans = {};
    for (const def of PLAN_DEFS) {
        let plan = await Plan.findOne({ nombre: def.nombre });
        if (plan) {
            Object.assign(plan, def);
            await plan.save();
        } else {
            plan = await Plan.create({ ...def, activo: true });
        }
        plans[def.nombre] = plan;
    }

    const planEstandar = plans[`${DEMO_PREFIX} Cuota estándar`];
    const planInfantil = plans[`${DEMO_PREFIX} Cuota infantil`];
    const planPremium = plans[`${DEMO_PREFIX} Cuota premium`];
    const planSinRecargo = plans[`${DEMO_PREFIX} Sin recargo`];

    let discFutbol = await Discipline.findOne({ nombre: `${DEMO_PREFIX} Fútbol` });
    if (!discFutbol) {
        discFutbol = await Discipline.create({
            nombre: `${DEMO_PREFIX} Fútbol`,
            descripcion: 'Disciplina de ejemplo para finanzas',
            planDefault: planEstandar._id,
        });
    } else {
        discFutbol.planDefault = planEstandar._id;
        await discFutbol.save();
    }

    let discBasquet = await Discipline.findOne({ nombre: `${DEMO_PREFIX} Básquet` });
    if (!discBasquet) {
        discBasquet = await Discipline.create({
            nombre: `${DEMO_PREFIX} Básquet`,
            descripcion: 'Segunda disciplina demo',
            planDefault: planInfantil._id,
        });
    } else {
        discBasquet.planDefault = planInfantil._id;
        await discBasquet.save();
    }

    async function upsertCategory(nombre, disciplina, planDefault, edadMin, edadMax) {
        let cat = await Category.findOne({ nombre, disciplina: disciplina._id });
        if (!cat) {
            cat = await Category.create({
                nombre,
                disciplina: disciplina._id,
                planDefault: planDefault?._id,
                edadMinima: edadMin,
                edadMaxima: edadMax,
            });
        } else {
            cat.planDefault = planDefault?._id;
            await cat.save();
        }
        return cat;
    }

    const catFutbolSub15 = await upsertCategory(`${DEMO_PREFIX} Sub-15`, discFutbol, planInfantil, 12, 15);
    const catFutbolPrimera = await upsertCategory(`${DEMO_PREFIX} Primera`, discFutbol, planPremium, 16, 99);
    const catBasquetU17 = await upsertCategory(`${DEMO_PREFIX} U17`, discBasquet, planSinRecargo, 14, 17);

    const tutor = await upsertUser(User, {
        email: 'demo.tutor@finanzas.local',
        nombre: 'Carlos',
        apellido: 'Demo Tutor',
        rol: 'tutor',
        passwordPlain: DEMO_PASSWORD,
        descuentoFamiliar: 15,
        telefono: '11-5555-0001',
    });

    const birth = (yearsAgo) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - yearsAgo);
        return d;
    };

    const hijo1 = await upsertUser(User, {
        email: 'demo.hijo1@finanzas.local',
        nombre: 'Lucas',
        apellido: 'Demo',
        rol: 'atleta',
        tutorPrincipal: tutor._id,
        fechaNacimiento: birth(14),
        passwordPlain: DEMO_PASSWORD,
    });

    const hijo2 = await upsertUser(User, {
        email: 'demo.hijo2@finanzas.local',
        nombre: 'Sofía',
        apellido: 'Demo',
        rol: 'atleta',
        tutorPrincipal: tutor._id,
        fechaNacimiento: birth(13),
        passwordPlain: DEMO_PASSWORD,
    });

    const solo = await upsertUser(User, {
        email: 'demo.solo@finanzas.local',
        nombre: 'Martín',
        apellido: 'Demo Solo',
        rol: 'atleta',
        fechaNacimiento: birth(16),
        passwordPlain: DEMO_PASSWORD,
    });

    async function upsertEnrollment(atleta, categoria, plan, descuento = 0) {
        let enr = await Enrollment.findOne({ atleta: atleta._id, categoria: categoria._id });
        if (enr) {
            enr.plan = plan._id;
            enr.estado = 'activo';
            enr.descuentoPorcentaje = descuento;
            enr.motivoDescuento = descuento > 0 ? 'Demo — descuento familiar' : undefined;
            await enr.save();
            return enr;
        }
        return Enrollment.create({
            atleta: atleta._id,
            categoria: categoria._id,
            plan: plan._id,
            estado: 'activo',
            descuentoPorcentaje: descuento,
            motivoDescuento: descuento > 0 ? 'Demo — descuento familiar' : undefined,
            aptoMedico: true,
        });
    }

    await upsertEnrollment(hijo1, catFutbolSub15, planInfantil, 15);
    await upsertEnrollment(hijo2, catFutbolSub15, planInfantil, 15);
    await upsertEnrollment(solo, catFutbolPrimera, planPremium, 0);

    await setGlobalFamilyDiscountPct(models, 10);

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();
    let mesAnt = mes - 1;
    let anioAnt = anio;
    if (mesAnt < 1) {
        mesAnt = 12;
        anioAnt -= 1;
    }

    async function createPayment({ atleta, plan, categoria, mes: m, anio: y, estado, dueDay, withRecargo }) {
        const exists = await Payment.findOne({ atleta: atleta._id, plan: plan._id, mes: m, anio: y });
        if (exists) return exists;

        const valorCuota = plan.monto;
        const aid = String(atleta._id);
        const descuentoPct = aid === String(hijo1._id) || aid === String(hijo2._id) ? 15 : 0;
        const descuentoMonto = Math.round((valorCuota * descuentoPct) / 100);
        let montoFinal = valorCuota - descuentoMonto;

        const fechaVencimiento = new Date(y, m - 1, dueDay, 23, 59, 59);
        let recargoAplicado = 0;
        let porcentajeRecargo = 0;

        if (estado === 'vencido' && withRecargo && (plan.porcentajeRecargo || 0) > 0) {
            porcentajeRecargo = plan.porcentajeRecargo;
            recargoAplicado = Math.round((montoFinal * porcentajeRecargo) / 100);
            montoFinal += recargoAplicado;
        }

        return Payment.create({
            atleta: atleta._id,
            plan: plan._id,
            categoria: categoria._id,
            mes: m,
            anio: y,
            montoOriginal: valorCuota,
            descuentoAplicado: descuentoMonto,
            motivoDescuento: descuentoPct > 0 ? 'Demo — descuento familiar' : undefined,
            montoFinal,
            recargoAplicado,
            porcentajeRecargo,
            fechaVencimiento,
            estado,
            metodoPago: estado === 'pagado' ? 'efectivo' : 'efectivo',
            fechaPago: estado === 'pagado' ? new Date() : undefined,
            notasAdmin: 'Generado por seed:finanzas',
        });
    }

    // Mes actual: pendiente (vence fin de mes), vencida con recargo (venció día 1)
    await createPayment({
        atleta: hijo1,
        plan: planInfantil,
        categoria: catFutbolSub15,
        mes,
        anio,
        estado: 'pendiente',
        dueDay: 28,
        withRecargo: false,
    });

    await createPayment({
        atleta: hijo2,
        plan: planInfantil,
        categoria: catFutbolSub15,
        mes,
        anio,
        estado: 'vencido',
        dueDay: 1,
        withRecargo: true,
    });

    await createPayment({
        atleta: solo,
        plan: planPremium,
        categoria: catFutbolPrimera,
        mes,
        anio,
        estado: 'pendiente',
        dueDay: 15,
        withRecargo: false,
    });

    // Mes anterior: pagada + vencida sin pagar (premium con 15% recargo)
    await createPayment({
        atleta: solo,
        plan: planPremium,
        categoria: catFutbolPrimera,
        mes: mesAnt,
        anio: anioAnt,
        estado: 'pagado',
        dueDay: 10,
        withRecargo: false,
    });

    await createPayment({
        atleta: hijo1,
        plan: planInfantil,
        categoria: catFutbolSub15,
        mes: mesAnt,
        anio: anioAnt,
        estado: 'vencido',
        dueDay: 5,
        withRecargo: true,
    });

    // Cuota pendiente que pasará a vencida con recargo al consultar finanzas (ayer)
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const duePast = ayer.getDate();
    const pendingOverdue = await Payment.findOne({
        atleta: solo._id,
        plan: planEstandar._id,
        mes,
        anio,
        notasAdmin: 'Generado por seed:finanzas — auto-vence',
    });
    if (!pendingOverdue) {
        const montoBase = planEstandar.monto;
        await Payment.create({
            atleta: solo._id,
            plan: planEstandar._id,
            categoria: catBasquetU17._id,
            mes,
            anio,
            montoOriginal: montoBase,
            descuentoAplicado: 0,
            montoFinal: montoBase,
            fechaVencimiento: new Date(anio, mes - 1, Math.min(duePast, 28), 12, 0, 0),
            estado: 'pendiente',
            notasAdmin: 'Generado por seed:finanzas — auto-vence',
        });
    }

    const atletaIds = [hijo1._id, hijo2._id, solo._id];
    const marked = await markOverduePayments(models, { atleta: { $in: atletaIds } });

    return {
        plans: Object.keys(plans).length,
        disciplines: 2,
        categories: 3,
        tutorEmail: tutor.email,
        markedOverdue: marked,
        mes,
        anio,
    };
}

async function main() {
    console.log('🌱 Seed finanzas — inicio');
    const { db, identifier } = await resolveTenantConnection();
    const models = getTenantModels(db);
    console.log(`   Club / tenant: ${identifier}`);

    if (process.env.SEED_FORCE === 'true') {
        console.log('   SEED_FORCE=true → limpiando datos demo previos...');
        await cleanupDemoData(models);
    }

    const hasDemo = await models.Plan.findOne({ nombre: new RegExp(`^${DEMO_PREFIX}`) });
    if (hasDemo && process.env.SEED_FORCE !== 'true') {
        console.log('   Ya existen planes Demo. Usá SEED_FORCE=true para regenerar.');
        const marked = await markOverduePayments(models);
        console.log(`   Cuotas marcadas vencidas ahora: ${marked}`);
        process.exit(0);
    }

    const summary = await seedFinanzasExamples(models);
    console.log('✅ Seed finanzas completado:');
    console.log(`   Planes: ${summary.plans}`);
    console.log(`   Disciplinas/categorías demo: ${summary.disciplines} / ${summary.categories}`);
    console.log(`   Tutor: ${summary.tutorEmail} / contraseña: ${DEMO_PASSWORD}`);
    console.log(`   Hermanos: demo.hijo1@ / demo.hijo2@ (${DEMO_PASSWORD})`);
    console.log(`   Atleta solo: demo.solo@ (${DEMO_PASSWORD})`);
    console.log(`   Descuento global familiar: 10% | tutor demo: 15%`);
    console.log(`   Período principal: ${summary.mes}/${summary.anio}`);
    console.log(`   Cuotas pasadas a vencido con recargo: ${summary.markedOverdue}`);
    console.log('\n   En la app: Finanzas → Planes / Familias / Atletas (filtro Vencidos o Pendientes).');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Seed finanzas falló:', err.response?.data?.message || err.message);
    process.exit(1);
});
