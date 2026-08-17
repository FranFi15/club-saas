import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import StaffProfileScreen from '../screens/staff/StaffProfileScreen';
import { createProfileStack } from './createProfileStack';
import CoachDashboardScreen from '../screens/coach/CoachDashboardScreen';
import CoachAgendaScreen from '../screens/coach/CoachAgendaScreen';
import CoachRelocateSessionsScreen from '../screens/coach/CoachRelocateSessionsScreen';
import CoachSessionDetailScreen from '../screens/coach/CoachSessionDetailScreen';
import CoachNewSessionScreen from '../screens/coach/CoachNewSessionScreen';
import CoachCancelSessionScreen from '../screens/coach/CoachCancelSessionScreen';
import CoachSessionStatsScreen from '../screens/coach/CoachSessionStatsScreen';
import CoachCategoriesScreen from '../screens/coach/CoachCategoriesScreen';
import CoachCategoryDetailScreen from '../screens/coach/CoachCategoryDetailScreen';
import CoachWellnessScreen from '../screens/coach/CoachWellnessScreen';
import CoachMeasurementScreen from '../screens/coach/CoachMeasurementScreen';
import CoachTeamDocumentsScreen from '../screens/coach/CoachTeamDocumentsScreen';
import MemberMediaViewerScreen from '../screens/member/MemberMediaViewerScreen';
import CoachCommsHubScreen from '../screens/coach/CoachCommsHubScreen';
import NoticiasScreen from '../screens/admin/NoticiasScreen';
import CoachResourceSendScreen from '../screens/coach/CoachResourceSendScreen';
import CoachRequestDocScreen from '../screens/coach/CoachRequestDocScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeLabel } from '../utils/tabBadgeLabel';

const Tab = createBottomTabNavigator();
const CoachHomeStack = createNativeStackNavigator();
const CoachSessionsStack = createNativeStackNavigator();
const CoachTeamStack = createNativeStackNavigator();
const CoachCommsStack = createNativeStackNavigator();
const CoachProfileStackNav = createProfileStack(StaffProfileScreen);

function CoachHomeStackNav() {
  return (
    <CoachHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <CoachHomeStack.Screen name="CoachDashboardMain" component={CoachDashboardScreen} />
    </CoachHomeStack.Navigator>
  );
}

function CoachSessionsStackNav() {
  return (
    <CoachSessionsStack.Navigator screenOptions={{ headerShown: false }}>
      <CoachSessionsStack.Screen name="CoachAgenda" component={CoachAgendaScreen} />
      <CoachSessionsStack.Screen name="CoachRelocateSessions" component={CoachRelocateSessionsScreen} />
      <CoachSessionsStack.Screen name="CoachSessionDetail" component={CoachSessionDetailScreen} />
      <CoachSessionsStack.Screen name="CoachNewSession" component={CoachNewSessionScreen} />
      <CoachSessionsStack.Screen name="CoachCancelSession" component={CoachCancelSessionScreen} />
      <CoachSessionsStack.Screen name="CoachSessionStats" component={CoachSessionStatsScreen} />
      <CoachSessionsStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
    </CoachSessionsStack.Navigator>
  );
}

function CoachTeamStackNav() {
  return (
    <CoachTeamStack.Navigator screenOptions={{ headerShown: false }}>
      <CoachTeamStack.Screen name="CoachCategories" component={CoachCategoriesScreen} />
      <CoachTeamStack.Screen name="CoachCategoryDetail" component={CoachCategoryDetailScreen} />
      <CoachTeamStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
      <CoachTeamStack.Screen name="CoachMeasurement" component={CoachMeasurementScreen} />
      <CoachTeamStack.Screen name="CoachTeamDocuments" component={CoachTeamDocumentsScreen} />
      <CoachTeamStack.Screen name="CoachMediaViewer" component={MemberMediaViewerScreen} />
    </CoachTeamStack.Navigator>
  );
}

function CoachCommsStackNav() {
  return (
    <CoachCommsStack.Navigator screenOptions={{ headerShown: false }}>
      <CoachCommsStack.Screen name="CoachCommsHub" component={CoachCommsHubScreen} />
      <CoachCommsStack.Screen
        name="NoticiasStaff"
        component={NoticiasScreen}
        initialParams={{ embeddedStaff: true, coachBrandedHeader: true }}
      />
      <CoachCommsStack.Screen name="CoachResourceSend" component={CoachResourceSendScreen} />
      <CoachCommsStack.Screen name="CoachRequestDoc" component={CoachRequestDocScreen} />
      <CoachCommsStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <CoachCommsStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <CoachCommsStack.Screen name="ChatNew" component={ChatNewScreen} />
    </CoachCommsStack.Navigator>
  );
}

export default function CoachTabNavigator() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { tab, refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

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
          paddingHorizontal: 8,
          paddingTop: 10,
          paddingBottom: tabBottomPad,
          minHeight: tabBarHeight,
        },
        tabBarLabelStyle: { fontSize: 10, marginBottom: 2 },
        tabBarIcon: ({ focused, color }) => {
          const map = {
            CoachInicio: focused ? 'home' : 'home-outline',
            CoachSesiones: focused ? 'calendar' : 'calendar-outline',
            CoachEquipo: focused ? 'people' : 'people-outline',
            CoachComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            CoachPerfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[route.name] || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="CoachInicio"
        component={CoachHomeStackNav}
        options={{ tabBarLabel: 'Inicio', tabBarBadge: tabBadgeLabel(tab('inicio')) }}
        listeners={tabPressResetToRoot('CoachInicio', 'CoachDashboardMain')}
      />
      <Tab.Screen
        name="CoachSesiones"
        component={CoachSessionsStackNav}
        options={{ tabBarLabel: 'Sesiones', tabBarBadge: tabBadgeLabel(tab('sesiones')) }}
        listeners={tabPressResetToRoot('CoachSesiones', 'CoachAgenda')}
      />
      <Tab.Screen
        name="CoachEquipo"
        component={CoachTeamStackNav}
        options={{ tabBarLabel: 'Equipo', tabBarBadge: tabBadgeLabel(tab('equipo')) }}
        listeners={tabPressResetToRoot('CoachEquipo', 'CoachCategories')}
      />
      <Tab.Screen
        name="CoachComunicar"
        component={CoachCommsStackNav}
        options={{ tabBarLabel: 'Comunicación', tabBarBadge: tabBadgeLabel(tab('comunicar')) }}
        listeners={tabPressResetToRoot('CoachComunicar', 'CoachCommsHub')}
      />
      <Tab.Screen
        name="CoachPerfil"
        component={CoachProfileStackNav}
        options={{ tabBarLabel: 'Perfil', tabBarBadge: tabBadgeLabel(tab('perfil')) }}
      />
    </Tab.Navigator>
  );
}
