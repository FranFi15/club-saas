import asyncHandler from 'express-async-handler';
import { calcEdad, puedePagarComoAtleta, atletaCuotasEnApp } from '../utils/ageHelper.js';
import { atletasDeTutoresFilter, hijosDelTutorFilter } from '../utils/userQuery.js';
import { syncFamilyDiscountForAthlete } from '../services/familyDiscount.service.js';
import {
    countDocsPendientesByAthleteIds,
    tutorAthletesAlertFlags,
} from '../services/badgeCounts.service.js';
import {
    isAssignableUserRole,
    canAssignUserRole,
    CLIENT_USER_ROLES,
    resolveRolesWrite,
    normalizeUserRoles,
    roleQuery,
} from '../constants/userRoles.js';
import { ensureCurrentMonthSocialFeeForUser, resolveUserSocialFeeAssignment } from '../services/generateSocialFees.service.js';
import { syncAthleteCountToSuper } from '../services/athleteQuota.service.js';
import { registerUserPushToken, unregisterUserPushToken } from '../services/pushNotification.service.js';
import { syncStaffGroupChatSafe } from '../services/staffGroupChat.service.js';
import { PAYROLL_STAFF_ROLES } from '../models/payroll.model.js';
import { userNameCollation, userNameMongoSort } from '../utils/listSort.js';
import { parsePageLimit } from '../utils/pagination.js';
import {
    parseTrialCreateFields,
    convertTrialAthleteToPermanent,
    leaveTrialAthlete,
    ensureTrialExpiryProcessed,
    athleteHasDecisionTutor,
    trialNeedsMemberDecision,
} from '../services/trialAthlete.service.js';
import { resolveAthleteEmail, isAthleteInternalEmail } from '../utils/athleteLoginEmail.js';
import { getOpenPaymentsSummary, forgiveOpenPayments } from '../services/userPaymentsStatus.service.js';

function parseSueldoNomina(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
        const err = new Error('Sueldo de nómina inválido.');
        err.statusCode = 400;
        throw err;
    }
    return Math.round(n * 100) / 100;
}

/** Campos de nómina: atletas (jugador pago) o personal del club. */
function parsePayrollFields(body, rol) {
    const isAthlete = rol === 'atleta';
    const isStaff = PAYROLL_STAFF_ROLES.includes(rol);

    if (!isAthlete && !isStaff) {
        return { enNomina: false, sueldoNomina: 0, clear: true };
    }

    const sueldoNomina = parseSueldoNomina(body.sueldoNomina);

    if (isAthlete) {
        const enNomina =
            body.enNomina === true || body.enNomina === 'true'
                ? true
                : body.enNomina === false || body.enNomina === 'false'
                  ? false
                  : undefined;
        return {
            enNomina,
            sueldoNomina,
            clear: false,
        };
    }

    // Staff: siempre elegible por rol; solo guarda sueldo de referencia.
    return {
        enNomina: false,
        sueldoNomina,
        clear: false,
    };
}

