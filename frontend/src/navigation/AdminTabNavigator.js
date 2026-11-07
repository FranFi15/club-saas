import React, { useContext, useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform, View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fadeStackScreenOptions } from './screenFade';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';

import EstructuraHubScreen from '../screens/admin/EstructuraHubScreen';
import EstructuraScreen from '../screens/admin/EstructuraScreen';
import CategoriasScreen from '../screens/admin/CategoriasScreen';
import DetalleCategoriaScreen from '../screens/admin/DetalleCategoriaScreen';
import CoachSessionStatsScreen from '../screens/coach/CoachSessionStatsScreen';
import UsuariosScreen from '../screens/admin/UsuariosScreen';
import InvitarFamiliaScreen from '../screens/admin/InvitarFamiliaScreen';
import EspaciosFisicosScreen from '../screens/admin/EspaciosFisicosScreen';
import GrillaEntrenamientosScreen from '../screens/admin/GrillaEntrenamientosScreen';
import AdminEnrollmentRequestsScreen from '../screens/admin/AdminEnrollmentRequestsScreen';
import AdminStatsScreen from '../screens/admin/AdminStatsScreen';
import AdminGestionHubScreen from '../screens/admin/AdminGestionHubScreen';
import AdminPendientesScreen from '../screens/admin/AdminPendientesScreen';
import AlquileresScreen from '../screens/admin/AlquileresScreen';
import AdminEventosScreen from '../screens/admin/AdminEventosScreen';
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
import { tabBadgeText } from '../utils/tabBadgeLabel';
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';
import { useAdminDesktopLayout } from '../hooks/useAdminDesktopLayout';
import AdminDesktopSidebar from '../components/AdminDesktopSidebar';

const Tab = createSwipeBottomTabNavigator();
const EstructuraStack = createNativeStackNavigator();
const GestionStack = createNativeStackNavigator();
const FinanzasStack = createNativeStackNavigator();
const PerfilStack = createNativeStackNavigator();

const TAB_ROOTS = {
  Estructura: 'EstructuraHome',
  Gestión: 'GestionMenu',
  Finanzas: 'FinanzasHome',
  Perfil: 'PerfilMain',
};

const DESKTOP_TAB_ROOTS = {
  Estructura: 'Estadisticas',
  Gestión: 'Pendientes',
  Finanzas: 'FinanzasHome',
  Perfil: 'PerfilMain',
};

function EstructuraStackNavigator() {
  const { isDesktop } = useAdminDesktopLayout();
  return (
    <EstructuraStack.Navigator
      initialRouteName={isDesktop ? DESKTOP_TAB_ROOTS.Estructura : 'EstructuraHome'}
      screenOptions={fadeStackScreenOptions}
    >
      <EstructuraStack.Screen name="EstructuraHome" component={EstructuraHubScreen} />
      <EstructuraStack.Screen name="Estadisticas" component={AdminStatsScreen} />
      <EstructuraStack.Screen name="SolicitudesInscripcion" component={AdminEnrollmentRequestsScreen} />
      <EstructuraStack.Screen name="Usuarios" component={UsuariosScreen} />
      <EstructuraStack.Screen name="InvitarFamilia" component={InvitarFamiliaScreen} />
      <EstructuraStack.Screen name="EstructuraDeportiva" component={EstructuraScreen} />
      <EstructuraStack.Screen name="Categorias" component={CategoriasScreen} />
      <EstructuraStack.Screen name="DetalleCategoria" component={DetalleCategoriaScreen} />
      <EstructuraStack.Screen name="CoachSessionStats" component={CoachSessionStatsScreen} />
      <EstructuraStack.Screen name="Espacios" component={EspaciosFisicosScreen} />
      <EstructuraStack.Screen name="Grilla" component={GrillaEntrenamientosScreen} />
    </EstructuraStack.Navigator>
  );
}

function GestionStackNavigator() {
  const { isDesktop } = useAdminDesktopLayout();
  return (
    <GestionStack.Navigator
      initialRouteName={isDesktop ? DESKTOP_TAB_ROOTS.Gestión : 'GestionMenu'}
      screenOptions={fadeStackScreenOptions}
    >
      <GestionStack.Screen name="GestionMenu" component={AdminGestionHubScreen} />
      <GestionStack.Screen name="Pendientes" component={AdminPendientesScreen} />
      <GestionStack.Screen name="Alquileres" component={AlquileresScreen} />
      <GestionStack.Screen name="Eventos" component={AdminEventosScreen} />
      <GestionStack.Screen name="Noticias" component={NoticiasScreen} />
      <GestionStack.Screen name="PedirDocumentacion" component={AdminRequestDocScreen} />
      <GestionStack.Screen name="EscanearIngreso" component={AdminClubEntryScanScreen} />
      <GestionStack.Screen
        name="EscanearEvento"
        component={AdminClubEntryScanScreen}
        initialParams={{ gate: 'event' }}
      />
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
    <FinanzasStack.Navigator screenOptions={fadeStackScreenOptions}>
      <FinanzasStack.Screen name="FinanzasHome" component={FinanzasScreen} />
    </FinanzasStack.Navigator>
  );
}

