import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import TutorHomeScreen from '../screens/tutor/TutorHomeScreen';
import AthleteAgendaStack from './AthleteAgendaStack';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';
import TutorProfileStackNav from './TutorProfileStack';
import MemberCommsStack from './MemberCommsStack';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { useMember } from '../context/MemberContext';
import { tabBadgeLabel } from '../utils/tabBadgeLabel';
import TabBarClubLogo from '../components/TabBarClubLogo';

const Tab = createBottomTabNavigator();

function TutorTabs() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { tab, refresh } = useBadges();
  const { refresh: refreshMember } = useMember();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshMember({ background: true });
    }, [refresh, refreshMember]),
  );
  const insets = useSafeAreaInsets();
  const tabBottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10);
  const tabBarHeight = 60 + tabBottomPad;

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
          height: tabBarHeight,
          paddingBottom: tabBottomPad,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'TutorInicio') {
            return (
              <TabBarClubLogo
                focused={focused}
                color={color}
                fallbackIcon="home-outline"
                fallbackIconFocused="home"
              />
            );
          }
          const map = {
            TutorAgenda: focused ? 'calendar' : 'calendar-outline',
            TutorPayments: focused ? 'wallet' : 'wallet-outline',
            TutorComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            TutorProfile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[route.name] || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="TutorInicio"
        component={TutorHomeScreen}
        options={{ tabBarLabel: 'Inicio', tabBarBadge: tabBadgeLabel(tab('inicio')) }}
        listeners={tabPressResetToRoot('TutorInicio')}
      />
      <Tab.Screen
        name="TutorAgenda"
        component={AthleteAgendaStack}
        options={{ tabBarLabel: 'Agenda', tabBarBadge: tabBadgeLabel(tab('agenda')) }}
        listeners={tabPressResetToRoot('TutorAgenda', 'AthleteAgendaMain')}
      />
      <Tab.Screen
        name="TutorPayments"
        component={MemberPaymentsScreen}
        options={{ tabBarLabel: 'Cuotas', tabBarBadge: tabBadgeLabel(tab('cuotas')) }}
      />
      <Tab.Screen
        name="TutorComunicar"
        component={MemberCommsStack}
        options={{ tabBarLabel: 'Comunicación', tabBarBadge: tabBadgeLabel(tab('comunicar')) }}
        listeners={tabPressResetToRoot('TutorComunicar', 'MemberCommsHub')}
      />
      <Tab.Screen
        name="TutorProfile"
        component={TutorProfileStackNav}
        options={{ tabBarLabel: 'Perfil', tabBarBadge: tabBadgeLabel(tab('perfil')) }}
      />
    </Tab.Navigator>
  );
}

export default function TutorTabNavigator() {
  return <TutorTabs />;
}
