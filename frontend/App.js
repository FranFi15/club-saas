import 'react-native-gesture-handler';
import './src/services/pushNotifications';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClubProvider } from './src/context/ClubContext';
import { BadgeProvider } from './src/context/BadgeContext';
import MemberRoot from './src/context/MemberRoot';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import AndroidSystemChrome from './src/components/AndroidSystemChrome';

const sentryDsn =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  Constants.expoConfig?.extra?.sentryDsn ||
  '';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? 'development' : 'production'),
    tracesSampleRate: 0.1,
    enableAutoSessionTracking: true,
  });
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AndroidSystemChrome />
          <ClubProvider>
            <BadgeProvider>
              <MemberRoot>
                <AppNavigator />
              </MemberRoot>
            </BadgeProvider>
          </ClubProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default sentryDsn ? Sentry.wrap(App) : App;
