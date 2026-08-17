import React, { useContext, useCallback, useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';

import EstructuraHubScreen from '../screens/admin/EstructuraHubScreen';
import EstructuraScreen from '../screens/admin/EstructuraScreen';
import CategoriasScreen from '../screens/admin/CategoriasScreen';
import DetalleCategoriaScreen from '../screens/admin/DetalleCategoriaScreen';
import UsuariosScreen from '../screens/admin/UsuariosScreen';
import EspaciosFisicosScreen from '../screens/admin/EspaciosFisicosScreen';
import GrillaEntrenamientosScreen from '../screens/admin/GrillaEntrenamientosScreen';
import AdminEnrollmentRequestsScreen from '../screens/admin/AdminEnrollmentRequestsScreen';
import AdminStatsScreen from '../screens/admin/AdminStatsScreen';
import AdminGestionHubScreen from '../screens/admin/AdminGestionHubScreen';
import AdminPendientesScreen from '../screens/admin/AdminPendientesScreen';
import AlquileresScreen from '../screens/admin/AlquileresScreen';
import NoticiasScreen from '../screens/admin/NoticiasScreen';
import AdminRequestDocScreen from '../screens/admin/AdminRequestDocScreen';
import AdminClubEntryScanScreen from '../screens/admin/AdminClubEntryScanScreen';
import CoachTeamDocumentsScreen from '../screens/coach/CoachTeamDocumentsScreen';
import MemberMediaViewerScreen from '../screens/member/MemberMediaViewerScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';
import FinanzasScreen from '../screens/admin/FinanzasScreen';
import AdminProfileScreen from '../screens/admin/AdminProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import MemberClubEntryScreen from '../screens/member/MemberClubEntryScreen';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeLabel } from '../utils/tabBadgeLabel';
import { getToken } from '../utils/storage';
import { isClubOwnerRole } from '../constants/appRoles';

const Tab = createBottomTabNavigator();
const EstructuraStack = createNativeStackNavigator();
const GestionStack = createNativeStackNavigator();
const FinanzasStack = createNativeStackNavigator();
const PerfilStack = createNativeStackNavigator();

function EstructuraStackNavigator() {
  return (
    <EstructuraStack.Navigator screenOptions={{ headerShown: false }}>
      <EstructuraStack.Screen name="EstructuraHome" component={EstructuraHubScreen} />
      <EstructuraStack.Screen name="Estadisticas" component={AdminStatsScreen} />
      <EstructuraStack.Screen name="SolicitudesInscripcion" component={AdminEnrollmentRequestsScreen} />
      <EstructuraStack.Screen name="Usuarios" component={UsuariosScreen} />
      <EstructuraStack.Screen name="EstructuraDeportiva" component={EstructuraScreen} />
      <EstructuraStack.Screen name="Categorias" component={CategoriasScreen} />
      <EstructuraStack.Screen name="DetalleCategoria" component={DetalleCategoriaScreen} />
      <EstructuraStack.Screen name="Espacios" component={EspaciosFisicosScreen} />
      <EstructuraStack.Screen name="Grilla" component={GrillaEntrenamientosScreen} />
      <EstructuraStack.Screen name="EscanearIngreso" component={AdminClubEntryScanScreen} />
      <EstructuraStack.Screen name="Alquileres" component={AlquileresScreen} />
    </EstructuraStack.Navigator>
  );
}

function GestionStackNavigator() {
  return (
    <GestionStack.Navigator screenOptions={{ headerShown: false }}>
      <GestionStack.Screen name="GestionMenu" component={AdminGestionHubScreen} />
      <GestionStack.Screen name="Pendientes" component={AdminPendientesScreen} />
      <GestionStack.Screen name="Alquileres" component={AlquileresScreen} />
      <GestionStack.Screen name="Noticias" component={NoticiasScreen} />
      <GestionStack.Screen name="PedirDocumentacion" component={AdminRequestDocScreen} />
      <GestionStack.Screen name="EscanearIngreso" component={AdminClubEntryScanScreen} />
      <GestionStack.Screen
        name="RevisarDocumentacion"
        component={CoachTeamDocumentsScreen}
        initialParams={{ variant: 'admin' }}
      />
      <GestionStack.Screen name="CoachMediaViewer" component={MemberMediaViewerScreen} />
      <GestionStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <GestionStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <GestionStack.Screen name="ChatNew" component={ChatNewScreen} />
    </GestionStack.Navigator>
  );
}

function FinanzasStackNavigator() {
  return (
    <FinanzasStack.Navigator screenOptions={{ headerShown: false }}>
      <FinanzasStack.Screen name="FinanzasHome" component={FinanzasScreen} />
    </FinanzasStack.Navigator>
  );
}

function PerfilStackNavigator() {
  return (
    <PerfilStack.Navigator screenOptions={{ headerShown: false }}>
      <PerfilStack.Screen name="PerfilMain" component={AdminProfileScreen} />
      <PerfilStack.Screen name="EditProfile" component={EditProfileScreen} />
      <PerfilStack.Screen name="ClubEntryQr" component={MemberClubEntryScreen} />
    </PerfilStack.Navigator>
  );
}

export default function AdminTabNavigator() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { tab, refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [viewerRol, setViewerRol] = useState('');

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  const estructuraTabLabel = isClubOwnerRole(viewerRol) ? 'Estructura' : 'Operaciones';

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
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
          paddingHorizontal: 4,
          paddingTop: 10,
          paddingBottom: tabBottomPad,
          minHeight: tabBarHeight,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: 10, marginBottom: 2 },
        tabBarIcon: ({ focused, color }) => {
          const iconSize = 22;
          let iconName = 'ellipse-outline';
          if (route.name === 'Estructura') iconName = focused ? 'business' : 'business-outline';
          if (route.name === 'Gestión') iconName = focused ? 'briefcase' : 'briefcase-outline';
          if (route.name === 'Finanzas') iconName = focused ? 'cash' : 'cash-outline';
          if (route.name === 'Perfil') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={iconSize} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Estructura"
        component={EstructuraStackNavigator}
        options={{ tabBarLabel: estructuraTabLabel, tabBarBadge: tabBadgeLabel(tab('estructura')) }}
        listeners={tabPressResetToRoot('Estructura', 'EstructuraHome')}
      />
      <Tab.Screen
        name="Gestión"
        component={GestionStackNavigator}
        options={{ tabBarBadge: tabBadgeLabel(tab('gestion')) }}
        listeners={tabPressResetToRoot('Gestión', 'GestionMenu')}
      />
      <Tab.Screen
        name="Finanzas"
        component={FinanzasStackNavigator}
        options={{ tabBarBadge: tabBadgeLabel(tab('finanzas')) }}
        listeners={tabPressResetToRoot('Finanzas', 'FinanzasHome')}
      />
      <Tab.Screen
        name="Perfil"
        component={PerfilStackNavigator}
        listeners={tabPressResetToRoot('Perfil', 'PerfilMain')}
      />
    </Tab.Navigator>
  );
}
