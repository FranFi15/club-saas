import { getOrCreateClubSettings } from './familyDiscount.service.js';
import { hijosDelTutorFilter } from '../utils/userQuery.js';

export const ADMIN_ROLES = new Set(['admin_club', 'administrativo']);
export const STAFF_ROLES = new Set(['profe', 'preparador_fisico', 'nutricionista', 'psicologo']);

const USER_SELECT = 'nombre apellido email rol fotoPerfil estado';

function idStr(v) {
    return String(v?._id || v);
}

export function makePairKey(a, b) {
    const x = idStr(a);
    const y = idStr(b);
    return x < y ? `${x}:${y}` : `${y}:${x}`;
}

function staffFieldForRol(rol) {
    if (rol === 'preparador_fisico') return 'preparadoresFisicos';
    if (rol === 'nutricionista') return 'nutricionistas';
    if (rol === 'psicologo') return 'psicologos';
    return 'profesores';
}

function staffCategoriesQuery(rol, userId) {
    return { [staffFieldForRol(rol)]: userId };
}

export async function isChatAtletaProfesionalEnabled(models) {
    const { ClubSettings } = models;
    const doc = await getOrCreateClubSettings(ClubSettings);
    return Boolean(doc.chatAtletaProfesionalEnabled);
}

async function categoryIdsForAthlete(Enrollment, atletaId) {
    return Enrollment.find({ atleta: atletaId, estado: 'activo' }).distinct('categoria');
}

async function staffIdsForCategories(Category, catIds) {
    if (!catIds?.length) return new Set();
    const cats = await Category.find({ _id: { $in: catIds } })
        .select('profesores preparadoresFisicos nutricionistas psicologos')
        .lean();
    const ids = new Set();
    for (const c of cats) {
        for (const field of ['profesores', 'preparadoresFisicos', 'nutricionistas', 'psicologos']) {
            for (const p of c[field] || []) ids.add(idStr(p));
        }
    }
    return ids;
}

async function athleteIdsForStaff(models, staffUser) {
    const { Category, Enrollment } = models;
    const cats = await Category.find(staffCategoriesQuery(staffUser.rol, staffUser._id))
        .select('_id')
        .lean();
    if (!cats.length) return [];
    return Enrollment.find({
        categoria: { $in: cats.map((c) => c._id) },
        estado: 'activo',
    }).distinct('atleta');
}

async function staffIdsForTutor(models, tutorId) {
    const { User, Enrollment, Category } = models;
    const hijos = await User.find(hijosDelTutorFilter(tutorId)).select('_id').lean();
    if (!hijos.length) return new Set();
    const catIds = await Enrollment.find({
        atleta: { $in: hijos.map((h) => h._id) },
        estado: 'activo',
    }).distinct('categoria');
    return staffIdsForCategories(Category, catIds);
}

/** ¿Pueden A y B chatear entre sí? */
export async function canChat(models, userA, userB) {
    if (!userA?._id || !userB?._id) return false;
    if (idStr(userA) === idStr(userB)) return false;
    if (userA.estado && userA.estado !== 'activo') return false;
    if (userB.estado && userB.estado !== 'activo') return false;

    const rolA = userA.rol;
    const rolB = userB.rol;

    if (ADMIN_ROLES.has(rolA) || ADMIN_ROLES.has(rolB)) return true;

    const { Category, Enrollment } = models;

    // Tutor <-> staff vinculado a sus atletas
    if (rolA === 'tutor' && STAFF_ROLES.has(rolB)) {
        const staff = await staffIdsForTutor(models, userA._id);
        return staff.has(idStr(userB));
    }
    if (rolB === 'tutor' && STAFF_ROLES.has(rolA)) {
        const staff = await staffIdsForTutor(models, userB._id);
        return staff.has(idStr(userA));
    }

    // Atleta <-> profesional (misma categoría) si el flag está activo
    const athletePro =
        (rolA === 'atleta' && STAFF_ROLES.has(rolB)) || (rolB === 'atleta' && STAFF_ROLES.has(rolA));
    if (athletePro) {
        const enabled = await isChatAtletaProfesionalEnabled(models);
        if (!enabled) return false;
        const atleta = rolA === 'atleta' ? userA : userB;
        const staff = rolA === 'atleta' ? userB : userA;
        const catIds = await categoryIdsForAthlete(Enrollment, atleta._id);
        if (!catIds.length) return false;
        const field = staffFieldForRol(staff.rol);
        const linked = await Category.exists({
            _id: { $in: catIds },
            [field]: staff._id,
        });
        return Boolean(linked);
    }

    return false;
}

