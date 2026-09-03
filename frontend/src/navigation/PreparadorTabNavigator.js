import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import StaffProfileScreen from '../screens/staff/StaffProfileScreen';
import { createProfileStack } from './createProfileStack';
import PreparadorDashboardScreen from '../screens/staff/PreparadorDashboardScreen';
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
import StaffAthleteRosterScreen from '../screens/staff/StaffAthleteRosterScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeLabel } from '../utils/tabBadgeLabel';

const Tab = createSwipeBottomTabNavigator();
const PrepHomeStack = createNativeStackNavigator();
const PrepSessionsStack = createNativeStackNavigator();
const PrepTeamStack = createNativeStackNavigator();
const PrepCommsStack = createNativeStackNavigator();
const PrepProfileStackNav = createProfileStack(StaffProfileScreen);

function PrepHomeStackNav() {
  return (
    <PrepHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <PrepHomeStack.Screen name="PrepDashboardMain" component={PreparadorDashboardScreen} />
    </PrepHomeStack.Navigator>
  );
}

function PrepSessionsStackNav() {
  return (
    <PrepSessionsStack.Navigator screenOptions={{ headerShown: false }}>
      <PrepSessionsStack.Screen name="CoachAgenda" component={CoachAgendaScreen} />
      <PrepSessionsStack.Screen name="CoachRelocateSessions" component={CoachRelocateSessionsScreen} />
      <PrepSessionsStack.Screen name="CoachSessionDetail" component={CoachSessionDetailScreen} />
      <PrepSessionsStack.Screen name="CoachNewSession" component={CoachNewSessionScreen} />
      <PrepSessionsStack.Screen name="CoachCancelSession" component={CoachCancelSessionScreen} />
      <PrepSessionsStack.Screen name="CoachSessionStats" component={CoachSessionStatsScreen} />
      <PrepSessionsStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
    </PrepSessionsStack.Navigator>
  );
}

function PrepTeamStackNav() {
  return (
    <PrepTeamStack.Navigator screenOptions={{ headerShown: false }}>
      <PrepTeamStack.Screen
        name="PrepRoster"
        component={StaffAthleteRosterScreen}
        initialParams={{ categoriesScreen: 'CoachCategories' }}
      />
      <PrepTeamStack.Screen name="CoachCategories" component={CoachCategoriesScreen} />
      <PrepTeamStack.Screen name="CoachCategoryDetail" component={CoachCategoryDetailScreen} />
      <PrepTeamStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
      <PrepTeamStack.Screen name="CoachMeasurement" component={CoachMeasurementScreen} />
      <PrepTeamStack.Screen name="CoachTeamDocuments" component={CoachTeamDocumentsScreen} />
      <PrepTeamStack.Screen name="CoachMediaViewer" component={MemberMediaViewerScreen} />
    </PrepTeamStack.Navigator>
  );
}

function PrepCommsStackNav() {
  return (
    <PrepCommsStack.Navigator screenOptions={{ headerShown: false }}>
      <PrepCommsStack.Screen name="CoachCommsHub" component={CoachCommsHubScreen} />
      <PrepCommsStack.Screen
        name="NoticiasStaff"
        component={NoticiasScreen}
        initialParams={{ embeddedStaff: true, coachBrandedHeader: true }}
      />
      <PrepCommsStack.Screen name="CoachResourceSend" component={CoachResourceSendScreen} />
      <PrepCommsStack.Screen name="CoachRequestDoc" component={CoachRequestDocScreen} />
      <PrepCommsStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <PrepCommsStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <PrepCommsStack.Screen name="ChatNew" component={ChatNewScreen} />
    </PrepCommsStack.Navigator>
  );
}

/** Navegación tipo entrenador para el rol preparador físico (sesiones, equipo, comunicación). */
export default function PreparadorTabNavigator() {
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
      tabBarPosition="bottom"
      screenOptions={buildSwipeBottomTabOptions({
        colorMarca,
        theme,
        tabBarHeight,
        tabBottomPad,
        getIcon: (name, focused, color) => {
          const map = {
            PrepInicio: focused ? 'home' : 'home-outline',
            PrepSesiones: focused ? 'fitness' : 'fitness-outline',
            PrepEquipo: focused ? 'people' : 'people-outline',
            PrepComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            PrepPerfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[name] || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="PrepInicio"
        component={PrepHomeStackNav}
        options={{ tabBarLabel: 'Inicio', tabBarBadge: tabBadgeLabel(tab('inicio')) }}
        listeners={tabPressResetToRoot('PrepInicio', 'PrepDashboardMain')}
      />
      <Tab.Screen
        name="PrepSesiones"
        component={PrepSessionsStackNav}
        options={{ tabBarLabel: 'Sesiones', tabBarBadge: tabBadgeLabel(tab('sesiones')) }}
        listeners={tabPressResetToRoot('PrepSesiones', 'CoachAgenda')}
      />
      <Tab.Screen
        name="PrepEquipo"
        component={PrepTeamStackNav}
        options={{ tabBarLabel: 'Atletas', tabBarBadge: tabBadgeLabel(tab('equipo')) }}
        listeners={tabPressResetToRoot('PrepEquipo', 'PrepRoster')}
      />
      <Tab.Screen
        name="PrepComunicar"
        component={PrepCommsStackNav}
        options={{ tabBarLabel: 'Social', tabBarBadge: tabBadgeLabel(tab('comunicar')) }}
        listeners={tabPressResetToRoot('PrepComunicar', 'CoachCommsHub')}
      />
      <Tab.Screen
        name="PrepPerfil"
        component={PrepProfileStackNav}
        options={{ tabBarLabel: 'Perfil', tabBarBadge: tabBadgeLabel(tab('perfil')) }}
      />
    </Tab.Navigator>
  );
}
