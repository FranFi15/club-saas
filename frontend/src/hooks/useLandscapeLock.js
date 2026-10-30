import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';

let wanted = 'portrait';

function lockFor(mode) {
  if (mode === 'landscape') {
    return Platform.OS === 'ios'
      ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
      : ScreenOrientation.OrientationLock.LANDSCAPE;
  }
  return ScreenOrientation.OrientationLock.PORTRAIT_UP;
}

function apply(mode) {
  ScreenOrientation.lockAsync(lockFor(mode)).catch(() => {});
}

/** Keeps the rest of the app portrait once iOS is allowed to rotate. */
export function lockAppPortrait() {
  if (wanted === 'landscape') return;
  wanted = 'portrait';
  apply('portrait');
}

/** Landscape while this screen is focused. The rest of the app stays portrait. */
export function useLandscapeLock() {
  useFocusEffect(
    useCallback(() => {
      wanted = 'landscape';
      apply('landscape');
      const retry = setTimeout(() => {
        if (wanted === 'landscape') apply('landscape');
      }, 350);
      return () => {
        clearTimeout(retry);
        wanted = 'portrait';
        apply('portrait');
      };
    }, []),
  );
}
