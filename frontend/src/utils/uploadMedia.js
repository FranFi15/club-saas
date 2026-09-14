import { Platform } from 'react-native';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { File as ExpoFile, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { clubApi } from './api';
import { CLUB_API_BASE } from './apiConfig';
import { clubHeaders } from '../screens/athlete/athleteApi';

/**
 * On iOS, prefer a JPEG/PNG representation of Photos (HEIC → compatible).
 * Avoids upload / preview failures with native HEIC.
 */
export function iosCompatiblePhotoOptions() {
  if (Platform.OS !== 'ios') return {};
  const mode = ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible;
  return mode ? { preferredAssetRepresentationMode: mode } : {};
}

function toFileUri(uri) {
  if (!uri) return uri;
  if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://')) return uri;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

/**
 * En Android, content:// no siempre es legible; copiamos a caché file://.
 */
async function ensureUploadableUri(uri, filename) {
  if (Platform.OS === 'web' || !uri) return uri;

  const normalized = toFileUri(uri);
  if (normalized.startsWith('file://')) return normalized;

  const safeName = String(filename || 'upload').replace(/[^\w.\-]/gi, '_');
  const dest = `${LegacyFileSystem.cacheDirectory}${Date.now()}_${safeName}`;
  try {
    await LegacyFileSystem.copyAsync({ from: normalized, to: dest });
    return dest;
  } catch {
    if (
      normalized.startsWith('content://') ||
      normalized.startsWith('ph://') ||
      normalized.startsWith('assets-library://')
    ) {
      throw new Error('No se pudo leer la imagen. Probá sacar una foto o elegir otra de la galería.');
    }
    return toFileUri(uri);
  }
}

/**
 * Construye File/Blob para web. En native usamos expo-file-system File.upload.
 */
async function buildWebFilePart(uri, filename, mime, webFile) {
  const safeName = filename || `archivo-${Date.now()}`;
  const safeMime = mime || 'application/octet-stream';
  const BrowserFile = globalThis.File;

  if (BrowserFile && webFile instanceof BrowserFile) {
    const type = webFile.type || safeMime;
    if (webFile.name === safeName && type === webFile.type) return webFile;
    return new BrowserFile([webFile], safeName, { type });
  }
  if (typeof Blob !== 'undefined' && webFile instanceof Blob) {
    if (!BrowserFile) return webFile;
    return new BrowserFile([webFile], safeName, { type: webFile.type || safeMime });
  }
  if (!uri) {
    throw new Error('No se pudo leer el archivo seleccionado.');
  }
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error('No se pudo leer el archivo seleccionado.');
  }
  const blob = await res.blob();
  if (!BrowserFile) return blob;
  return new BrowserFile([blob], safeName, { type: safeMime || blob.type || 'application/octet-stream' });
}

function uploadErrorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message) {
    if (/network error|network request failed|failed to fetch/i.test(error.message)) {
      return 'No se pudo conectar al servidor. Verificá que el backend esté activo y en la misma red.';
    }
    if (/Unsupported FormDataPart/i.test(error.message)) {
      return 'No se pudo preparar el archivo para subir. Probá otra foto o reiniciá la app.';
    }
    return error.message;
  }
  return 'No se pudo subir el archivo.';
}

function parseUploadJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

