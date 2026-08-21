import { Platform, Linking } from 'react-native';
import { clubApi } from './api';

/**
 * Descarga el comprobante PDF vía API autenticada (base64) y lo abre/guarda.
 * Evita 401 de Cloudinary al abrir la URL en una pestaña nueva.
 */
export async function downloadPaymentReceipt({ paymentId, headers, onError }) {
  const { data } = await clubApi.get(`/financial/payments/${paymentId}/recibo`, { headers });
  const base64 = data?.base64;
  const filename = data?.filename || `comprobante-${paymentId}.pdf`;
  const mimeType = data?.mimeType || 'application/pdf';

  if (!base64) {
    throw new Error('El servidor no devolvió el PDF del comprobante.');
  }

  if (Platform.OS === 'web') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
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

  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const path = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType?.Base64 || 'base64',
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType,
      dialogTitle: 'Comprobante de pago',
      UTI: 'com.adobe.pdf',
    });
  } else {
    const opened = await Linking.openURL(path);
    if (!opened && onError) onError('No se pudo abrir el archivo del comprobante.');
  }

  return { filename, path };
}