const registerUser = asyncHandler(async (req, res) => {
    const {
        nombre,
        apellido,
        dni,
        email,
        password,
        rol,
        roles: rolesBody,
        fotoPerfil,
        tutorPrincipal,
        fechaNacimiento,
        cuotasEnApp,
        sexo,
        exentoCuotaSocial,
        cuotaSocialAsignada,
        esPrueba,
        diasPrueba,
        enNomina,
        sueldoNomina,
    } = req.body;

    const { User } = req.models;

    let resolved;
    try {
        resolved = resolveRolesWrite(rolesBody, rol);
    } catch (e) {
        res.status(400);
        throw e;
    }
    const { rol: primaryRol, roles } = resolved;

    for (const r of roles) {
        if (!isAssignableUserRole(r)) {
            res.status(400);
            throw new Error('Ese rol no está disponible en esta versión de la app.');
        }
        if (req.user && !canAssignUserRole(req.user.rol, r)) {
            res.status(403);
            throw new Error('Solo el administrador del club puede crear ese tipo de cuenta.');
        }
    }

    const hasAtleta = roles.includes('atleta');
    const clientRol = roles.find((r) => CLIENT_USER_ROLES.includes(r));
    const staffPayrollRol = roles.find((r) => PAYROLL_STAFF_ROLES.includes(r));
    const payrollRol = hasAtleta ? 'atleta' : staffPayrollRol || primaryRol;

    const emailRaw = String(email || '').trim();
    if (!emailRaw && !hasAtleta) {
        res.status(400);
        throw new Error('El email es obligatorio para este tipo de cuenta.');
    }

    let emailResolved;
    try {
        if (hasAtleta) {
            emailResolved = await resolveAthleteEmail(User, {
                email: emailRaw,
                nombre,
                apellido,
                clubIdentifier: req.clubIdentifier,
            });
        } else {
            emailResolved = {
                email: emailRaw.toLowerCase(),
                generated: false,
                loginHint: emailRaw.toLowerCase(),
            };
        }
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const userExists = await User.findOne({ email: emailResolved.email });

    if (userExists) {
        res.status(400);
        throw new Error('El usuario ya existe en este club.');
    }

    let trialFields;
    try {
        trialFields = parseTrialCreateFields({ esPrueba, diasPrueba, rol: hasAtleta ? 'atleta' : primaryRol });
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    let socialAssignment = { exentoCuotaSocial: false, cuotaSocialAsignada: null };
    if (clientRol && !trialFields.esPrueba) {
        try {
            socialAssignment = await resolveUserSocialFeeAssignment(req.models, {
                rol: clientRol,
                exentoCuotaSocial,
                cuotaSocialAsignada,
            });
        } catch (e) {
            res.status(e.statusCode || 400);
            throw e;
        }
    }

    let payrollFields;
    try {
        payrollFields = parsePayrollFields({ enNomina, sueldoNomina }, payrollRol);
    } catch (e) {
        res.status(e.statusCode || 400);
        throw e;
    }

    const user = await User.create({
        nombre,
        apellido,
        dni,
        email: emailResolved.email,
        password,
        rol: primaryRol,
        roles,
        tutorPrincipal: tutorPrincipal || undefined,
        fotoPerfil: fotoPerfil || '',
        fechaNacimiento: fechaNacimiento || undefined,
        cuotasEnApp: hasAtleta ? cuotasEnApp !== false : undefined,
        sexo: hasAtleta && (sexo === 'M' || sexo === 'F') ? sexo : '',
        exentoCuotaSocial: trialFields.esPrueba ? true : socialAssignment.exentoCuotaSocial,
        cuotaSocialAsignada: trialFields.esPrueba ? undefined : socialAssignment.cuotaSocialAsignada || undefined,
        esPrueba: trialFields.esPrueba,
        pruebaHasta: trialFields.pruebaHasta || undefined,
        pruebaAvisoEnviadoAt: trialFields.pruebaAvisoEnviadoAt || undefined,
        pruebaDecision: trialFields.pruebaDecision || undefined,
        enNomina: hasAtleta ? payrollFields.enNomina === true : false,
        sueldoNomina: (() => {
            if (hasAtleta) {
                return payrollFields.enNomina === true ? payrollFields.sueldoNomina ?? 0 : 0;
            }
            if (staffPayrollRol) {
                return payrollFields.sueldoNomina ?? 0;
            }
            return 0;
        })(),
    });

    if (user) {
        if (hasAtleta && user.tutorPrincipal && !user.esPrueba) {
            try {
                await syncFamilyDiscountForAthlete(req.models, user._id);
            } catch (e) {
                console.log('Descuento familiar al crear atleta:', e.message);
            }
        }

        res.status(201).json({
            _id: user._id,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.email,
            loginHint: emailResolved.loginHint,
            emailGenerado: emailResolved.generated,
            rol: user.rol,
            roles: normalizeUserRoles(user),
            fotoPerfil: user.fotoPerfil,
            esPrueba: user.esPrueba,
            pruebaHasta: user.pruebaHasta,
            message: emailResolved.generated
                ? `Usuario creado. Sin email: puede entrar con el usuario "${emailResolved.loginHint}".`
                : 'Usuario creado exitosamente.'
        });

        if (roles.includes('atleta') || roles.includes('socio')) {
            await syncAthleteCountToSuper(req.models, req.clubIdentifier);
        }

        if (roles.some((r) => PAYROLL_STAFF_ROLES.includes(r))) {
            await syncStaffGroupChatSafe(req.models);
        }

        // Alta a mitad de mes: no esperar al cron del día 1 para la cuota social.
        if (clientRol && !user.esPrueba) {
            try {
                await ensureCurrentMonthSocialFeeForUser(req.models, user, req.clubTimezone);
            } catch (e) {
                console.log('Cuota social al crear usuario:', e.message);
            }
        }
    } else {
        res.status(400);
        throw new Error('Datos de usuario inválidos.');
    }
});

// @desc    Actualizar el propio perfil (Autoservicio)
// @route   PATCH /api/users/profile
const updateMyProfile = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    // Extraemos SOLO los campos permitidos para el autoservicio
    // Evitamos que manden { "rol": "admin_club" } y se hackeen la cuenta
    const {
        nombre,
        apellido,
        email,
        telefono,
        direccion,
        contactoEmergencia,
        obraSocial,
        dni,
        fechaNacimiento,
        password,
        fotoPerfil,
    } = req.body;

    if (nombre !== undefined) {
        const n = String(nombre).trim();
        if (!n) {
            res.status(400);
            throw new Error('El nombre es obligatorio.');
        }
        user.nombre = n;
    }
    if (apellido !== undefined) {
        const a = String(apellido).trim();
        if (!a) {
            res.status(400);
            throw new Error('El apellido es obligatorio.');
        }
        user.apellido = a;
    }

    if (email !== undefined) {
        const raw = String(email || '').trim().toLowerCase();
        const roles = normalizeUserRoles(user);
        const hasAtleta = roles.includes('atleta');

        if (!raw) {
            if (!hasAtleta) {
                res.status(400);
                throw new Error('El email es obligatorio.');
            }
            if (!isAthleteInternalEmail(user.email, req.clubIdentifier)) {
                try {
                    const resolved = await resolveAthleteEmail(User, {
                        email: '',
                        nombre: user.nombre,
                        apellido: user.apellido,
                        clubIdentifier: req.clubIdentifier,
                    });
                    user.email = resolved.email;
                } catch (e) {
                    res.status(e.statusCode || 400);
                    throw e;
                }
            }
        } else {
            if (!raw.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
                res.status(400);
                throw new Error('Ingresá un email válido.');
            }
            if (raw !== String(user.email || '').toLowerCase()) {
                const taken = await User.findOne({ email: raw, _id: { $ne: user._id } }).select('_id').lean();
                if (taken) {
                    res.status(400);
                    throw new Error('Ese email ya está registrado en el club.');
                }
                user.email = raw;
            }
        }
    }

    if (telefono !== undefined) user.telefono = String(telefono).trim();
    if (direccion !== undefined) user.direccion = String(direccion).trim();
    if (contactoEmergencia !== undefined) user.contactoEmergencia = String(contactoEmergencia).trim();
    if (obraSocial !== undefined) user.obraSocial = String(obraSocial).trim();
    if (dni !== undefined) user.dni = String(dni).trim();
    if (fechaNacimiento !== undefined) {
        user.fechaNacimiento = fechaNacimiento ? new Date(fechaNacimiento) : null;
    }
    if (fotoPerfil !== undefined) {
        user.fotoPerfil = String(fotoPerfil).trim();
    }

    if (password) {
        if (String(password).length < 6) {
            res.status(400);
            throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }
        user.password = password;
    }

    const updatedUser = await user.save();

    const edad = calcEdad(updatedUser.fechaNacimiento);
    const loginHint = isAthleteInternalEmail(updatedUser.email, req.clubIdentifier)
        ? String(updatedUser.email).split('@')[0]
        : updatedUser.email;
    res.json({
        ...updatedUser.toObject(),
        password: undefined,
        edad,
        loginHint,
        emailGenerado: isAthleteInternalEmail(updatedUser.email, req.clubIdentifier),
        cuotasEnApp: updatedUser.rol === 'atleta' ? atletaCuotasEnApp(updatedUser) : undefined,
        puedePagarEnApp:
            updatedUser.rol === 'tutor' ||
            (updatedUser.rol === 'atleta' &&
                atletaCuotasEnApp(updatedUser) &&
                puedePagarComoAtleta(updatedUser.fechaNacimiento)),
    });
});

