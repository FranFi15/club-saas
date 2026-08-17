import React, { useContext, useEffect, useState } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import StaffDashboardScreen from '../screens/staff/StaffDashboardScreen';
import StaffProfileScreen from '../screens/staff/StaffProfileScreen';
import { createProfileStack } from './createProfileStack';
import NoticiasScreen from '../screens/admin/NoticiasScreen';
import GrillaEntrenamientosScreen from '../screens/admin/GrillaEntrenamientosScreen';
import PreparadorTabNavigator from './PreparadorTabNavigator';
import NutricionistaTabNavigator from './NutricionistaTabNavigator';
import PsicologoTabNavigator from './PsicologoTabNavigator';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { getToken } from '../utils/storage';

const Tab = createBottomTabNavigator();
const StaffHomeStackNavigator = createNativeStackNavigator();
const StaffProfileStackNav = createProfileStack(StaffProfileScreen);

function StaffWorkStackNav() {
  return (
    <StaffHomeStackNavigator.Navigator screenOptions={{ headerShown: false }}>
      <StaffHomeStackNavigator.Screen name="StaffDashboard" component={StaffDashboardScreen} />
      <StaffHomeStackNavigator.Screen
        name="NoticiasStaff"
        component={NoticiasScreen}
        initialParams={{ embeddedStaff: true }}
      />
      <StaffHomeStackNavigator.Screen
        name="Agenda"
        component={GrillaEntrenamientosScreen}
        initialParams={{ embeddedStaff: true }}
      />
    </StaffHomeStackNavigator.Navigator>
  );
}

function DefaultStaffTabs({ clubData, theme, isDarkMode }) {
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const insets = useSafeAreaInsets();
  const tabBottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10);
  const tabBarHeight = 64 + tabBottomPad;

  return (
    <Tab.Navigator
      key={isDarkMode ? 'dark' : 'light'}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colorMarca,
        tabBarInactiveTintColor: theme.icon,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          elevation: 12,
          height: tabBarHeight,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: tabBottomPad,
          minHeight: tabBarHeight,
        },
        tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'StaffInicio') {
            return <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />;
          }
          return (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={24}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="StaffInicio"
        component={StaffWorkStackNav}
        options={{ tabBarLabel: 'Inicio' }}
        listeners={tabPressResetToRoot('StaffInicio', 'StaffDashboard')}
      />
      <Tab.Screen name="StaffPerfil" component={StaffProfileStackNav} options={{ tabBarLabel: 'Perfil' }} />
    </Tab.Navigator>
  );
}

export default function StaffTabNavigator() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const [staffRol, setStaffRol] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getToken('userRol');
      if (!cancelled) setStaffRol(r || '');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (staffRol === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={clubData?.primaryColor || '#3b82f6'} />
      </View>
    );
  }

  if (staffRol === 'preparador_fisico') {
    return <PreparadorTabNavigator />;
  }

  if (staffRol === 'nutricionista') {
    return <NutricionistaTabNavigator />;
  }

  if (staffRol === 'psicologo') {
    return <PsicologoTabNavigator />;
  }

  return <DefaultStaffTabs clubData={clubData} theme={theme} isDarkMode={isDarkMode} />;
}
