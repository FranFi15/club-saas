// src/navigation/AppNavigator.js
import React, { useContext, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import WorkspaceSearchScreen from '../screens/WorkspaceSearchScreen';
import LoginScreen from '../screens/LoginScreen';
import TermsAcceptanceScreen from '../screens/TermsAcceptanceScreen';
import MemberPlaceholderScreen from '../screens/staff/MemberPlaceholderScreen';
import AdminTabNavigator from './AdminTabNavigator';
import ControlIngresoNavigator from './ControlIngresoNavigator';
import ColaboradorTabNavigator from './ColaboradorTabNavigator';
import StaffTabNavigator from './StaffTabNavigator';
import CoachTabNavigator from './CoachTabNavigator';
import AthleteTabNavigator from './AthleteTabNavigator';
import TutorTabNavigator from './TutorTabNavigator';
import SocioTabNavigator from './SocioTabNavigator';
import { navigationRef } from './navigationRef';
import PushNotificationHandler from '../components/PushNotificationHandler';
import PushNotificationPrompt from '../components/PushNotificationPrompt';
import MercadoPagoDeepLinkHandler from '../components/MercadoPagoDeepLinkHandler';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { buildNavigationTheme } from './buildNavigationTheme';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { clubData, clubHydrated, sessionHydrated, bootRoute } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const navigationTheme = useMemo(
    () => buildNavigationTheme(theme, isDarkMode),
    [theme, isDarkMode],
  );

  if (!clubHydrated || !sessionHydrated) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const initialRoute =
    bootRoute || (clubData?.urlIdentifier ? 'Login' : 'WorkspaceSearch');

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <PushNotificationHandler />
      <PushNotificationPrompt />
      <MercadoPagoDeepLinkHandler />
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="WorkspaceSearch" component={WorkspaceSearchScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="TermsAcceptance" component={TermsAcceptanceScreen} />
        <Stack.Screen name="AdminHome" component={AdminTabNavigator} />
        <Stack.Screen name="ControlIngresoHome" component={ControlIngresoNavigator} />
        <Stack.Screen name="ColaboradorHome" component={ColaboradorTabNavigator} />
        <Stack.Screen name="StaffHome" component={StaffTabNavigator} />
        <Stack.Screen name="CoachHome" component={CoachTabNavigator} />
        <Stack.Screen name="AthleteHome" component={AthleteTabNavigator} />
        <Stack.Screen name="TutorHome" component={TutorTabNavigator} />
        <Stack.Screen name="SocioHome" component={SocioTabNavigator} />
        <Stack.Screen name="MemberPlaceholder" component={MemberPlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