// @desc    Actualizar cualquier usuario (Solo Admins)
// @route   PATCH /api/users/:id
const updateUserAsAdmin = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    if (req.user.rol === 'administrativo' && normalizeUserRoles(user).includes('admin_club')) {
        res.status(403);
        throw new Error('No tenés permiso para modificar al administrador del club.');
    }

    user.nombre = req.body.nombre || user.nombre;
    user.apellido = req.body.apellido || user.apellido;
    user.email = req.body.email || user.email;
    user.telefono = req.body.telefono || user.telefono;
    user.direccion = req.body.direccion || user.direccion;
    
    if (req.body.fechaNacimiento !== undefined) {
        user.fechaNacimiento = req.body.fechaNacimiento || undefined;
    }

    if (req.body.sexo !== undefined) {
        user.sexo = req.body.sexo === 'M' || req.body.sexo === 'F' ? req.body.sexo : '';
    }
    
    const tutorAnterior = user.tutorPrincipal ? String(user.tutorPrincipal) : null;
    if (req.body.tutorPrincipal !== undefined) {
        user.tutorPrincipal = req.body.tutorPrincipal ? req.body.tutorPrincipal : undefined;
    }

    if (req.body.fotoPerfil !== undefined) {
        user.fotoPerfil = String(req.body.fotoPerfil).trim();
    }
    
    const rolesAnteriores = normalizeUserRoles(user);
    const rolAnterior = user.rol;

    // El admin sí puede cambiar roles y estados
    if (req.body.roles || req.body.rol) {
        let resolved;
        try {
            resolved = resolveRolesWrite(
                req.body.roles !== undefined ? req.body.roles : user.roles,
                req.body.rol || user.rol,
            );
        } catch (e) {
            res.status(400);
            throw e;
        }
        for (const r of resolved.roles) {
            if (!isAssignableUserRole(r)) {
                res.status(400);
                throw new Error('Ese rol no está disponible en esta versión de la app.');
            }
            if (!canAssignUserRole(req.user.rol, r)) {
                res.status(403);
                throw new Error('Solo el administrador del club puede asignar ese rol.');
            }
        }
        user.rol = resolved.rol;
        user.roles = resolved.roles;
    }
    if (req.body.activo !== undefined) {
        user.estado = req.body.activo === false || req.body.activo === 'false' ? 'inactivo' : 'activo';
    }
    if (req.body.estado) user.estado = req.body.estado;

    const nextRoles = normalizeUserRoles(user);
    const hasAtleta = nextRoles.includes('atleta');
    const becameInactive = user.estado === 'inactivo' && user.isModified('estado');
    if (becameInactive && hasAtleta && req.models.Enrollment) {
        await req.models.Enrollment.updateMany(
            { atleta: user._id, estado: 'activo' },
            { $set: { estado: 'inactivo', fechaBaja: Date.now() } },
        );
    }

    const clientRol = nextRoles.find((r) => CLIENT_USER_ROLES.includes(r));
    const staffPayrollRol = nextRoles.find((r) => PAYROLL_STAFF_ROLES.includes(r));
    const payrollRol = hasAtleta ? 'atleta' : staffPayrollRol || user.rol;

    if (req.body.cuotasEnApp !== undefined) {
        const habilitar = req.body.cuotasEnApp === true || req.body.cuotasEnApp === 'true';
        if (hasAtleta) {
            user.cuotasEnApp = habilitar;
        }
    }

    if (req.body.enNomina !== undefined || req.body.sueldoNomina !== undefined || req.body.rol || req.body.roles) {
        try {
            const payrollFields = parsePayrollFields(req.body, payrollRol);
            if (payrollFields.clear) {
                user.enNomina = false;
                user.sueldoNomina = 0;
            } else if (hasAtleta) {
                if (payrollFields.enNomina !== undefined) user.enNomina = payrollFields.enNomina;
                if (payrollFields.sueldoNomina !== undefined) {
                    user.sueldoNomina = payrollFields.sueldoNomina;
                }
                if (user.enNomina !== true) user.sueldoNomina = 0;
            } else {
                // Staff
                user.enNomina = false;
                if (payrollFields.sueldoNomina !== undefined) {
                    user.sueldoNomina = payrollFields.sueldoNomina;
                } else if (req.body.sueldoNomina === '' || req.body.sueldoNomina === null) {
                    user.sueldoNomina = 0;
                }
            }
        } catch (e) {
            res.status(e.statusCode || 400);
            throw e;
        }
    }

    if (req.body.exentoCuotaSocial !== undefined || req.body.cuotaSocialAsignada !== undefined || req.body.rol || req.body.roles) {
        if (clientRol) {
            try {
                const socialAssignment = await resolveUserSocialFeeAssignment(req.models, {
                    rol: clientRol,
                    exentoCuotaSocial:
                        req.body.exentoCuotaSocial !== undefined
                            ? req.body.exentoCuotaSocial
                            : user.exentoCuotaSocial,
                    cuotaSocialAsignada:
                        req.body.cuotaSocialAsignada !== undefined
                            ? req.body.cuotaSocialAsignada
                            : user.cuotaSocialAsignada,
                });
                user.exentoCuotaSocial = socialAssignment.exentoCuotaSocial;
                user.cuotaSocialAsignada = socialAssignment.cuotaSocialAsignada;
            } catch (e) {
                res.status(e.statusCode || 400);
                throw e;
            }
        } else if (req.body.exentoCuotaSocial !== undefined) {
            user.exentoCuotaSocial =
                req.body.exentoCuotaSocial === true || req.body.exentoCuotaSocial === 'true';
            if (user.exentoCuotaSocial) user.cuotaSocialAsignada = null;
        }
    }

    const updatedUser = await user.save();
    const updatedRoles = normalizeUserRoles(updatedUser);

    if (
        updatedRoles.includes('atleta') &&
        updatedUser.tutorPrincipal &&
        String(updatedUser.tutorPrincipal) !== tutorAnterior
    ) {
        try {
            await syncFamilyDiscountForAthlete(req.models, updatedUser._id);
        } catch (e) {
            console.log('Descuento familiar al vincular tutor:', e.message);
        }
    }

    res.json({
        _id: updatedUser._id,
        nombre: updatedUser.nombre,
        apellido: updatedUser.apellido,
        email: updatedUser.email,
        rol: updatedUser.rol,
        roles: updatedRoles,
        estado: updatedUser.estado,
        fotoPerfil: updatedUser.fotoPerfil,
        cuotasEnApp: updatedRoles.includes('atleta') ? atletaCuotasEnApp(updatedUser) : undefined,
        exentoCuotaSocial: updatedUser.exentoCuotaSocial,
        cuotaSocialAsignada: updatedUser.cuotaSocialAsignada,
        enNomina: updatedUser.enNomina === true,
        sueldoNomina: updatedUser.sueldoNomina || 0,
    });

    if (clientRol) {
        try {
            await ensureCurrentMonthSocialFeeForUser(req.models, updatedUser, req.clubTimezone);
        } catch (e) {
            console.log('Cuota social al actualizar usuario:', e.message);
        }
    }

    if (
        rolesAnteriores.includes('atleta') ||
        rolesAnteriores.includes('socio') ||
        updatedRoles.includes('atleta') ||
        updatedRoles.includes('socio')
    ) {
        await syncAthleteCountToSuper(req.models, req.clubIdentifier);
    }

    if (
        rolesAnteriores.some((r) => PAYROLL_STAFF_ROLES.includes(r)) ||
        updatedRoles.some((r) => PAYROLL_STAFF_ROLES.includes(r)) ||
        (req.body.activo !== undefined || req.body.estado)
    ) {
        await syncStaffGroupChatSafe(req.models);
    }
});

