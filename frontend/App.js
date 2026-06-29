// App.js
import 'react-native-gesture-handler'; // <-- ESTO DEBE SER OBLIGATORIAMENTE LA PRIMERA LÍNEA
import './src/services/pushNotifications';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // <-- NUEVO IMPORT
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClubProvider } from './src/context/ClubContext';
import { BadgeProvider } from './src/context/BadgeContext';
import MemberRoot from './src/context/MemberRoot';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import AndroidSystemChrome from './src/components/AndroidSystemChrome';

export default function App() {
  return (
    // Envolvemos todo para que el celular reconozca cuando deslizamos el dedo
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