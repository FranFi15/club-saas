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
        socios,
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
        User.countDocuments({ rol: 'socio', estado: 'activo' }),
        Discipline.find({ estado: 'activa' }).select('_id nombre').lean(),
        Category.find().select('_id nombre disciplina').lean(),
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
            const [cuotasMes, vencidosEntrenamiento, vencidosSocial] = await Promise.all([
                Payment.find({ mes, anio }).select('estado montoFinal tipo atleta').lean(),
                Payment.countDocuments({
                    estado: 'vencido',
                    $or: [{ tipo: 'entrenamiento' }, { tipo: { $exists: false } }, { tipo: null }],
                }),
                Payment.countDocuments({ estado: 'vencido', tipo: 'social' }),
            ]);

            const emptyBucket = () => ({
                pendiente: 0,
                vencido: 0,
                pagado: 0,
                facturado: 0,
                cobrado: 0,
                porcentajeCobranza: 0,
            });

            const entrenamiento = emptyBucket();
            const social = emptyBucket();
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

            for (const bucket of [entrenamiento, social]) {
                bucket.porcentajeCobranza =
                    bucket.facturado > 0
                        ? Math.round((bucket.cobrado / bucket.facturado) * 100)
                        : 0;
            }

            const porRol = { atleta: 0, tutor: 0, socio: 0, otro: 0 };
            if (socialTitularIds.size > 0) {
                const titulares = await User.find({ _id: { $in: [...socialTitularIds] } })
                    .select('rol')
                    .lean();
                const rolById = new Map(titulares.map((u) => [idStr(u._id), u.rol]));
                for (const p of cuotasMes) {
                    if (p.tipo !== 'social' || !p.atleta) continue;
                    const rol = rolById.get(idStr(p.atleta));
                    if (rol === 'atleta' || rol === 'tutor' || rol === 'socio') porRol[rol] += 1;
                    else porRol.otro += 1;
                }
            }

            return {
                mes,
                anio,
                finanzas: {
                    ...entrenamiento,
                    vencidosGlobal: vencidosEntrenamiento,
                },
                cuotasSociales: {
                    ...social,
                    vencidosGlobal: vencidosSocial,
                    porRol,
                    totalMes: social.pendiente + social.vencido + social.pagado,
                },
            };
        })(),
    ]);

    const athleteIds = new Set(activeAthletes.map((a) => idStr(a._id)));
    const catById = new Map(categories.map((c) => [idStr(c._id), c]));

    /** disciplinaId -> Set(athleteId) */
    const athletesByDisc = new Map();
    /** categoriaId -> Set(athleteId) */
    const athletesByCat = new Map();
    for (const d of disciplines) {
        athletesByDisc.set(idStr(d._id), new Set());
    }
    for (const c of categories) {
        athletesByCat.set(idStr(c._id), new Set());
    }

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
    const { finanzas, cuotasSociales, mes, anio } = financeBundle;

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
        finanzas: { ...finanzas, mes, anio },
        cuotasSociales: { ...cuotasSociales, mes, anio },
    };
}