function userLabel(u) {
    return {
        _id: u._id,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email,
        rol: u.rol,
        fotoPerfil: u.fotoPerfil,
    };
}

/** Destinatarios con los que el usuario puede iniciar un chat. */
export async function listEligibleRecipients(models, user) {
    const { User } = models;
    const me = idStr(user);
    const out = new Map();

    const addMany = (rows) => {
        for (const u of rows || []) {
            if (!u?._id || idStr(u) === me) continue;
            if (u.estado && u.estado !== 'activo') continue;
            out.set(idStr(u), userLabel(u));
        }
    };

    // Siempre: admins del club
    const admins = await User.find({
        rol: { $in: [...ADMIN_ROLES] },
        estado: 'activo',
        _id: { $ne: user._id },
    })
        .select(USER_SELECT)
        .lean();
    addMany(admins);

    if (ADMIN_ROLES.has(user.rol)) {
        const everyone = await User.find({
            estado: 'activo',
            _id: { $ne: user._id },
            rol: {
                $in: [
                    'admin_club',
                    'administrativo',
                    'profe',
                    'preparador_fisico',
                    'nutricionista',
                    'psicologo',
                    'atleta',
                    'tutor',
                ],
            },
        })
            .select(USER_SELECT)
            .lean();
        addMany(everyone);
        return [...out.values()].sort(sortByName);
    }

    if (user.rol === 'tutor') {
        const staffIds = await staffIdsForTutor(models, user._id);
        if (staffIds.size) {
            const staff = await User.find({
                _id: { $in: [...staffIds] },
                estado: 'activo',
            })
                .select(USER_SELECT)
                .lean();
            addMany(staff);
        }
        return [...out.values()].sort(sortByName);
    }

    if (STAFF_ROLES.has(user.rol)) {
        // Tutores de atletas del staff
        const athleteIds = await athleteIdsForStaff(models, user);
        if (athleteIds.length) {
            const atletas = await User.find({
                _id: { $in: athleteIds },
                rol: 'atleta',
                estado: 'activo',
            })
                .select(`${USER_SELECT} tutorPrincipal`)
                .lean();

            const tutorIds = [
                ...new Set(
                    atletas.map((a) => (a.tutorPrincipal ? idStr(a.tutorPrincipal) : null)).filter(Boolean),
                ),
            ];
            if (tutorIds.length) {
                const tutores = await User.find({
                    _id: { $in: tutorIds },
                    estado: 'activo',
                })
                    .select(USER_SELECT)
                    .lean();
                addMany(tutores);
            }

            if (await isChatAtletaProfesionalEnabled(models)) {
                addMany(atletas);
            }
        }
        return [...out.values()].sort(sortByName);
    }

    if (user.rol === 'atleta') {
        if (await isChatAtletaProfesionalEnabled(models)) {
            const { Enrollment, Category } = models;
            const catIds = await categoryIdsForAthlete(Enrollment, user._id);
            const staffIds = await staffIdsForCategories(Category, catIds);
            if (staffIds.size) {
                const staff = await User.find({
                    _id: { $in: [...staffIds] },
                    estado: 'activo',
                })
                    .select(USER_SELECT)
                    .lean();
                addMany(staff);
            }
        }
        return [...out.values()].sort(sortByName);
    }

    return [...out.values()].sort(sortByName);
}

function sortByName(a, b) {
    const an = `${a.apellido || ''} ${a.nombre || ''}`.trim().toLowerCase();
    const bn = `${b.apellido || ''} ${b.nombre || ''}`.trim().toLowerCase();
    return an.localeCompare(bn, 'es');
}