// @desc    Resumen de cuotas abiertas del usuario (antes de baja / reactivación)
// @route   GET /api/users/:id/cuotas-impagas
const getUserUnpaidPaymentsSummary = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const user = await User.findById(req.params.id).select('nombre apellido estado').lean();
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
    const summary = await getOpenPaymentsSummary(req.models, req.params.id);
    res.json({
        usuario: { _id: user._id, nombre: user.nombre, apellido: user.apellido, estado: user.estado },
        ...summary,
    });
});

// @desc    Desactivar (Baja lógica) un atleta y chequear estado del tutor
// @route   PATCH /api/users/atletas/:id/deactivate
const deactivateAthlete = asyncHandler(async (req, res) => {
    const { User, Enrollment } = req.models;
    // Este booleano vendrá en el body si el admin aprieta "Sí" en el pop-up del frontend
    const { desactivarTutorTambien } = req.body; 

    const atleta = await User.findById(req.params.id);
    if (!atleta) {
        res.status(404);
        throw new Error('Atleta no encontrado');
    }

    const cuotasImpagas = await getOpenPaymentsSummary(req.models, atleta._id);

    // 1. Damos de baja al atleta
    atleta.estado = 'inactivo';
    await atleta.save();

    // 2. Damos de baja todas sus inscripciones activas (para que no le sigan cobrando ni aparezca en lista)
    if (Enrollment) {
        await Enrollment.updateMany(
            { atleta: atleta._id, estado: 'activo' },
            { $set: { estado: 'inactivo', fechaBaja: Date.now() } }
        );
    }

    // 3. Lógica Bidireccional del Tutor
    let infoTutor = {
        tieneTutor: false,
        otrosAtletasActivos: 0,
        tutorDesactivado: false,
        mensaje: "El atleta fue dado de baja. (No tenía tutor vinculado)."
    };

    if (atleta.tutorPrincipal) {
        infoTutor.tieneTutor = true;

        // Contamos si este mismo tutor tiene OTROS hijos que sigan activos
        const otrosAtletasActivos = await User.countDocuments({
            ...hijosDelTutorFilter(atleta.tutorPrincipal),
            _id: { $ne: atleta._id },
        });

        infoTutor.otrosAtletasActivos = otrosAtletasActivos;

        if (otrosAtletasActivos === 0) {
            if (desactivarTutorTambien) {
                // El admin mandó la orden de limpiar al padre también
                await User.findByIdAndUpdate(atleta.tutorPrincipal, { estado: 'inactivo' });
                infoTutor.tutorDesactivado = true;
                infoTutor.mensaje = "Atleta y Tutor dados de baja exitosamente.";
            } else {
                // Le avisamos al frontend que hay que preguntarle al Admin
                infoTutor.mensaje = "Atleta dado de baja. ATENCIÓN: El tutor ya no tiene otros hijos activos en el club.";
                infoTutor.requiereAccionPantalla = true; // El frontend lee esto y abre el Modal
            }
        } else {
            infoTutor.mensaje = `Atleta dado de baja. El tutor se mantiene activo porque tiene otros ${otrosAtletasActivos} atleta(s) en el club.`;
        }
    }

    res.json({
        success: true,
        atletaId: atleta._id,
        infoTutor,
        cuotasImpagas,
    });
});

