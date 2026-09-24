import { Platform, Linking } from 'react-native';
import { isoCalendarDateToDisplay } from './dateDisplay';

const HEADERS = [
  'Apellido',
  'Nombre',
  'DNI',
  'Fecha nacimiento',
  'Edad',
  'Sexo',
  'Email',
  'Teléfono',
  'Dirección',
  'Contacto emergencia',
  'Obra social',
  'Disponibilidad',
  'Estado inscripción',
  'Tutor',
  'Tel. tutor',
  'Email tutor',
];

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatBirth(fecha) {
  if (!fecha) return '';
  try {
    const iso = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)
      ? fecha.slice(0, 10)
      : new Date(fecha).toISOString().slice(0, 10);
    return isoCalendarDateToDisplay(iso) || '';
  } catch {
    return '';
  }
}

function safeFilePart(name) {
  return String(name || 'categoria')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'categoria';
}

/** Builds a semicolon CSV (Excel-friendly in es-AR) from category enrollments. */
export function buildCategoryAthletesCsv(enrollments = []) {
  const rows = enrollments
    .filter((e) => e?.atleta)
    .map((e) => {
      const a = e.atleta;
      const tutor = a.tutorPrincipal;
      const tutorName = tutor
        ? `${tutor.apellido || ''} ${tutor.nombre || ''}`.trim()
        : '';
      return [
        a.apellido || '',
        a.nombre || '',
        a.dni || '',
        formatBirth(a.fechaNacimiento),
        a.edad != null ? a.edad : '',
        a.sexo || '',
        a.email || '',
        a.telefono || '',
        a.direccion || '',
        a.contactoEmergencia || '',
        a.obraSocial || '',
        a.disponibilidad || '',
        e.estado || '',
        tutorName,
        tutor?.telefono || '',
        tutor?.email || '',
      ].map(csvEscape);
    });

  const lines = [HEADERS.map(csvEscape).join(';'), ...rows.map((r) => r.join(';'))];
  // BOM so Excel opens UTF-8 correctly
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Writes CSV and opens the native share sheet (or browser download on web).
 */
export async function shareCategoryAthletesSheet({
  enrollments,
  categoryName,
  onError,
}) {
  const csv = buildCategoryAthletesCsv(enrollments);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `plantel_${safeFilePart(categoryName)}_${stamp}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { filename };
  }

  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const path = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      dialogTitle: 'Plantel de la categoría',
      UTI: 'public.comma-separated-values-text',
    });
  } else {
    const opened = await Linking.openURL(path);
    if (!opened && onError) onError('No se pudo abrir el archivo.');
  }

  return { filename, path };
}
