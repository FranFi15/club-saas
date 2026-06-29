import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export async function copyText(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  await Clipboard.setStringAsync(value);
  return true;
}