// @desc    Reactivar usuario; opcionalmente perdonar cuotas abiertas
// @route   PATCH /api/users/:id/reactivate
const reactivateUser = asyncHandler(async (req, res) => {
    const { User } = req.models;
    const perdonarCuotas =
        req.body.perdonarCuotas === true || req.body.perdonarCuotas === 'true';

    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    const before = await getOpenPaymentsSummary(req.models, user._id);
    let perdonadas = 0;
    if (perdonarCuotas && before.cantidad > 0) {
        const result = await forgiveOpenPayments(req.models, user._id);
        perdonadas = result.deleted;
    }

    user.estado = 'activo';
    await user.save();

    res.json({
        success: true,
        _id: user._id,
        estado: user.estado,
        cuotasImpagasAntes: before,
        cuotasPerdonadas: perdonadas,
        cuotasSiguen: perdonarCuotas ? 0 : before.cantidad,
        montoQueSigue: perdonarCuotas ? 0 : before.montoTotal,
    });
});

// @desc    Confirmar que el atleta de prueba continúa (activa facturación)
// @route   POST /api/users/atletas/:id/prueba/continuar
const continueTrialAthlete = asyncHandler(async (req, res) => {
    try {
        const atleta = await convertTrialAthleteToPermanent(req.models, req.params.id, {
            actor: req.user,
        });
        res.json({
            success: true,
            atleta: {
                _id: atleta._id,
                esPrueba: atleta.esPrueba,
                pruebaDecision: atleta.pruebaDecision,
                pruebaHasta: atleta.pruebaHasta,
            },
            message: 'El atleta quedó como permanente. Se activaron cuotas y planes.',
        });
    } catch (e) {
        res.status(e.statusCode || 500);
        throw e;
    }
});

