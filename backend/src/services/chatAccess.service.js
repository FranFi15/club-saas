import { hijosDelTutorFilter } from '../utils/userQuery.js';

export const ADMIN_ROLES = new Set(['admin_club', 'administrativo']);
export const STAFF_ROLES = new Set(['profe', 'preparador_fisico', 'nutricionista', 'psicologo']);
/** Personal operativo (no atleta/tutor): chat entre sí y con cuerpo técnico. */
export const OPS_CHAT_ROLES = new Set(['control_ingreso', 'colaborador']);
/** Socios: solo pagan cuota social, chatean con administración y personal operativo. */
export const SOCIO_CHAT_PEER_ROLES = new Set([...ADMIN_ROLES, ...OPS_CHAT_ROLES]);

const OPS_NETWORK_ROLES = new Set([...OPS_CHAT_ROLES, ...STAFF_ROLES]);

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

/** Categorías del staff donde está habilitado chat atleta↔profesional. */
async function enabledStaffCategoryIds(models, staffUser) {
    const { Category } = models;
    const cats = await Category.find({
        ...staffCategoriesQuery(staffUser.rol, staffUser._id),
        chatAtletaProfesionalEnabled: true,
    })
        .select('_id')
        .lean();
    return cats.map((c) => c._id);
}

async function athleteIdsForStaffInEnabledCategories(models, staffUser) {
    const { Enrollment } = models;
    const catIds = await enabledStaffCategoryIds(models, staffUser);
    if (!catIds.length) return [];
    return Enrollment.find({
        categoria: { $in: catIds },
        estado: 'activo',
    }).distinct('atleta');
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

/** Atleta ↔ staff solo si comparten al menos una categoría con el switch activo. */
async function canAthleteChatWithStaff(models, atleta, staff) {
    const { Category, Enrollment } = models;
    const catIds = await categoryIdsForAthlete(Enrollment, atleta._id);
    if (!catIds.length) return false;
    const field = staffFieldForRol(staff.rol);
    const linked = await Category.exists({
        _id: { $in: catIds },
        [field]: staff._id,
        chatAtletaProfesionalEnabled: true,
    });
    return Boolean(linked);
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

    // Control ingreso / colaborador ↔ entre sí y con cuerpo técnico (no abre staff↔staff)
    if (OPS_CHAT_ROLES.has(rolA) && OPS_NETWORK_ROLES.has(rolB)) return true;
    if (OPS_CHAT_ROLES.has(rolB) && OPS_NETWORK_ROLES.has(rolA)) return true;

    // Socio ↔ administración y personal operativo (admins ya cubiertos arriba)
    if (rolA === 'socio') return SOCIO_CHAT_PEER_ROLES.has(rolB);
    if (rolB === 'socio') return SOCIO_CHAT_PEER_ROLES.has(rolA);

    // Tutor <-> staff vinculado a sus atletas (siempre; no depende del switch)
    if (rolA === 'tutor' && STAFF_ROLES.has(rolB)) {
        const staff = await staffIdsForTutor(models, userA._id);
        return staff.has(idStr(userB));
    }
    if (rolB === 'tutor' && STAFF_ROLES.has(rolA)) {
        const staff = await staffIdsForTutor(models, userB._id);
        return staff.has(idStr(userA));
    }

    const athletePro =
        (rolA === 'atleta' && STAFF_ROLES.has(rolB)) || (rolB === 'atleta' && STAFF_ROLES.has(rolA));
    if (athletePro) {
        const atleta = rolA === 'atleta' ? userA : userB;
        const staff = rolA === 'atleta' ? userB : userA;
        return canAthleteChatWithStaff(models, atleta, staff);
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

async function listOpsNetworkPeers(User, user) {
    return User.find({
        estado: 'activo',
        _id: { $ne: user._id },
        rol: { $in: [...OPS_NETWORK_ROLES] },
    })
        .select(USER_SELECT)
        .lean();
}

async function listOpsOnlyPeers(User, user) {
    return User.find({
        estado: 'activo',
        _id: { $ne: user._id },
        rol: { $in: [...OPS_CHAT_ROLES] },
    })
        .select(USER_SELECT)
        .lean();
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
                    'control_ingreso',
                    'colaborador',
                    'profe',
                    'preparador_fisico',
                    'nutricionista',
                    'psicologo',
                    'atleta',
                    'tutor',
                    'socio',
                ],
            },
        })
            .select(USER_SELECT)
            .lean();
        addMany(everyone);
        return [...out.values()].sort(sortByName);
    }

    if (OPS_CHAT_ROLES.has(user.rol)) {
        addMany(await listOpsNetworkPeers(User, user));
        addMany(
            await User.find({ rol: 'socio', estado: 'activo' })
                .select(USER_SELECT)
                .lean(),
        );
        return [...out.values()].sort(sortByName);
    }

    // Socio: administración (ya agregada) + personal operativo
    if (user.rol === 'socio') {
        addMany(await listOpsOnlyPeers(User, user));
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
        // Control de ingreso / colaboradores
        addMany(await listOpsOnlyPeers(User, user));

        // Tutores de atletas del staff (todas sus categorías)
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
        }

        // Atletas solo de categorías con chat habilitado
        const enabledAthleteIds = await athleteIdsForStaffInEnabledCategories(models, user);
        if (enabledAthleteIds.length) {
            const atletasChat = await User.find({
                _id: { $in: enabledAthleteIds },
                rol: 'atleta',
                estado: 'activo',
            })
                .select(USER_SELECT)
                .lean();
            addMany(atletasChat);
        }
        return [...out.values()].sort(sortByName);
    }

    if (user.rol === 'atleta') {
        const { Enrollment, Category } = models;
        const catIds = await categoryIdsForAthlete(Enrollment, user._id);
        if (catIds.length) {
            const enabledCatIds = await Category.find({
                _id: { $in: catIds },
                chatAtletaProfesionalEnabled: true,
            }).distinct('_id');
            const staffIds = await staffIdsForCategories(Category, enabledCatIds);
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
