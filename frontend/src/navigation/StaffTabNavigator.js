import React, { useContext, useEffect, useState } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
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
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';

const Tab = createSwipeBottomTabNavigator();
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
      tabBarPosition="bottom"
      screenOptions={buildSwipeBottomTabOptions({
        colorMarca,
        theme,
        tabBarHeight,
        tabBottomPad,
        paddingHorizontal: 12,
        labelFontSize: 11,
        getIcon: (name, focused, color) => {
          if (name === 'StaffInicio') {
            return <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />;
          }
          return <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />;
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