// @desc    Dar de baja un atleta de prueba al vencer / rechazar continuidad
// @route   POST /api/users/atletas/:id/prueba/baja
const leaveTrialAthleteHandler = asyncHandler(async (req, res) => {
    const desactivarTutorTambien = req.body?.desactivarTutorTambien !== false;
    try {
        const result = await leaveTrialAthlete(req.models, req.params.id, {
            actor: req.user,
            desactivarTutorTambien,
        });
        res.json({
            success: true,
            atletaId: result.atleta._id,
            otrosAtletasActivos: result.otrosAtletasActivos,
            tutorDesactivado: result.tutorDesactivado,
            message: result.tutorDesactivado
                ? 'Atleta y tutor dados de baja.'
                : 'Atleta de prueba dado de baja.',
        });
    } catch (e) {
        res.status(e.statusCode || 500);
        throw e;
    }
});

// @desc    Obtener lista de usuarios con paginación, filtros y familiares
// @route   GET /api/users
// @access  Solo Admins
const getUsers = asyncHandler(async (req, res) => {
    const { User } = req.models;
    
    // Paginación
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 50, maxLimit: 100 });

    // Filtros
    let filter = {};

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (req.query.search && req.query.search.trim() !== '') {
        // Cada palabra debe aparecer en nombre, apellido o email (ej. "Juan Pérez" encuentra Juan + Pérez)
        const tokens = req.query.search.trim().split(/\s+/).filter(Boolean);
        filter.$and = tokens.map((token) => {
            const rx = new RegExp(escapeRegex(token), 'i');
            return {
                $or: [
                    { nombre: rx },
                    { apellido: rx },
                    { email: rx }
                ]
            };
        });
    }

    if (req.query.rol && req.query.rol !== 'Todos' && req.query.rol !== 'undefined') {
        const rolFilter = String(req.query.rol);
        if (rolFilter === 'inactivos') {
            filter.estado = 'inactivo';
        } else if (rolFilter === 'prueba') {
            filter.esPrueba = true;
            filter.estado = { $ne: 'inactivo' };
        } else {
            Object.assign(filter, roleQuery(rolFilter));
            filter.estado = { $ne: 'inactivo' };
        }
    } else {
        // Listado general: ocultar dados de baja (usar filtro Inactivos para verlos).
        filter.estado = { $ne: 'inactivo' };
    }

    // Optional explicit estado (e.g. estructura hub: only activos, not moroso).
    if (req.query.estado && req.query.rol !== 'inactivos') {
        const est = String(req.query.estado);
        if (['activo', 'inactivo', 'moroso'].includes(est)) {
            filter.estado = est;
        }
    }

    // Buscamos a los usuarios y llenamos su tutor (vínculo familiar)
    const users = await User.find(filter)
        .select('-password')
        .populate('tutorPrincipal', 'nombre apellido email rol fotoPerfil')
        .collation(userNameCollation)
        .sort(userNameMongoSort)
        .skip(skip)
        .limit(limit);

    // Conteo total para que el frontend sepa si hay más páginas
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limit);

    const tutorIds = users
        .filter((u) => {
            const rs = normalizeUserRoles(u);
            return rs.includes('tutor') || rs.includes('admin_club');
        })
        .map((u) => u._id);

    const familiaresByTutor = {};
    if (tutorIds.length) {
        try {
            const hijos = await User.find(atletasDeTutoresFilter(tutorIds))
                .select('nombre apellido rol roles fotoPerfil tutorPrincipal')
                .lean();
            for (const h of hijos) {
                const tid = String(h.tutorPrincipal);
                if (!familiaresByTutor[tid]) familiaresByTutor[tid] = [];
                familiaresByTutor[tid].push(h);
            }
        } catch (e) {
            console.error('[users] familiaresACargo:', e.message);
        }
    }

    const usersWithFamily = users.map((u) => {
        const rs = normalizeUserRoles(u);
        const esTutorDe =
            rs.includes('tutor') || rs.includes('admin_club')
                ? familiaresByTutor[String(u._id)] || []
                : [];
        return {
            ...u.toObject(),
            roles: rs,
            familiaresACargo: esTutorDe,
        };
    });

    res.json({
        users: usersWithFamily,
        page,
        totalPages,
        totalUsers
    });
});

