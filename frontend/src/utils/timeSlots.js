// Genera slots de 1 hora entre startHour y endHour
export function generateTimeSlots(startHour = 6, endHour = 23) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    const hi = String(h).padStart(2, '0') + ':00';
    const hf = String(h + 1).padStart(2, '0') + ':00';
    slots.push({ horaInicio: hi, horaFin: hf });
  }
  return slots;
}

// Chequea si dos rangos horarios se solapan
export function timeOverlaps(a1, a2, b1, b2) {
  return a1 < b2 && a2 > b1;
}

// Devuelve 'libre', 'entrenamiento' o 'alquiler' para un slot
// daySchedules = horarios fijos de la grilla semanal para ese día+espacio
export function getSlotStatus(slot, sessions, rentals, daySchedules = [], cancelledSessions = []) {
  // 1. Primero chequeamos alquileres (prioridad visual)
  for (const r of rentals) {
    if (timeOverlaps(slot.horaInicio, slot.horaFin, r.horaInicio, r.horaFin)) {
      return { tipo: 'alquiler', data: r };
    }
  }
  // 2. Sesiones activas del día (incluye alquileres materializados como Session)
  for (const s of sessions) {
    if (s.estado === 'cancelada') continue;
    if (!timeOverlaps(slot.horaInicio, slot.horaFin, s.horaInicio, s.horaFin)) continue;
    if (s.tipo === 'alquiler') {
      return { tipo: 'alquiler', data: s };
    }
    return { tipo: 'entrenamiento', data: s };
  }
  // 3. Grilla semanal, salvo que una sesión cancelada liberó ese horario
  const slotFreedByCancel = cancelledSessions.some((s) =>
    timeOverlaps(slot.horaInicio, slot.horaFin, s.horaInicio, s.horaFin),
  );
  if (!slotFreedByCancel) {
    for (const sch of daySchedules) {
      if (timeOverlaps(slot.horaInicio, slot.horaFin, sch.horaInicio, sch.horaFin)) {
        return {
          tipo: 'entrenamiento',
          data: {
            categoria: sch.categoria,
            horaInicio: sch.horaInicio,
            horaFin: sch.horaFin,
            _esGrilla: true,
          },
        };
      }
    }
  }
  return { tipo: 'libre', data: null };
}

// Formatea una fecha local como YYYY-MM-DD sin problemas de timezone
export function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD desde partes de calendario local (mes 0-indexado). */
export function calendarPartsToYmd(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Fecha de hoy en calendario local (YYYY-MM-DD). */
export function todayYmd() {
  const now = new Date();
  return calendarPartsToYmd(now.getFullYear(), now.getMonth(), now.getDate());
}

// Mapea día JS a nombre español (usa getDay() LOCAL, no UTC)
const diasMapa = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function getDayName(dateStr) {
  // Parseamos "YYYY-MM-DD" como fecha local para evitar desfasaje UTC
  const [y, m, d] = dateStr.split('-').map(Number);
  return diasMapa[new Date(y, m - 1, d).getDay()];
}
