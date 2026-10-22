import { useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';
import { navigationRef } from '../navigation/navigationRef';
import { isAuthRouteName, statusBarStyleForColor } from '../utils/statusBarContrast';

/** Status bar sits on the brand header. Android nav buttons follow the tab bar. */
export default function AndroidSystemChrome() {
  const { theme, isDarkMode } = useContext(ThemeContext);
  const club = useContext(ClubContext);
  const brand = club?.clubData?.primaryColor || '#1c1c1c';
  const [routeName, setRouteName] = useState('');
  const onAuth = isAuthRouteName(routeName);
  const expoStyle = onAuth
    ? (isDarkMode ? 'light' : 'dark')
    : (statusBarStyleForColor(brand) === 'dark-content' ? 'dark' : 'light');

  const applyChrome = useCallback(async () => {
    const routeName = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : '';
    const onAuth = isAuthRouteName(routeName);
    const barStyle = onAuth
      ? (isDarkMode ? 'light' : 'dark')
      : (statusBarStyleForColor(brand) === 'dark-content' ? 'dark' : 'light');
    const navButtons = isDarkMode ? 'light' : 'dark';

    if (Platform.OS === 'android') {
      try {
        StatusBar.setStatusBarTranslucent(true);
        StatusBar.setStatusBarBackgroundColor('transparent', true);
        StatusBar.setStatusBarStyle(barStyle, true);
      } catch {
        // noop
      }

      try {
        await SystemUI.setBackgroundColorAsync(theme.surface || theme.background);
      } catch {
        // noop
      }

      try {
        NavigationBar.setStyle(isDarkMode ? 'dark' : 'light');
      } catch {
        // noop
      }

      try {
        await NavigationBar.setButtonStyleAsync(navButtons);
      } catch {
        // noop
      }
      return;
    }

    try {
      StatusBar.setStatusBarStyle(barStyle, true);
    } catch {
      // noop
    }
  }, [brand, isDarkMode, theme.background, theme.surface]);

  useEffect(() => {
    applyChrome();
  }, [applyChrome]);

  useEffect(() => {
    const syncRoute = () => {
      if (!navigationRef.isReady()) return;
      setRouteName(navigationRef.getCurrentRoute()?.name || '');
    };
    syncRoute();
    const unsubscribe = navigationRef.addListener?.('state', () => {
      requestAnimationFrame(() => {
        syncRoute();
        applyChrome();
      });
    });
    return unsubscribe;
  }, [applyChrome]);

  return (
    <StatusBar
      style={expoStyle}
      backgroundColor={Platform.OS === 'android' ? 'transparent' : undefined}
      translucent={Platform.OS === 'android' ? true : undefined}
    />
  );
}