// @desc    Perfil del usuario logueado (atleta / tutor / staff)
// @route   GET /api/users/me
const getMe = asyncHandler(async (req, res) => {
    const { User } = req.models;
    await ensureTrialExpiryProcessed(req.models);
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
    const edad = calcEdad(user.fechaNacimiento);
    const roles = normalizeUserRoles(user);
    const activeRol = req.user.rol;
    const cuotasHabilitadas = atletaCuotasEnApp(user);
    const puedePagarEnApp =
        activeRol === 'tutor' ||
        activeRol === 'socio' ||
        (activeRol === 'atleta' && cuotasHabilitadas && puedePagarComoAtleta(user.fechaNacimiento));

    let pruebaPendiente = [];
    if (roles.includes('tutor') && activeRol === 'tutor') {
        pruebaPendiente = await User.find({
            ...hijosDelTutorFilter(user._id),
            esPrueba: true,
            pruebaDecision: 'pendiente',
        }).select('_id nombre apellido esPrueba pruebaHasta pruebaDecision');
    } else if (roles.includes('atleta') && trialNeedsMemberDecision(user)) {
        // Athletes without an active tutor confirm continue / leave themselves.
        const hasTutor = await athleteHasDecisionTutor(req.models, user);
        if (!hasTutor) {
            if (user.pruebaDecision !== 'pendiente' && user.esPrueba) {
                user.pruebaDecision = 'pendiente';
                if (!user.pruebaAvisoEnviadoAt) user.pruebaAvisoEnviadoAt = new Date();
                await user.save();
            }
            pruebaPendiente = [user];
        }
    }

    res.json({
        ...user.toObject(),
        rol: activeRol,
        roles,
        edad,
        loginHint: isAthleteInternalEmail(user.email, req.clubIdentifier)
            ? String(user.email).split('@')[0]
            : user.email,
        emailGenerado: isAthleteInternalEmail(user.email, req.clubIdentifier),
        cuotasEnApp: roles.includes('atleta') ? cuotasHabilitadas : undefined,
        puedePagarEnApp,
        pruebaPendiente: pruebaPendiente.map((a) => (a.toObject ? a.toObject() : a)),
    });
});

// @desc    Hijos vinculados al tutor
// @route   GET /api/users/mis-hijos
const getMisHijos = asyncHandler(async (req, res) => {
    const { User } = req.models;
    if (req.user.rol !== 'tutor') {
        res.status(403);
        throw new Error('Solo tutores pueden consultar familiares a cargo.');
    }
    const hijos = await User.find(hijosDelTutorFilter(req.user._id))
        .select('-password')
        .collation(userNameCollation)
        .sort(userNameMongoSort);

    const tutor = await User.findById(req.user._id)
        .select('rol lastSeenNewsAt lastSeenResourcesAt')
        .lean();

    const alertFlags = tutor
        ? await tutorAthletesAlertFlags(tutor, hijos, req.models)
        : new Map();

    const enriched = hijos.map((h) => ({
        ...h.toObject(),
        edad: calcEdad(h.fechaNacimiento),
        cuotasEnApp: atletaCuotasEnApp(h),
        puedePagarEnApp: puedePagarComoAtleta(h.fechaNacimiento),
        tieneAlertas: alertFlags.get(String(h._id)) === true,
    }));

    res.json(enriched);
});

