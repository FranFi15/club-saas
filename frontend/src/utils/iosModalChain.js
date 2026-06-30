import { Platform } from 'react-native';

/** Evita abrir un segundo Modal en iOS antes de que el anterior termine de cerrarse. */
export function runAfterIosModalDismiss(action) {
  if (Platform.OS === 'ios') {
    setTimeout(action, 380);
  } else {
    action();
  }
}
