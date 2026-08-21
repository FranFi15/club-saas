import { Platform, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadFileToClub, pickWebFile, imageFromPickerAsset } from '../../../utils/uploadMedia';

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
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    uri = asset.uri;
    filename = asset.name || `archivo-${Date.now()}`;
    mime = asset.mimeType || (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    webFile = pickWebFile(asset, result);
  } else {
    const choice = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (choice.canceled || !choice.assets?.length) return null;
    const asset = choice.assets[0];
    uri = asset.uri;
    filename = asset.name || `archivo-${Date.now()}`;
    mime = asset.mimeType || (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  }

  const { url } = await uploadFileToClub(clubData, uri, filename, mime, { webFile });
  return url;
}

export async function pickAndUploadImage(clubData) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Necesitamos permiso para acceder a la galería.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    ...(Platform.OS === 'ios' && ImagePicker.UIImagePickerPresentationStyle
      ? { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }
      : {}),
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const uri = asset.uri;
  const { filename, mime } = imageFromPickerAsset(asset, uri);
  const { url } = await uploadFileToClub(clubData, uri, filename, mime, {
    webFile: pickWebFile(asset, result),
  });
  return url;
}

export async function openAttachmentUrl(url) {
  if (!url) return;
  const can = await Linking.canOpenURL(url);
  if (!can) throw new Error('No se pudo abrir el archivo.');
  await Linking.openURL(url);
}
