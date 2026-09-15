import { Platform, UIManager } from 'react-native';

/**
 * Android (Paper) needed this for LayoutAnimation.
 * On New Architecture it is a no-op and logs a WARN — skip it there.
 */
export function enableLayoutAnimationsIfNeeded() {
  if (Platform.OS !== 'android') return;
  if (typeof UIManager.setLayoutAnimationEnabledExperimental !== 'function') return;
  const isNewArch =
    globalThis?.RN$Bridgeless === true || Boolean(globalThis?.nativeFabricUIManager);
  if (isNewArch) return;
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
