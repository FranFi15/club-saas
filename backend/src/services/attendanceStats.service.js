export function emptyAthleteAttendanceStats() {
    return { presente: 0, tarde: 0, ausente: 0, total: 0, asistenciaPct: null };
}

export function aggregateAttendanceFromSessions(sessions, athleteIdFilter = null) {
    const filterSet =
        athleteIdFilter == null
            ? null
            : new Set((Array.isArray(athleteIdFilter) ? athleteIdFilter : [athleteIdFilter]).map(String));

    const porAtleta = {};

    const ensure = (id) => {
        const key = String(id);
        if (!porAtleta[key]) porAtleta[key] = emptyAthleteAttendanceStats();
        return porAtleta[key];
    };

    for (const session of sessions) {
        if (session.estado === 'cancelada') continue;
        for (const row of session.asistencia || []) {
            const aid = String(row.atleta?._id || row.atleta || '');
            if (!aid) continue;
            if (filterSet && !filterSet.has(aid)) continue;
            const stats = ensure(aid);
            stats.total += 1;
            if (row.estado === 'presente') stats.presente += 1;
            else if (row.estado === 'tarde') stats.tarde += 1;
            else stats.ausente += 1;
        }
    }

    Object.values(porAtleta).forEach((stats) => {
        if (stats.total > 0) {
            stats.asistenciaPct = Math.round(((stats.presente + stats.tarde) / stats.total) * 100);
        }
    });

    return porAtleta;
}
