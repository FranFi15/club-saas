/** Sexo efectivo para fórmulas (perfil del atleta o categoría inscripta). */
export function resolveAtletaSexo(userSexo, categorySexo) {
    if (userSexo === 'M' || userSexo === 'F') return userSexo;
    if (categorySexo === 'M' || categorySexo === 'F') return categorySexo;
    return '';
}

/** Mensaje de error si el atleta no puede inscribirse por sexo; null si está OK. */
export function categorySexoError(category, user) {
    const catSexo = category?.sexo || 'ambos';
    if (catSexo === 'ambos') return null;
    if (user.sexo && user.sexo !== catSexo) {
        const label = catSexo === 'M' ? 'varones' : 'mujeres';
        return `Esta categoría es solo para ${label}.`;
    }
    return null;
}

/** Si el atleta no tiene sexo y la categoría es M/F, lo asigna automáticamente. */
export async function applyCategorySexoToAthlete(user, category) {
    if (!user || user.rol !== 'atleta') return user;
    if (user.sexo === 'M' || user.sexo === 'F') return user;
    const catSexo = category?.sexo;
    if (catSexo === 'M' || catSexo === 'F') {
        user.sexo = catSexo;
        await user.save();
    }
    return user;
}

/** Primer sexo definido en categorías activas del atleta. */
export async function categorySexoFromEnrollments(Enrollment, atletaId) {
    const rows = await Enrollment.find({ atleta: atletaId, estado: 'activo' })
        .populate('categoria', 'sexo')
        .lean();
    for (const row of rows) {
        const s = row.categoria?.sexo;
        if (s === 'M' || s === 'F') return s;
    }
    return '';
}
