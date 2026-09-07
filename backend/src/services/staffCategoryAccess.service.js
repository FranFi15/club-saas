/**
 * Controles de acceso staff ↔ categoría / atleta (docs, recursos, etc.).
 */

export async function assertProfeCategoria(userId, categoriaId, Category) {
    const c = await Category.findById(categoriaId).select('profesores');
    if (!c) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (!(c.profesores || []).some((p) => p.equals(userId))) {
        const err = new Error('No sos profesor de esta categoría');
        err.statusCode = 403;
        throw err;
    }
}

export async function assertProfeAtleta(userId, atletaId, Category, Enrollment) {
    const cats = await Category.find({ profesores: userId }).select('_id');
    const ids = cats.map((x) => x._id);
    const ok = await Enrollment.findOne({
        atleta: atletaId,
        categoria: { $in: ids },
        estado: 'activo',
    });
    if (!ok) {
        const err = new Error(
            'No podés actuar sobre este atleta (no está en tus categorías).',
        );
        err.statusCode = 403;
        throw err;
    }
}

export async function assertPreparadorCategoria(userId, categoriaId, Category) {
    const c = await Category.findById(categoriaId).select('preparadoresFisicos');
    if (!c) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (!(c.preparadoresFisicos || []).some((p) => p.equals(userId))) {
        const err = new Error('No sos preparador físico de esta categoría');
        err.statusCode = 403;
        throw err;
    }
}

export async function assertPreparadorAtleta(userId, atletaId, Category, Enrollment) {
    const cats = await Category.find({ preparadoresFisicos: userId }).select('_id');
    const ids = cats.map((x) => x._id);
    const ok = await Enrollment.findOne({
        atleta: atletaId,
        categoria: { $in: ids },
        estado: 'activo',
    });
    if (!ok) {
        const err = new Error(
            'No podés actuar sobre este atleta (no está en tus categorías).',
        );
        err.statusCode = 403;
        throw err;
    }
}

export async function assertNutricionistaCategoria(userId, categoriaId, Category) {
    const c = await Category.findById(categoriaId).select('nutricionistas');
    if (!c) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (!(c.nutricionistas || []).some((p) => p.equals(userId))) {
        const err = new Error('No sos nutricionista de esta categoría');
        err.statusCode = 403;
        throw err;
    }
}

export async function assertNutricionistaAtleta(userId, atletaId, Category, Enrollment) {
    const cats = await Category.find({ nutricionistas: userId }).select('_id');
    const ids = cats.map((x) => x._id);
    const ok = await Enrollment.findOne({
        atleta: atletaId,
        categoria: { $in: ids },
        estado: 'activo',
    });
    if (!ok) {
        const err = new Error(
            'No podés actuar sobre este atleta (no está en tus categorías).',
        );
        err.statusCode = 403;
        throw err;
    }
}