function PerfilStackNavigator() {
  return (
    <PerfilStack.Navigator screenOptions={fadeStackScreenOptions}>
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
  const { isDesktop } = useAdminDesktopLayout();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const tabNavRef = useRef(null);
  const [tabState, setTabState] = useState(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const insets = useSafeAreaInsets();
  const tabBottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10);
  const tabBarHeight = 64 + tabBottomPad;

  const syncTabNav = useCallback((navigation) => {
    if (!navigation) return;
    tabNavRef.current = navigation;
    setTabState(navigation.getState?.() ?? null);
  }, []);

  const navigateTab = useCallback((tabName, rootScreen, params) => {
    const nav = tabNavRef.current;
    if (!nav) return;
    const root =
      rootScreen ||
      (isDesktop ? DESKTOP_TAB_ROOTS[tabName] : null) ||
      TAB_ROOTS[tabName];
    const screenParams = params || (tabName === 'Finanzas' ? { initialTab: 'atletas' } : undefined);
    if (!root) {
      nav.navigate(tabName);
    } else {
      nav.navigate(tabName, screenParams ? { screen: root, params: screenParams } : { screen: root });
    }
    requestAnimationFrame(() => syncTabNav(nav));
  }, [syncTabNav, isDesktop]);

  const navigateScreen = useCallback((tabName, screen, params) => {
    const nav = tabNavRef.current;
    if (!nav || !tabName || !screen) return;
    nav.navigate(tabName, params ? { screen, params } : { screen });
    requestAnimationFrame(() => syncTabNav(nav));
  }, [syncTabNav]);

  const baseOptions = buildSwipeBottomTabOptions({
    colorMarca,
    theme,
    tabBarHeight,
    tabBottomPad,
    paddingHorizontal: 4,
    getIcon: (name, focused, color) => {
      let iconName = 'ellipse-outline';
      if (name === 'Estructura') iconName = focused ? 'business' : 'business-outline';
      if (name === 'Gestión') iconName = focused ? 'briefcase' : 'briefcase-outline';
      if (name === 'Finanzas') iconName = focused ? 'cash' : 'cash-outline';
      if (name === 'Perfil') iconName = focused ? 'person' : 'person-outline';
      return <Ionicons name={iconName} size={22} color={color} />;
    },
    getBadge: (name) =>
      ({
        Estructura: tabBadgeText(tab('estructura')),
        Gestión: tabBadgeText(tab('gestion')),
        Finanzas: tabBadgeText(tab('finanzas')),
      })[name],
    getLabel: (name) =>
      ({
        Estructura: 'Estructura',
        Gestión: 'Gestión',
        Finanzas: 'Finanzas',
        Perfil: 'Perfil',
      })[name],
  });

  const tabs = (
    <Tab.Navigator
      key={`${isDarkMode ? 'dark' : 'light'}-${isDesktop ? 'desk' : 'phone'}`}
      tabBarPosition="bottom"
      tabBar={isDesktop ? () => null : undefined}
      screenOptions={(props) => {
        const options = baseOptions(props);
        if (!isDesktop) return options;
        return {
          ...options,
          swipeEnabled: false,
          tabBarStyle: {
            ...options.tabBarStyle,
            display: 'none',
            height: 0,
            minHeight: 0,
            overflow: 'hidden',
            opacity: 0,
            paddingTop: 0,
            paddingBottom: 0,
            borderTopWidth: 0,
          },
        };
      }}
      screenListeners={({ navigation }) => ({
        state: () => syncTabNav(navigation),
        focus: () => syncTabNav(navigation),
      })}
    >
      <Tab.Screen
        name="Estructura"
        component={EstructuraStackNavigator}
        listeners={tabPressResetToRoot(
          'Estructura',
          isDesktop ? DESKTOP_TAB_ROOTS.Estructura : 'EstructuraHome',
        )}
      />
      <Tab.Screen
        name="Gestión"
        component={GestionStackNavigator}
        listeners={tabPressResetToRoot(
          'Gestión',
          isDesktop ? DESKTOP_TAB_ROOTS.Gestión : 'GestionMenu',
        )}
      />
      <Tab.Screen
        name="Finanzas"
        component={FinanzasStackNavigator}
        listeners={tabPressResetToRoot('Finanzas', 'FinanzasHome')}
      />
      <Tab.Screen
        name="Perfil"
        component={PerfilStackNavigator}
        listeners={tabPressResetToRoot('Perfil', 'PerfilMain')}
      />
    </Tab.Navigator>
  );

  if (!isDesktop) return tabs;

  return (
    <View style={[styles.desktopShell, { backgroundColor: theme.background }]}>
      <AdminDesktopSidebar
        tabState={tabState}
        onNavigateTab={navigateTab}
        onNavigateScreen={navigateScreen}
      />
      <View style={styles.desktopContent}>{tabs}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  desktopContent: {
    flex: 1,
    minWidth: 0,
  },
});