async function postMultipartUploadWeb(authHeaders, formData) {
  const uploadHeaders = {
    'x-club-identifier': authHeaders['x-club-identifier'],
    Authorization: authHeaders.Authorization,
  };

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

/**
 * Native uploads must not use React Native's `{ uri, name, type }` FormData parts —
 * Expo's winter fetch rejects them with "Unsupported FormDataPart implementation".
 * Use expo-file-system File multipart upload instead.
 */
async function postMultipartUploadNative(authHeaders, uri, filename, mime) {
  const resolvedUri = await ensureUploadableUri(uri, filename);
  const file = new ExpoFile(resolvedUri);
  if (!file.exists) {
    throw new Error('No se pudo leer el archivo seleccionado.');
  }

  const result = await file.upload(`${CLUB_API_BASE}/upload`, {
    uploadType: UploadType.MULTIPART,
    fieldName: 'archivo',
    httpMethod: 'POST',
    mimeType: mime || 'application/octet-stream',
    headers: {
      'x-club-identifier': authHeaders['x-club-identifier'],
      Authorization: authHeaders.Authorization,
    },
  });

  const data = parseUploadJson(result?.body);
  if (!result || result.status < 200 || result.status >= 300) {
    const err = new Error(data.message || `Error ${result?.status || '?'} al subir el archivo.`);
    err.response = { status: result?.status, data };
    throw err;
  }
  return data;
}

/**
 * Sube un archivo al club vía POST /api/upload (Cloudinary).
 * @param {object} [options]
 * @param {File|Blob} [options.webFile] — File del picker en web (DocumentPicker.asset.file)
 * @returns {{ url, format?, resourceType?, publicId? }}
 */
export async function uploadFileToClub(clubData, uri, filename, mime, options = {}) {
  const BrowserFile = globalThis.File;
  const webFile =
    (BrowserFile && options instanceof BrowserFile) ||
    (typeof Blob !== 'undefined' && options instanceof Blob)
      ? options
      : options?.webFile;

  if (!clubData?.urlIdentifier) {
    throw new Error('No se encontró el club activo. Volvé a buscar tu club.');
  }

  const headers = await clubHeaders(clubData);
  if (!headers.Authorization?.startsWith('Bearer ')) {
    throw new Error('Sesión expirada. Volvé a iniciar sesión.');
  }

  try {
    let data;
    if (Platform.OS === 'web') {
      const formData = new FormData();
      const filePart = await buildWebFilePart(uri, filename, mime, webFile);
      formData.append('archivo', filePart);
      data = await postMultipartUploadWeb(headers, formData);
    } else {
      data = await postMultipartUploadNative(headers, uri, filename, mime);
    }

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
  const BrowserFile = globalThis.File;
  if (BrowserFile && asset?.file instanceof BrowserFile) return asset.file;
  const fromOutput = pickerResult?.output?.[0];
  if (BrowserFile && fromOutput instanceof BrowserFile) return fromOutput;
  return undefined;
}

/** Nombre y MIME correctos para fotos del picker (incluye HEIC/HEIF de iPhone). */
export function imageFromPickerAsset(asset, uri) {
  const uriPart = uri?.split('/').pop()?.split('?')[0] || '';
  let filename = asset?.fileName || asset?.name || uriPart || `imagen-${Date.now()}.jpg`;
  const lowerName = filename.toLowerCase();
  const lowerUri = String(uri || '').toLowerCase();
  let mime = String(asset?.mimeType || '').toLowerCase();

  const looksHeic =
    mime.includes('heic') ||
    mime.includes('heif') ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif') ||
    /\.hei[cf](\?|$)/i.test(lowerUri);

  if (!mime || mime === 'application/octet-stream' || mime === 'application/heic') {
    if (looksHeic) {
      mime = lowerName.endsWith('.heif') || lowerUri.includes('.heif') ? 'image/heif' : 'image/heic';
    } else if (lowerName.endsWith('.png') || lowerUri.includes('.png')) mime = 'image/png';
    else if (lowerName.endsWith('.webp') || lowerUri.includes('.webp')) mime = 'image/webp';
    else if (lowerName.endsWith('.gif') || lowerUri.includes('.gif')) mime = 'image/gif';
    else mime = 'image/jpeg';
  }

  // Backend also keys off the extension when MIME is blank/octet-stream.
  if (looksHeic && !/\.hei[cf]$/i.test(filename)) {
    const base = filename.replace(/\.[^.]+$/, '') || 'foto';
    filename = `${base}.heic`;
  }

  return { filename, mime };
}