export async function assertPsicologoCategoria(userId, categoriaId, Category) {
    const c = await Category.findById(categoriaId).select('psicologos');
    if (!c) {
        const err = new Error('Categoría no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (!(c.psicologos || []).some((p) => p.equals(userId))) {
        const err = new Error('No sos psicólogo de esta categoría');
        err.statusCode = 403;
        throw err;
    }
}

export async function assertPsicologoAtleta(userId, atletaId, Category, Enrollment) {
    const cats = await Category.find({ psicologos: userId }).select('_id');
    const ids = cats.map((x) => x._id);
    const ok = await Enrollment.findOne({
        atleta: atletaId,
        categoria: { $in: ids },
        estado: 'activo',
    });
    if (!ok) {
        const err = new Error(
            'No podés actuar sobre este atleta (no está en tus categorías).',
        );
        err.statusCode = 403;
        throw err;
    }
}

/** Staff (no admin) sobre categoría según rol. */
export async function assertStaffCategoriaAccess(user, categoriaId, Category) {
    if (user.rol === 'profe') {
        await assertProfeCategoria(user._id, categoriaId, Category);
    } else if (user.rol === 'preparador_fisico') {
        await assertPreparadorCategoria(user._id, categoriaId, Category);
    } else if (user.rol === 'nutricionista') {
        await assertNutricionistaCategoria(user._id, categoriaId, Category);
    } else if (user.rol === 'psicologo') {
        await assertPsicologoCategoria(user._id, categoriaId, Category);
    } else {
        const err = new Error('No autorizado para esta categoría.');
        err.statusCode = 403;
        throw err;
    }
}

/** Staff (no admin) sobre atleta según rol. */
export async function assertStaffAtletaAccess(user, atletaId, Category, Enrollment) {
    if (user.rol === 'profe') {
        await assertProfeAtleta(user._id, atletaId, Category, Enrollment);
    } else if (user.rol === 'preparador_fisico') {
        await assertPreparadorAtleta(user._id, atletaId, Category, Enrollment);
    } else if (user.rol === 'nutricionista') {
        await assertNutricionistaAtleta(user._id, atletaId, Category, Enrollment);
    } else if (user.rol === 'psicologo') {
        await assertPsicologoAtleta(user._id, atletaId, Category, Enrollment);
    } else {
        const err = new Error('No autorizado para este atleta.');
        err.statusCode = 403;
        throw err;
    }
}

const STAFF_ROLES = new Set(['profe', 'preparador_fisico', 'nutricionista', 'psicologo']);

/**
 * Normaliza destino(s) de usuario: `targetUsuario` o `targetUsuarios[]`.
 */
export function resolveTargetUsuarioIds(body = {}) {
    const raw = body.targetUsuarios ?? body.targetUsuario;
    if (Array.isArray(raw)) {
        return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
    }
    if (raw) return [String(raw).trim()].filter(Boolean);
    return [];
}

/**
 * Valida alcance/target para creación de docs o recursos.
 * Admin: global | categoria | usuario. Staff: categoria | usuario con ACL.
 * Para alcance usuario acepta uno o varios IDs (`targetUsuario` / `targetUsuarios`).
 */
export async function assertDeliveryTargets(req, { allowGlobal = true } = {}) {
    const { alcance, targetCategoria } = req.body;
    const { Category, Enrollment, User } = req.models;
    const rol = req.user.rol;

    if (STAFF_ROLES.has(rol)) {
        if (!['categoria', 'usuario'].includes(alcance)) {
            const err = new Error('Solo podés apuntar a una categoría o a un atleta puntual.');
            err.statusCode = 400;
            throw err;
        }
        if (alcance === 'categoria') {
            if (!targetCategoria) {
                const err = new Error('Indicá la categoría destino.');
                err.statusCode = 400;
                throw err;
            }
            await assertStaffCategoriaAccess(req.user, targetCategoria, Category);
        }
        if (alcance === 'usuario') {
            const ids = resolveTargetUsuarioIds(req.body);
            if (!ids.length) {
                const err = new Error('Indicá al menos un atleta destino.');
                err.statusCode = 400;
                throw err;
            }
            for (const id of ids) {
                await assertStaffAtletaAccess(req.user, id, Category, Enrollment);
            }
        }
        return;
    }

    if (['admin_club', 'administrativo'].includes(rol)) {
        const allowed = allowGlobal
            ? ['global', 'categoria', 'usuario']
            : ['categoria', 'usuario'];
        if (!allowed.includes(alcance)) {
            const err = new Error('Alcance inválido.');
            err.statusCode = 400;
            throw err;
        }
        if (alcance === 'categoria') {
            if (!targetCategoria) {
                const err = new Error('Indicá la categoría destino.');
                err.statusCode = 400;
                throw err;
            }
            const cat = await Category.findById(targetCategoria).select('_id');
            if (!cat) {
                const err = new Error('Categoría no encontrada.');
                err.statusCode = 404;
                throw err;
            }
        }
        if (alcance === 'usuario') {
            const ids = resolveTargetUsuarioIds(req.body);
            if (!ids.length) {
                const err = new Error('Indicá al menos una persona destino.');
                err.statusCode = 400;
                throw err;
            }
            for (const id of ids) {
                const person = await User.findById(id).select('rol estado');
                if (!person) {
                    const err = new Error('Usuario no encontrado en el club.');
                    err.statusCode = 404;
                    throw err;
                }
                if (person.estado === 'inactivo') {
                    const err = new Error('No podés apuntar a un usuario inactivo.');
                    err.statusCode = 400;
                    throw err;
                }
            }
        }
        return;
    }

    const err = new Error('No autorizado.');
    err.statusCode = 403;
    throw err;
}
