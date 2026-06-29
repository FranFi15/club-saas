import { useContext, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { ThemeContext } from '../context/ThemeContext';
import { navigationRef } from '../navigation/navigationRef';

/** Keeps Android/iOS system bars aligned with app light/dark theme. */
export default function AndroidSystemChrome() {
  const { theme, isDarkMode } = useContext(ThemeContext);
  const statusStyle = isDarkMode ? 'light' : 'dark';

  const applyChrome = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        StatusBar.setStatusBarTranslucent(false);
        StatusBar.setStatusBarBackgroundColor(theme.background, true);
        StatusBar.setStatusBarStyle(statusStyle, true);
      } catch {
        // noop
      }

      try {
        await SystemUI.setBackgroundColorAsync(theme.background);
      } catch {
        // noop
      }

      try {
        NavigationBar.setStyle(isDarkMode ? 'dark' : 'light');
      } catch {
        // noop
      }

      try {
        await NavigationBar.setButtonStyleAsync(isDarkMode ? 'light' : 'dark');
      } catch {
        // noop
      }
      return;
    }

    try {
      StatusBar.setStatusBarStyle(statusStyle, true);
    } catch {
      // noop
    }
  }, [isDarkMode, statusStyle, theme.background]);

  useEffect(() => {
    applyChrome();
  }, [applyChrome]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const unsubscribe = navigationRef.addListener('state', () => {
      requestAnimationFrame(() => {
        applyChrome();
      });
    });
    return unsubscribe;
  }, [applyChrome]);

  return (
    <StatusBar
      style={statusStyle}
      backgroundColor={Platform.OS === 'android' ? theme.background : undefined}
      translucent={Platform.OS === 'android' ? false : undefined}
    />
  );
}
