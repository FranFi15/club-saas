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
import PsychologyDashboardScreen from '../screens/staff/PsychologyDashboardScreen';
import PsychologyAgendaScreen from '../screens/staff/PsychologyAgendaScreen';
import PsychologyNewConsultScreen from '../screens/staff/PsychologyNewConsultScreen';
import CoachSessionDetailScreen from '../screens/coach/CoachSessionDetailScreen';
import CoachCancelSessionScreen from '../screens/coach/CoachCancelSessionScreen';
import CoachCategoriesScreen from '../screens/coach/CoachCategoriesScreen';
import StaffAthleteRosterScreen from '../screens/staff/StaffAthleteRosterScreen';
import CoachCategoryDetailScreen from '../screens/coach/CoachCategoryDetailScreen';
import CoachWellnessScreen from '../screens/coach/CoachWellnessScreen';
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
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';

const Tab = createSwipeBottomTabNavigator();
const PsiHomeStack = createNativeStackNavigator();
const PsiSessionsStack = createNativeStackNavigator();
const PsiTeamStack = createNativeStackNavigator();
const PsiCommsStack = createNativeStackNavigator();
const PsiProfileStackNav = createProfileStack(StaffProfileScreen);

function PsiHomeStackNav() {
  return (
    <PsiHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <PsiHomeStack.Screen name="PsiDashboardMain" component={PsychologyDashboardScreen} />
    </PsiHomeStack.Navigator>
  );
}

function PsiSessionsStackNav() {
  return (
    <PsiSessionsStack.Navigator screenOptions={{ headerShown: false }}>
      <PsiSessionsStack.Screen name="PsychologyAgenda" component={PsychologyAgendaScreen} />
      <PsiSessionsStack.Screen name="CoachSessionDetail" component={CoachSessionDetailScreen} />
      <PsiSessionsStack.Screen name="PsychologyNewConsult" component={PsychologyNewConsultScreen} />
      <PsiSessionsStack.Screen name="CoachCancelSession" component={CoachCancelSessionScreen} />
      <PsiSessionsStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
    </PsiSessionsStack.Navigator>
  );
}

function PsiTeamStackNav() {
  return (
    <PsiTeamStack.Navigator screenOptions={{ headerShown: false }}>
      <PsiTeamStack.Screen
        name="PsiRoster"
        component={StaffAthleteRosterScreen}
        initialParams={{ categoriesScreen: 'CoachCategories', showMeasurements: false }}
      />
      <PsiTeamStack.Screen name="CoachCategories" component={CoachCategoriesScreen} />
      <PsiTeamStack.Screen name="CoachCategoryDetail" component={CoachCategoryDetailScreen} />
      <PsiTeamStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
      <PsiTeamStack.Screen name="CoachTeamDocuments" component={CoachTeamDocumentsScreen} />
      <PsiTeamStack.Screen name="CoachMediaViewer" component={MemberMediaViewerScreen} />
    </PsiTeamStack.Navigator>
  );
}

function PsiCommsStackNav() {
  return (
    <PsiCommsStack.Navigator screenOptions={{ headerShown: false }}>
      <PsiCommsStack.Screen name="CoachCommsHub" component={CoachCommsHubScreen} />
      <PsiCommsStack.Screen
        name="NoticiasStaff"
        component={NoticiasScreen}
        initialParams={{ embeddedStaff: true, coachBrandedHeader: true }}
      />
      <PsiCommsStack.Screen name="CoachResourceSend" component={CoachResourceSendScreen} />
      <PsiCommsStack.Screen name="CoachRequestDoc" component={CoachRequestDocScreen} />
      <PsiCommsStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <PsiCommsStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <PsiCommsStack.Screen name="ChatNew" component={ChatNewScreen} />
    </PsiCommsStack.Navigator>
  );
}

export default function PsicologoTabNavigator() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { tab, refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
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
            PsiInicio: focused ? 'home' : 'home-outline',
            PsiSesiones: focused ? 'calendar' : 'calendar-outline',
            PsiEquipo: focused ? 'people' : 'people-outline',
            PsiComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            PsiPerfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[name] || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="PsiInicio"
        component={PsiHomeStackNav}
        options={{ tabBarLabel: 'Inicio', tabBarBadge: tabBadgeLabel(tab('inicio')) }}
        listeners={tabPressResetToRoot('PsiInicio', 'PsiDashboardMain')}
      />
      <Tab.Screen
        name="PsiSesiones"
        component={PsiSessionsStackNav}
        options={{ tabBarLabel: 'Sesiones', tabBarBadge: tabBadgeLabel(tab('sesiones')) }}
        listeners={tabPressResetToRoot('PsiSesiones', 'PsychologyAgenda')}
      />
      <Tab.Screen
        name="PsiEquipo"
        component={PsiTeamStackNav}
        options={{ tabBarLabel: 'Atletas', tabBarBadge: tabBadgeLabel(tab('equipo')) }}
        listeners={tabPressResetToRoot('PsiEquipo', 'PsiRoster')}
      />
      <Tab.Screen
        name="PsiComunicar"
        component={PsiCommsStackNav}
        options={{ tabBarLabel: 'Social', tabBarBadge: tabBadgeLabel(tab('comunicar')) }}
        listeners={tabPressResetToRoot('PsiComunicar', 'CoachCommsHub')}
      />
      <Tab.Screen
        name="PsiPerfil"
        component={PsiProfileStackNav}
        options={{ tabBarLabel: 'Perfil', tabBarBadge: tabBadgeLabel(tab('perfil')) }}
      />
    </Tab.Navigator>
  );
}
