import { Platform } from 'react-native';

/** RN Animated native driver is unavailable on web (no RCTAnimation). */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';
