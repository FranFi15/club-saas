import { createAppNotificationsMany } from './appNotification.service.js';
import { countsFor, idOf, playingTimeMs, possessionSummary, scorePoints, statRows } from './matchDerive.js';

function personName(user) {
    if (!user) return 'Jugador';
    const nombre = `${user.nombre || ''} ${user.apellido || ''}`.trim();
    return nombre || 'Jugador';
}

export function buildInforme(session, { full, userId }) {
    const campos = session.planilla?.campos || [];
    const jugadas = session.jugadas || [];
    const tiempos = playingTimeMs(session.relojEventos || []);
    const posesion = possessionSummary(session.posesiones || [], session.relojEventos || []);
    const lista = (session.listaBuenaFe || []).map((row) => ({
        usuario: idOf(row.usuario),
        nombre: personName(row.usuario),
        tipoPersona: row.tipoPersona,
        dorsal: row.dorsal || '',
        segundos: Math.round((tiempos[idOf(row.usuario)] || 0) / 1000),
    }));

    const peopleIds = full
        ? lista.filter((row) => row.tipoPersona === 'jugador').map((row) => row.usuario)
        : [String(userId)];

    const personas = peopleIds.filter(Boolean).map((uid) => ({
        usuario: uid,
        nombre: lista.find((row) => row.usuario === uid)?.nombre || '',
        segundos: Math.round((tiempos[uid] || 0) / 1000),
        filas: statRows(campos.filter((campo) => campo.alcance !== 'partido'), jugadas, uid),
        jugadas: jugadas.filter((play) => play.equipo !== 'rival' && idOf(play.usuario) === uid),
    }));

    const partidoFilas = statRows(
        campos.filter((campo) => campo.alcance === 'partido' && (campo.tipo === 'porcentaje' || campo.tipo === 'total')),
        jugadas,
        null,
    );

    return {
        sessionId: session._id,
        nombre: session.nombreSesion || session.planilla?.nombre || 'Partido',
        fecha: session.fecha,
        horaInicio: session.horaInicio,
        horaFin: session.horaFin,
        cancha: session.planilla?.cancha || null,
        campos,
        valores: session.planillaValores || { partido: {}, personas: [] },
        marcador: {
            nosotros: scorePoints(jugadas, campos, 'nosotros'),
            rival: scorePoints(jugadas, campos, 'rival'),
        },
        contarPosesion: session.planilla?.reloj?.posesion !== false,
        rival: session.planilla?.rival?.activo === true,
        posesion: session.planilla?.reloj?.posesion === false ? null : {
            nosotros: {
                cantidad: posesion.nosotros.cantidad,
                segundos: Math.round(posesion.nosotros.ms / 1000),
            },
            rival: {
                cantidad: posesion.rival.cantidad,
                segundos: Math.round(posesion.rival.ms / 1000),
            },
        },
        partidoFilas,
        lista,
        personas,
        enviado: Boolean(session.informeEnviadoEn),
    };
}

export async function notifyMatchReport(models, session) {
    const ids = [...new Set((session.listaBuenaFe || []).map((row) => idOf(row.usuario)).filter(Boolean))];
    if (!ids.length) return;
    const nombre = session.nombreSesion?.trim() || 'Partido';
    await createAppNotificationsMany(models, ids, {
        tipo: 'partido_informe',
        titulo: 'Informe del partido',
        mensaje: `${nombre}: ya podés ver tus números y el tiempo en cancha.`,
        referencia: session._id,
    });
}

export function manualValue(campo, raw) {
    if (campo.tipo === 'numero') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    if (campo.tipo === 'si_no') return raw === true || raw === 'si';
    if (campo.tipo === 'texto') return String(raw || '').trim().slice(0, 200);
    return undefined;
}

export { countsFor };
