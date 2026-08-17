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
import NutritionAgendaScreen from '../screens/staff/NutritionAgendaScreen';
import NutritionNewConsultScreen from '../screens/staff/NutritionNewConsultScreen';
import CoachSessionDetailScreen from '../screens/coach/CoachSessionDetailScreen';
import CoachCancelSessionScreen from '../screens/coach/CoachCancelSessionScreen';
import CoachCategoriesScreen from '../screens/coach/CoachCategoriesScreen';
import StaffAthleteRosterScreen from '../screens/staff/StaffAthleteRosterScreen';
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
import { NutritionSettingsProvider } from '../context/NutritionSettingsContext';

const Tab = createBottomTabNavigator();
const NutSessionsStack = createNativeStackNavigator();
const NutTeamStack = createNativeStackNavigator();
const NutCommsStack = createNativeStackNavigator();
const NutProfileStackNav = createProfileStack(StaffProfileScreen);

function NutSessionsStackNav() {
  return (
    <NutSessionsStack.Navigator screenOptions={{ headerShown: false }}>
      <NutSessionsStack.Screen name="NutritionAgenda" component={NutritionAgendaScreen} />
      <NutSessionsStack.Screen name="CoachSessionDetail" component={CoachSessionDetailScreen} />
      <NutSessionsStack.Screen name="NutritionNewConsult" component={NutritionNewConsultScreen} />
      <NutSessionsStack.Screen name="CoachCancelSession" component={CoachCancelSessionScreen} />
      <NutSessionsStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
    </NutSessionsStack.Navigator>
  );
}

function NutTeamStackNav() {
  return (
    <NutTeamStack.Navigator screenOptions={{ headerShown: false }}>
      <NutTeamStack.Screen
        name="NutRoster"
        component={StaffAthleteRosterScreen}
        initialParams={{ categoriesScreen: 'CoachCategories' }}
      />
      <NutTeamStack.Screen name="CoachCategories" component={CoachCategoriesScreen} />
      <NutTeamStack.Screen name="CoachCategoryDetail" component={CoachCategoryDetailScreen} />
      <NutTeamStack.Screen name="CoachWellness" component={CoachWellnessScreen} />
      <NutTeamStack.Screen name="CoachMeasurement" component={CoachMeasurementScreen} />
      <NutTeamStack.Screen name="CoachTeamDocuments" component={CoachTeamDocumentsScreen} />
      <NutTeamStack.Screen name="CoachMediaViewer" component={MemberMediaViewerScreen} />
    </NutTeamStack.Navigator>
  );
}

function NutCommsStackNav() {
  return (
    <NutCommsStack.Navigator screenOptions={{ headerShown: false }}>
      <NutCommsStack.Screen name="CoachCommsHub" component={CoachCommsHubScreen} />
      <NutCommsStack.Screen
        name="NoticiasStaff"
        component={NoticiasScreen}
        initialParams={{ embeddedStaff: true, coachBrandedHeader: true }}
      />
      <NutCommsStack.Screen name="CoachResourceSend" component={CoachResourceSendScreen} />
      <NutCommsStack.Screen name="CoachRequestDoc" component={CoachRequestDocScreen} />
      <NutCommsStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <NutCommsStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <NutCommsStack.Screen name="ChatNew" component={ChatNewScreen} />
    </NutCommsStack.Navigator>
  );
}

export default function NutricionistaTabNavigator() {
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
    <NutritionSettingsProvider>
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
            NutSesiones: focused ? 'restaurant' : 'restaurant-outline',
            NutEquipo: focused ? 'people' : 'people-outline',
            NutComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            NutPerfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[route.name] || 'ellipse'} size={22} color={color} />;
        },
      })}
      >
      <Tab.Screen
        name="NutSesiones"
        component={NutSessionsStackNav}
        options={{ tabBarLabel: 'Sesiones', tabBarBadge: tabBadgeLabel(tab('sesiones')) }}
        listeners={tabPressResetToRoot('NutSesiones', 'NutritionAgenda')}
      />
      <Tab.Screen
        name="NutEquipo"
        component={NutTeamStackNav}
        options={{ tabBarLabel: 'Atletas', tabBarBadge: tabBadgeLabel(tab('equipo')) }}
        listeners={tabPressResetToRoot('NutEquipo', 'NutRoster')}
      />
      <Tab.Screen
        name="NutComunicar"
        component={NutCommsStackNav}
        options={{ tabBarLabel: 'Comunicación', tabBarBadge: tabBadgeLabel(tab('comunicar')) }}
        listeners={tabPressResetToRoot('NutComunicar', 'CoachCommsHub')}
      />
      <Tab.Screen
        name="NutPerfil"
        component={NutProfileStackNav}
        options={{ tabBarLabel: 'Perfil', tabBarBadge: tabBadgeLabel(tab('perfil')) }}
      />
      </Tab.Navigator>
    </NutritionSettingsProvider>
  );
}
