import { isoCalendarDateToDisplay, isoCalendarWeekday } from './dateDisplay';

function sessionTypeLabel(tipo) {
  if (tipo === 'partido') return 'partido';
  if (tipo === 'consulta_nutricion') return 'consulta de nutrición';
  if (tipo === 'consulta_psicologia') return 'consulta de psicología';
  return 'entrenamiento';
}

/** Textos por defecto para el comunicado al cancelar una sesión. */
export function buildCancelSessionComunicado(session) {
  if (!session) {
    return { titulo: '', contenido: '', tipo: 'urgente' };
  }

  const catName = session.categoria?.nombre || 'equipo';
  const weekday = isoCalendarWeekday(session.fecha, { style: 'long' });
  const fecha = isoCalendarDateToDisplay(session.fecha);
  const horario = `${session.horaInicio}–${session.horaFin}`;
  const lugar =
    (session.lugarLibre || '').trim() ||
    (session.lugarExterno || '').trim() ||
    session.espacio?.nombre ||
    '';
  const tipo = sessionTypeLabel(session.tipo);

  const titulo = `Sesión cancelada — ${catName}`;
  const fechaLine = fecha ? `${weekday} ${fecha}`.trim() : weekday;
  let contenido = `Se canceló el ${tipo} programado para el ${fechaLine} (${horario})`;
  if (lugar) contenido += ` en ${lugar}`;
  contenido += '.\n\nMotivo:\n';

  return { titulo, contenido, tipo: 'urgente' };
}

const MOTIVO_MARKER = 'Motivo:\n';

/** El coach debe completar el texto después de “Motivo:” en la plantilla. */
export function motivoCancelacionValido(contenido) {
  const c = String(contenido || '').trim();
  if (!c) return false;
  const idx = c.indexOf(MOTIVO_MARKER);
  const extra = idx >= 0 ? c.slice(idx + MOTIVO_MARKER.length).trim() : c;
  return extra.length >= 5;
}
