import { calcEdad } from '../utils/ageHelper.js';
import { getAdminPendingCounts } from './pendingInbox.service.js';
import { calendarMonthYearInTz, DEFAULT_CLUB_TIMEZONE } from '../utils/timeHelper.js';

const STAFF_ROLES = ['profe', 'preparador_fisico', 'nutricionista', 'psicologo'];
const GESTION_ROLES = ['admin_club', 'administrativo', 'control_ingreso'];

function ageBand(edad) {
    if (edad === null || edad === undefined) return 'sinFecha';
    if (edad <= 10) return 'lte10';
    if (edad >= 11 && edad <= 18) return String(edad);
    return 'gte19';
}

function idStr(v) {
    return String(v?._id || v);
}

function emptyFinanceBucket() {
    return {
        pendiente: 0,
        vencido: 0,
        pagado: 0,
        facturado: 0,
        cobrado: 0,
        porcentajeCobranza: 0,
    };
}

function finishCobranza(bucket) {
    bucket.porcentajeCobranza =
        bucket.facturado > 0 ? Math.round((bucket.cobrado / bucket.facturado) * 100) : 0;
}

/**
 * Snapshot demográfico + operaciones + finanzas para admin / administrativo.
 * Una pasada de User + pocas lecturas en paralelo (evita N countDocuments por rol).
 */
