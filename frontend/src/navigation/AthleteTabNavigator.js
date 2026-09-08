import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import AthleteAgendaStack from './AthleteAgendaStack';
import AthleteWellnessStack from './AthleteWellnessStack';
import AthleteProfileStackNav from './AthleteProfileStack';
import MemberCommsStack from './MemberCommsStack';
import AthleteMetricsStack from './AthleteMetricsStack';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeText } from '../utils/tabBadgeLabel';
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';

const Tab = createSwipeBottomTabNavigator();

function AthleteTabs() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { tab, refresh } = useBadges();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const insets = useSafeAreaInsets();
  const tabBottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10);
  const tabBarHeight = 60 + tabBottomPad;

  return (
    <Tab.Navigator
      key={isDarkMode ? 'dark' : 'light'}
      tabBarPosition="bottom"
      screenOptions={buildSwipeBottomTabOptions({
        colorMarca,
        theme,
        tabBarHeight,
        tabBottomPad,
        paddingTop: 6,
        getIcon: (name, focused, color) => {
          const map = {
            AthleteAgenda: focused ? 'calendar' : 'calendar-outline',
            AthleteMetrics: focused ? 'analytics' : 'analytics-outline',
            AthleteWellness: focused ? 'fitness' : 'fitness-outline',
            AthleteComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            AthleteProfile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[name] || 'ellipse'} size={22} color={color} />;
        },
        getBadge: (name) =>
          ({
            AthleteAgenda: tabBadgeText(tab('agenda')),
            AthleteComunicar: tabBadgeText(tab('comunicar')),
            AthleteProfile: tabBadgeText(tab('cuotas')),
          })[name],
        getLabel: (name) =>
          ({
            AthleteAgenda: 'Agenda',
            AthleteWellness: 'Wellness',
            AthleteComunicar: 'Social',
            AthleteMetrics: 'Métricas',
            AthleteProfile: 'Perfil',
          })[name],
      })}
    >
      <Tab.Screen
        name="AthleteAgenda"
        component={AthleteAgendaStack}
        listeners={tabPressResetToRoot('AthleteAgenda', 'AthleteAgendaMain')}
      />
      <Tab.Screen
        name="AthleteWellness"
        component={AthleteWellnessStack}
        listeners={tabPressResetToRoot('AthleteWellness', 'AthleteWellnessMain')}
      />
      <Tab.Screen
        name="AthleteComunicar"
        component={MemberCommsStack}
        listeners={tabPressResetToRoot('AthleteComunicar', 'MemberCommsHub')}
      />
      <Tab.Screen
        name="AthleteMetrics"
        component={AthleteMetricsStack}
        listeners={tabPressResetToRoot('AthleteMetrics', 'AthleteMetricsMain')}
      />
      <Tab.Screen name="AthleteProfile" component={AthleteProfileStackNav} />
    </Tab.Navigator>
  );
}

export default function AthleteTabNavigator() {
  return <AthleteTabs />;
}
