const ESTADO_LABEL = {
    presente: 'Presente',
    tarde: 'Tarde',
    ausente: 'Ausente',
};

function refId(value) {
    if (!value) return null;
    if (typeof value === 'object' && value._id != null) return value._id;
    return value;
}

function formatSessionWhen(session) {
    let fechaTxt = '';
    try {
        fechaTxt = new Date(session.fecha).toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        fechaTxt = String(session.fecha || '');
    }
    const hora = session.horaInicio && session.horaFin ? ` · ${session.horaInicio}–${session.horaFin}` : '';
    return `${fechaTxt}${hora}`;
}

/**
 * Avisa a tutores (y al atleta) por novedades cuando se guarda asistencia de una sesión.
 */
export async function notifyAttendanceSaved(models, { session, asistencia, autorId }) {
    const { User, News, Category } = models;
    if (!Array.isArray(asistencia) || asistencia.length === 0) return;

    const estadoByAtleta = Object.fromEntries(
        asistencia.map((row) => [String(refId(row.atleta)), row.estado || 'ausente']),
    );
    const atletaIds = Object.keys(estadoByAtleta);

    const athletes = await User.find({ _id: { $in: atletaIds } })
        .select('nombre apellido tutorPrincipal')
        .lean();

    let catName = '';
    const categoriaId = refId(session.categoria);
    if (categoriaId) {
        const cat = await Category.findById(categoriaId).select('nombre').lean();
        catName = cat?.nombre || '';
    }

    const cuando = formatSessionWhen(session);
    const sessionLabel = catName ? `${catName} — ${cuando}` : cuando;

    const byTutor = new Map();
    for (const atleta of athletes) {
        const aid = String(atleta._id);
        const estado = estadoByAtleta[aid] || 'ausente';
        const line = `${atleta.nombre} ${atleta.apellido}: ${ESTADO_LABEL[estado] || estado}`;
        const tutorId = atleta.tutorPrincipal ? String(refId(atleta.tutorPrincipal)) : null;
        if (tutorId) {
            if (!byTutor.has(tutorId)) byTutor.set(tutorId, []);
            byTutor.get(tutorId).push(line);
        }

        await News.create({
            titulo: 'Tu asistencia',
            contenido: ` ${sessionLabel} quedaste registrado/a como: ${ESTADO_LABEL[estado] || estado}.`,
            autor: autorId,
            tipo: 'deportivo',
            alcance: 'usuario',
            targetRoles: [],
            targetCategorias: [],
            targetUsuarios: [atleta._id],
        });
    }

    for (const [tutorId, lines] of byTutor) {
        await News.create({
            titulo: 'Asistencia de la sesión',
            contenido: `${sessionLabel}.\n\n${lines.join('\n')}`,
            autor: autorId,
            tipo: 'deportivo',
            alcance: 'tutor',
            targetRoles: [],
            targetCategorias: [],
            targetUsuarios: [tutorId],
        });
    }
}