// @desc    Tutor: habilitar o deshabilitar cuotas en la app para un hijo
// @route   PATCH /api/users/mis-hijos/:atletaId/cuotas-en-app
const setTutorAthleteCuotasEnApp = asyncHandler(async (req, res) => {
    const { User } = req.models;

    if (req.user.rol !== 'tutor') {
        res.status(403);
        throw new Error('Solo tutores pueden cambiar este ajuste.');
    }

    const habilitar = req.body.cuotasEnApp === true || req.body.cuotasEnApp === 'true';
    const deshabilitar = req.body.cuotasEnApp === false || req.body.cuotasEnApp === 'false';
    if (!habilitar && !deshabilitar) {
        res.status(400);
        throw new Error('Indicá cuotasEnApp (true o false).');
    }

    const atleta = await User.findOne({
        _id: req.params.atletaId,
        rol: 'atleta',
        tutorPrincipal: req.user._id,
    });

    if (!atleta) {
        res.status(404);
        throw new Error('Atleta no encontrado o no está a tu cargo.');
    }

    atleta.cuotasEnApp = habilitar;
    await atleta.save();

    res.json({
        _id: atleta._id,
        nombre: atleta.nombre,
        apellido: atleta.apellido,
        cuotasEnApp: atletaCuotasEnApp(atleta),
        puedePagarEnApp: puedePagarComoAtleta(atleta.fechaNacimiento),
        edad: calcEdad(atleta.fechaNacimiento),
    });
});

// @desc    Resumen por hijo para el panel del tutor
// @route   GET /api/users/tutor-dashboard
const getTutorDashboard = asyncHandler(async (req, res) => {
    const { User, Payment } = req.models;

    if (req.user.rol !== 'tutor') {
        res.status(403);
        throw new Error('Solo tutores pueden usar este panel.');
    }

    const hijos = await User.find(hijosDelTutorFilter(req.user._id))
        .select('nombre apellido fechaNacimiento fotoPerfil')
        .collation(userNameCollation)
        .sort(userNameMongoSort)
        .lean();

    const hijoIds = hijos.map((h) => h._id);
    const [docsBy, allPayments] = await Promise.all([
        countDocsPendientesByAthleteIds(hijoIds, req.models),
        hijoIds.length
            ? Payment.find({ atleta: { $in: hijoIds } }).select('atleta estado montoFinal').lean()
            : Promise.resolve([]),
    ]);

    const paymentsByAthlete = new Map();
    for (const p of allPayments) {
        const aid = String(p.atleta);
        if (!paymentsByAthlete.has(aid)) paymentsByAthlete.set(aid, []);
        paymentsByAthlete.get(aid).push(p);
    }

    const items = hijos.map((h) => {
        const payments = paymentsByAthlete.get(String(h._id)) || [];
        const pendientes = payments.filter((p) => ['pendiente', 'vencido'].includes(p.estado));
        const deuda = pendientes.reduce((sum, p) => sum + (p.montoFinal || 0), 0);
        return {
            _id: h._id,
            nombre: h.nombre,
            apellido: h.apellido,
            fotoPerfil: h.fotoPerfil || '',
            edad: calcEdad(h.fechaNacimiento),
            docsPendientes: docsBy.get(String(h._id)) || 0,
            cuotasPendientes: pendientes.length,
            cuotasVencidas: pendientes.filter((p) => p.estado === 'vencido').length,
            deuda,
        };
    });

    res.json(items);
});

const registerPushToken = asyncHandler(async (req, res) => {
    const { token, platform } = req.body;
    const { User } = req.models;

    const tokens = await registerUserPushToken(User, req.user._id, { token, platform });
    res.json({ ok: true, devices: tokens.length });
});

const removePushToken = asyncHandler(async (req, res) => {
    const { token } = req.body;
    const { User } = req.models;

    await unregisterUserPushToken(User, req.user._id, token);
    res.json({ ok: true });
});

export {
    registerUser,
    updateMyProfile,
    updateUserAsAdmin,
    deactivateAthlete,
    getUserUnpaidPaymentsSummary,
    reactivateUser,
    continueTrialAthlete,
    leaveTrialAthleteHandler,
    getUsers,
    getMe,
    getMisHijos,
    setTutorAthleteCuotasEnApp,
    getTutorDashboard,
    registerPushToken,
    removePushToken,
};