export async function buildClubStats(models, adminUserId, timezone = DEFAULT_CLUB_TIMEZONE) {
    const { User, Enrollment, Category, Discipline, Payment } = models;
    const { mes, anio } = calendarMonthYearInTz(new Date(), timezone);
    const [
        activeUsers,
        disciplines,
        categories,
        enrollments,
        operaciones,
        cuotasMes,
        vencidosByTipo,
    ] = await Promise.all([
        User.find({ estado: 'activo' }).select('_id rol sexo fechaNacimiento').lean(),
        Discipline.find({ estado: 'activa' }).select('_id nombre').lean(),
        Category.find().select('_id nombre disciplina').lean(),
        Enrollment.find({ estado: 'activo' }).select('atleta categoria').lean(),
        getAdminPendingCounts(models, adminUserId, timezone),
        Payment.find({ mes, anio }).select('estado montoFinal tipo atleta').lean(),
        Payment.aggregate([
            { $match: { estado: 'vencido' } },
            {
                $group: {
                    _id: {
                        $cond: [{ $eq: ['$tipo', 'social'] }, 'social', 'entrenamiento'],
                    },
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const roleCount = Object.create(null);
    const activeAthletes = [];
    const rolById = new Map();

    for (const u of activeUsers) {
        const id = idStr(u._id);
        rolById.set(id, u.rol);
        roleCount[u.rol] = (roleCount[u.rol] || 0) + 1;
        if (u.rol === 'atleta') activeAthletes.push(u);
    }

    const staffCounts = STAFF_ROLES.map((rol) => ({ rol, count: roleCount[rol] || 0 }));
    const gestionCounts = GESTION_ROLES.map((rol) => ({ rol, count: roleCount[rol] || 0 }));
    const tutors = roleCount.tutor || 0;
    const socios = roleCount.socio || 0;

    const entrenamiento = emptyFinanceBucket();
    const social = emptyFinanceBucket();
    const socialTitularIds = new Set();

    for (const p of cuotasMes) {
        const isSocial = p.tipo === 'social';
        const bucket = isSocial ? social : entrenamiento;
        const m = Number(p.montoFinal) || 0;
        bucket.facturado += m;
        if (p.estado === 'pendiente') bucket.pendiente += 1;
        else if (p.estado === 'vencido') bucket.vencido += 1;
        else if (p.estado === 'pagado') {
            bucket.pagado += 1;
            bucket.cobrado += m;
        } else if (p.estado === 'en_revision') {
            bucket.pendiente += 1;
        }
        if (isSocial && p.atleta) socialTitularIds.add(idStr(p.atleta));
    }
    finishCobranza(entrenamiento);
    finishCobranza(social);

    const missingTitulares = [...socialTitularIds].filter((id) => !rolById.has(id));
    if (missingTitulares.length > 0) {
        const extras = await User.find({ _id: { $in: missingTitulares } })
            .select('rol')
            .lean();
        for (const u of extras) rolById.set(idStr(u._id), u.rol);
    }

    const porRol = { atleta: 0, tutor: 0, socio: 0, otro: 0 };
    for (const p of cuotasMes) {
        if (p.tipo !== 'social' || !p.atleta) continue;
        const rol = rolById.get(idStr(p.atleta));
        if (rol === 'atleta' || rol === 'tutor' || rol === 'socio') porRol[rol] += 1;
        else porRol.otro += 1;
    }

    let vencidosEntrenamiento = 0;
    let vencidosSocial = 0;
    for (const row of vencidosByTipo) {
        if (row._id === 'social') vencidosSocial = row.count;
        else vencidosEntrenamiento = row.count;
    }

    const athleteIds = new Set(activeAthletes.map((a) => idStr(a._id)));
    const catById = new Map(categories.map((c) => [idStr(c._id), c]));

    const athletesByDisc = new Map();
    const athletesByCat = new Map();
    for (const d of disciplines) athletesByDisc.set(idStr(d._id), new Set());
    for (const c of categories) athletesByCat.set(idStr(c._id), new Set());

    const athletesWithEnrollment = new Set();
    for (const en of enrollments) {
        const aid = idStr(en.atleta);
        if (!athleteIds.has(aid)) continue;
        athletesWithEnrollment.add(aid);
        const catId = idStr(en.categoria);
        const cat = catById.get(catId);
        if (!cat?.disciplina) continue;
        const did = idStr(cat.disciplina);
        if (athletesByCat.has(catId)) athletesByCat.get(catId).add(aid);
        if (!athletesByDisc.has(did)) continue;
        athletesByDisc.get(did).add(aid);
    }

    const porDisciplina = disciplines
        .map((d) => {
            const did = idStr(d._id);
            const categorias = categories
                .filter((c) => idStr(c.disciplina) === did)
                .map((c) => ({
                    _id: c._id,
                    nombre: c.nombre,
                    atletas: athletesByCat.get(idStr(c._id))?.size || 0,
                }))
                .sort(
                    (a, b) =>
                        b.atletas - a.atletas ||
                        String(a.nombre).localeCompare(String(b.nombre), 'es'),
                );
            return {
                _id: d._id,
                nombre: d.nombre,
                atletas: athletesByDisc.get(did)?.size || 0,
                categorias,
            };
        })
        .sort(
            (a, b) =>
                b.atletas - a.atletas ||
                String(a.nombre).localeCompare(String(b.nombre), 'es'),
        );

    const sexo = { M: 0, F: 0, sinDato: 0 };
    const edad = {
        lte10: 0,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        gte19: 0,
        sinFecha: 0,
    };

    for (const a of activeAthletes) {
        if (a.sexo === 'M') sexo.M += 1;
        else if (a.sexo === 'F') sexo.F += 1;
        else sexo.sinDato += 1;

        const band = ageBand(calcEdad(a.fechaNacimiento));
        if (Object.prototype.hasOwnProperty.call(edad, band)) edad[band] += 1;
        else edad.sinFecha += 1;
    }

    const staffTotal = staffCounts.reduce((s, r) => s + r.count, 0);
    const gestionTotal = gestionCounts.reduce((s, r) => s + r.count, 0);

    return {
        resumen: {
            atletas: activeAthletes.length,
            atletasSinInscripcion: activeAthletes.length - athletesWithEnrollment.size,
            tutores: tutors,
            socios,
            profesionales: staffTotal,
            gestion: gestionTotal,
            disciplinas: disciplines.length,
            categorias: categories.length,
        },
        porDisciplina,
        sexo,
        edad,
        profesionales: staffCounts,
        gestion: gestionCounts,
        socios: { total: socios },
        operaciones,
        finanzas: {
            ...entrenamiento,
            vencidosGlobal: vencidosEntrenamiento,
            mes,
            anio,
        },
        cuotasSociales: {
            ...social,
            vencidosGlobal: vencidosSocial,
            porRol,
            totalMes: social.pendiente + social.vencido + social.pagado,
            mes,
            anio,
        },
    };
}
