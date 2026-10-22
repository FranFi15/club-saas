import { Platform, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadFileToClub, pickWebFile, imageFromPickerAsset, iosCompatiblePhotoOptions } from '../../../utils/uploadMedia';

/** Pick image or PDF and upload to club Cloudinary. Returns URL or null if cancelled. */
export async function pickAndUploadAttachment(clubData, { preferDocument = false } = {}) {
  let uri;
  let filename;
  let mime;
  let webFile;

  if (preferDocument || Platform.OS === 'web') {
    if (Platform.OS === 'web') {
      // Document picker covers PDF + images on web
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'image/heic', 'image/heif', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    uri = asset.uri;
    filename = asset.name || `archivo-${Date.now()}`;
    mime =
      asset.mimeType ||
      (/\.hei[cf]$/i.test(filename)
        ? 'image/heic'
        : filename.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : 'image/jpeg');
    webFile = pickWebFile(asset, result);
  } else {
    const choice = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'image/heic', 'image/heif', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (choice.canceled || !choice.assets?.length) return null;
    const asset = choice.assets[0];
    uri = asset.uri;
    filename = asset.name || `archivo-${Date.now()}`;
    mime =
      asset.mimeType ||
      (/\.hei[cf]$/i.test(filename)
        ? 'image/heic'
        : filename.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : 'image/jpeg');
  }

  const { url } = await uploadFileToClub(clubData, uri, filename, mime, { webFile });
  return url;
}

/**
 * Pick an image from the gallery (no upload).
 * On web, skips native crop — use WebImageCropModal instead.
 * @returns {{ uri, filename, mime, webFile } | null}
 */
export async function pickImageAsset(opts = {}) {
  const { allowsEditing = false, aspect, quality = 0.85 } = opts;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Necesitamos permiso para acceder a la galería.');
  }
  // Native crop UI is unreliable on web; callers should crop separately.
  const useNativeEdit = allowsEditing && Platform.OS !== 'web';
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality,
    allowsEditing: useNativeEdit,
    ...(useNativeEdit && aspect ? { aspect } : {}),
    ...iosCompatiblePhotoOptions(),
    ...(Platform.OS === 'ios' && ImagePicker.UIImagePickerPresentationStyle
      ? { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }
      : {}),
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const uri = asset.uri;
  const { filename, mime } = imageFromPickerAsset(asset, uri);
  return { uri, filename, mime, webFile: pickWebFile(asset, result) };
}

/**
 * Pick an image and upload to club Cloudinary.
 * @param {object} [opts]
 * @param {boolean} [opts.allowsEditing] - native crop UI before upload (not on web)
 * @param {[number, number]} [opts.aspect] - crop aspect, e.g. [16, 9]
 * @param {number} [opts.quality]
 */
export async function pickAndUploadImage(clubData, opts = {}) {
  const picked = await pickImageAsset(opts);
  if (!picked) return null;
  const { url } = await uploadFileToClub(clubData, picked.uri, picked.filename, picked.mime, {
    webFile: picked.webFile,
  });
  return url;
}

export async function openAttachmentUrl(url) {
  if (!url) return;
  const can = await Linking.canOpenURL(url);
  if (!can) throw new Error('No se pudo abrir el archivo.');
  await Linking.openURL(url);
}
