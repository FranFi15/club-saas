import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { clubApi } from './api';
import { CLUB_API_BASE } from './apiConfig';
import { clubHeaders } from '../screens/athlete/athleteApi';

/**
 * En Android, content:// no siempre funciona con FormData; copiamos a caché.
 */
async function ensureUploadableUri(uri, filename) {
  if (Platform.OS === 'web' || !uri) return uri;

  if (uri.startsWith('file://')) return uri;

  const safeName = String(filename || 'upload').replace(/[^\w.\-]/gi, '_');
  const dest = `${FileSystem.cacheDirectory}${Date.now()}_${safeName}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    if (uri.startsWith('content://') || uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
      throw new Error('No se pudo leer la imagen. Probá sacar una foto o elegir otra de la galería.');
    }
    if (uri.startsWith('/')) return `file://${uri}`;
    return uri;
  }
}

/**
 * Construye el valor que FormData espera según la plataforma.
 * En web hace falta un File/Blob real; { uri, name, type } solo funciona en native.
 */
async function buildFormFilePart(uri, filename, mime, webFile) {
  const safeName = filename || `archivo-${Date.now()}`;
  const safeMime = mime || 'application/octet-stream';

  if (Platform.OS === 'web') {
    if (webFile instanceof File) {
      const type = webFile.type || safeMime;
      if (webFile.name === safeName && type === webFile.type) return webFile;
      return new File([webFile], safeName, { type });
    }
    if (webFile instanceof Blob) {
      return new File([webFile], safeName, { type: webFile.type || safeMime });
    }
    if (!uri) {
      throw new Error('No se pudo leer el archivo seleccionado.');
    }
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error('No se pudo leer el archivo seleccionado.');
    }
    const blob = await res.blob();
    return new File([blob], safeName, { type: safeMime || blob.type || 'application/octet-stream' });
  }

  const resolvedUri = await ensureUploadableUri(uri, safeName);
  return {
    uri: resolvedUri,
    name: safeName,
    type: safeMime,
  };
}

function uploadErrorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message) {
    if (/network error|network request failed|failed to fetch/i.test(error.message)) {
      return 'No se pudo conectar al servidor. Verificá que el backend esté activo y en la misma red.';
    }
    return error.message;
  }
  return 'No se pudo subir el archivo.';
}

async function postMultipartUpload(authHeaders, formData) {
  const uploadHeaders = {
    'x-club-identifier': authHeaders['x-club-identifier'],
    Authorization: authHeaders.Authorization,
  };

  if (Platform.OS === 'web') {
    const response = await clubApi.post('/upload', formData, {
      headers: uploadHeaders,
      timeout: 120000,
      transformRequest: (data, hdrs) => {
        if (typeof FormData !== 'undefined' && data instanceof FormData) {
          delete hdrs['Content-Type'];
        }
        return data;
      },
    });
    return response.data || {};
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(`${CLUB_API_BASE}/upload`, {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
      signal: controller.signal,
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const err = new Error(data.message || `Error ${res.status} al subir el archivo.`);
      err.response = { status: res.status, data };
      throw err;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La subida tardó demasiado. Probá con un archivo más chico.');
    }
    if (!error.response && /network|fetch/i.test(String(error.message))) {
      throw new Error(
        'No se pudo conectar al servidor. Verificá que el backend esté activo y en la misma red.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sube un archivo al club vía POST /api/upload (Cloudinary).
 * @param {object} [options]
 * @param {File|Blob} [options.webFile] — File del picker en web (DocumentPicker.asset.file)
 * @returns {{ url, format?, resourceType?, publicId? }}
 */
export async function uploadFileToClub(clubData, uri, filename, mime, options = {}) {
  const webFile =
    options instanceof File || options instanceof Blob
      ? options
      : options?.webFile;

  if (!clubData?.urlIdentifier) {
    throw new Error('No se encontró el club activo. Volvé a buscar tu club.');
  }

  const headers = await clubHeaders(clubData);
  if (!headers.Authorization?.startsWith('Bearer ')) {
    throw new Error('Sesión expirada. Volvé a iniciar sesión.');
  }

  const formData = new FormData();
  try {
    const filePart = await buildFormFilePart(uri, filename, mime, webFile);
    formData.append('archivo', filePart);
    const data = await postMultipartUpload(headers, formData);
    const url = data.url || data.secureUrl;
    if (!url) {
      throw new Error(data.message || 'No se recibió la URL del archivo.');
    }
    return { ...data, url };
  } catch (error) {
    throw new Error(uploadErrorMessage(error));
  }
}

/** File/Blob del asset de DocumentPicker o ImagePicker en web. */
export function pickWebFile(asset, pickerResult) {
  if (Platform.OS !== 'web') return undefined;
  if (asset?.file instanceof File) return asset.file;
  const fromOutput = pickerResult?.output?.[0];
  if (fromOutput instanceof File) return fromOutput;
  return undefined;
}

/** Nombre y MIME correctos para fotos del picker (incluye HEIC de iOS). */
export function imageFromPickerAsset(asset, uri) {
  const uriPart = uri?.split('/').pop()?.split('?')[0];
  const filename = asset?.fileName || uriPart || `imagen-${Date.now()}.jpg`;
  const lower = filename.toLowerCase();
  let mime = asset?.mimeType || '';

  if (!mime) {
    if (lower.endsWith('.png')) mime = 'image/png';
    else if (lower.endsWith('.webp')) mime = 'image/webp';
    else if (lower.endsWith('.gif')) mime = 'image/gif';
    else if (lower.endsWith('.heic')) mime = 'image/heic';
    else if (lower.endsWith('.heif')) mime = 'image/heif';
    else mime = 'image/jpeg';
  }

  return { filename, mime };
}
