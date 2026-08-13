import { calcEdad } from '../utils/ageHelper.js';
import { getAdminPendingCounts } from './pendingInbox.service.js';

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

/**
 * Snapshot demográfico + operaciones + finanzas para admin / administrativo.
 */
export async function buildClubStats(models, adminUserId) {
    const { User, Enrollment, Category, Discipline, Payment } = models;

    const [
        activeAthletes,
        tutors,
        disciplines,
        categories,
        enrollments,
        staffCounts,
        gestionCounts,
        operaciones,
        financeBundle,
    ] = await Promise.all([
        User.find({ rol: 'atleta', estado: 'activo' })
            .select('_id sexo fechaNacimiento')
            .lean(),
        User.countDocuments({ rol: 'tutor', estado: 'activo' }),
        Discipline.find({ estado: 'activa' }).select('_id nombre').lean(),
        Category.find().select('_id disciplina').lean(),
        Enrollment.find({ estado: 'activo' }).select('atleta categoria').lean(),
        Promise.all(
            STAFF_ROLES.map(async (rol) => ({
                rol,
                count: await User.countDocuments({ rol, estado: 'activo' }),
            })),
        ),
        Promise.all(
            GESTION_ROLES.map(async (rol) => ({
                rol,
                count: await User.countDocuments({ rol, estado: 'activo' }),
            })),
        ),
        getAdminPendingCounts(models, adminUserId),
        (async () => {
            const now = new Date();
            const mes = now.getMonth() + 1;
            const anio = now.getFullYear();
            const [cuotasMes, vencidosGlobal] = await Promise.all([
                Payment.find({ mes, anio }).select('estado montoFinal').lean(),
                Payment.countDocuments({ estado: 'vencido' }),
            ]);
            let pendiente = 0;
            let vencido = 0;
            let pagado = 0;
            let facturado = 0;
            let cobrado = 0;
            for (const p of cuotasMes) {
                const m = Number(p.montoFinal) || 0;
                facturado += m;
                if (p.estado === 'pendiente') pendiente += 1;
                else if (p.estado === 'vencido') vencido += 1;
                else if (p.estado === 'pagado') {
                    pagado += 1;
                    cobrado += m;
                }
            }
            const porcentajeCobranza =
                facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;
            return {
                mes,
                anio,
                pendiente,
                vencido,
                pagado,
                facturado,
                cobrado,
                porcentajeCobranza,
                vencidosGlobal,
            };
        })(),
    ]);

    const athleteIds = new Set(activeAthletes.map((a) => idStr(a._id)));
    const catById = new Map(categories.map((c) => [idStr(c._id), c]));
    const discById = new Map(disciplines.map((d) => [idStr(d._id), d]));

    /** disciplinaId -> Set(athleteId) */
    const athletesByDisc = new Map();
    for (const d of disciplines) {
        athletesByDisc.set(idStr(d._id), new Set());
    }

    const athletesWithEnrollment = new Set();
    for (const en of enrollments) {
        const aid = idStr(en.atleta);
        if (!athleteIds.has(aid)) continue;
        athletesWithEnrollment.add(aid);
        const cat = catById.get(idStr(en.categoria));
        if (!cat?.disciplina) continue;
        const did = idStr(cat.disciplina);
        if (!athletesByDisc.has(did)) continue;
        athletesByDisc.get(did).add(aid);
    }

    const porDisciplina = disciplines
        .map((d) => ({
            _id: d._id,
            nombre: d.nombre,
            atletas: athletesByDisc.get(idStr(d._id))?.size || 0,
        }))
        .sort((a, b) => b.atletas - a.atletas || String(a.nombre).localeCompare(String(b.nombre)));

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
        operaciones,
        finanzas: financeBundle,
    };
}
