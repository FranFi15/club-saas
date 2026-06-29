import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { isYouTubeUrl, normalizeYouTubeWatchUrl } from './youtubeUrl';

/**
 * Detecta tipo de medio según URL de Cloudinary, YouTube o extensión.
 * @returns {'image'|'video'|'pdf'|'youtube'|'unknown'}
 */
export function detectMediaKind(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  if (isYouTubeUrl(url)) return 'youtube';
  const u = url.toLowerCase();

  if (u.includes('/raw/upload') || /\.pdf(\?|$)/.test(u)) return 'pdf';
  if (u.includes('/video/upload') || /\.(mp4|mov|webm|m4v|avi)(\?|$)/.test(u)) return 'video';
  if (u.includes('/image/upload') || /\.(jpe?g|png|gif|webp|bmp)(\?|$)/.test(u)) return 'image';

  return 'unknown';
}

export function mediaKindLabel(kind) {
  const map = { image: 'Imagen', video: 'Video', pdf: 'PDF', youtube: 'YouTube', unknown: 'Archivo' };
  return map[kind] || 'Archivo';
}

export function mediaKindIcon(kind) {
  const map = {
    image: 'image-outline',
    video: 'videocam-outline',
    pdf: 'document-text-outline',
    youtube: 'logo-youtube',
    unknown: 'document-outline',
  };
  return map[kind] || 'document-outline';
}

export function mediaFilenameFromUrl(url, fallback = 'archivo') {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split('/').pop() || '');
    if (last && last.includes('.')) return last;
  } catch (_) {
    /* ignore */
  }
  const base = (fallback || 'archivo').trim() || 'archivo';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function sanitizeFilename(name) {
  return String(name || 'archivo.pdf')
    .replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]/gi, '_')
    .slice(0, 120);
}

/**
 * Descarga un PDF (o abre el menú compartir / guardar en el dispositivo).
 */
export async function downloadMediaFile(url, title = 'archivo') {
  if (!url) throw new Error('No hay URL del archivo.');

  const filename = sanitizeFilename(mediaFilenameFromUrl(url, title));

  if (Platform.OS === 'web') {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo descargar el archivo.');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
    return { uri: url, filename };
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Almacenamiento no disponible en este dispositivo.');

  const localUri = `${cacheDir}${filename}`;
  const result = await FileSystem.downloadAsync(url, localUri);
  if (!result?.uri) throw new Error('No se pudo guardar el archivo.');

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      dialogTitle: title || 'PDF',
      UTI: 'com.adobe.pdf',
    });
  } else {
    const canOpen = await Linking.canOpenURL(result.uri);
    if (canOpen) await Linking.openURL(result.uri);
    else await Linking.openURL(url);
  }

  return { uri: result.uri, filename };
}

/** Abre el video en la app de YouTube o en el navegador. */
export async function openYouTubeExternal(url) {
  const watchUrl = normalizeYouTubeWatchUrl(url);
  if (!watchUrl) throw new Error('Enlace de YouTube inválido.');
  await Linking.openURL(watchUrl);
}

/** Navega al visor in-app (imagen o video). YouTube se abre fuera de la app. */
export async function openMediaViewer(navigation, { url, title, viewerRoute = 'MemberMediaViewer' }) {
  if (!url) return;
  const kind = detectMediaKind(url);
  if (kind === 'pdf') return;
  if (kind === 'youtube') {
    await openYouTubeExternal(url);
    return { kind: 'youtube', external: true };
  }
  navigation.navigate(viewerRoute, {
    url,
    title: title || 'Archivo',
    kind,
  });
  return { kind, external: false };
}

/** Imagen/video → visor; PDF → descarga; YouTube → app de YouTube. */
export async function openOrDownloadMedia(navigation, { url, title, viewerRoute = 'MemberMediaViewer' }) {
  if (!url) throw new Error('No hay URL del archivo.');
  const kind = detectMediaKind(url);
  if (kind === 'pdf') {
    await downloadMediaFile(url, title);
    return { kind: 'pdf', downloaded: true };
  }
  if (kind === 'youtube') {
    await openYouTubeExternal(url);
    return { kind: 'youtube', downloaded: false, external: true };
  }
  await openMediaViewer(navigation, { url, title, viewerRoute });
  return { kind, downloaded: false, external: false };
}
