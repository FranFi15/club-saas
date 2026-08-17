import React, { useContext, useCallback } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import { Platform } from 'react-native';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

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

import { tabBadgeLabel } from '../utils/tabBadgeLabel';

const Tab = createBottomTabNavigator();

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
          const map = {
            AthleteAgenda: focused ? 'calendar' : 'calendar-outline',
            AthleteMetrics: focused ? 'analytics' : 'analytics-outline',
            AthleteWellness: focused ? 'fitness' : 'fitness-outline',
            AthleteComunicar: focused ? 'chatbubbles' : 'chatbubbles-outline',
            AthleteProfile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[route.name] || 'ellipse'} size={22} color={color} />;
        },

      })}

    >

      <Tab.Screen

        name="AthleteAgenda"

        component={AthleteAgendaStack}

        options={{ tabBarLabel: 'Agenda', tabBarBadge: tabBadgeLabel(tab('agenda')) }}

        listeners={tabPressResetToRoot('AthleteAgenda', 'AthleteAgendaMain')}

      />
    <Tab.Screen

name="AthleteWellness"

component={AthleteWellnessStack}

options={{ tabBarLabel: 'Wellness' }}

listeners={tabPressResetToRoot('AthleteWellness', 'AthleteWellnessMain')}

/>

<Tab.Screen

name="AthleteComunicar"

component={MemberCommsStack}

options={{ tabBarLabel: 'Comunicación', tabBarBadge: tabBadgeLabel(tab('comunicar')) }}

listeners={tabPressResetToRoot('AthleteComunicar', 'MemberCommsHub')}

/>
<Tab.Screen

        name="AthleteMetrics"

        component={AthleteMetricsStack}

        options={{ tabBarLabel: 'Mis métricas' }}

        listeners={tabPressResetToRoot('AthleteMetrics', 'AthleteMetricsMain')}

      />

      <Tab.Screen

        name="AthleteProfile"

        component={AthleteProfileStackNav}

        options={{
          tabBarLabel: 'Perfil',
          tabBarBadge: tabBadgeLabel(tab('cuotas')),
        }}

      />

    </Tab.Navigator>

  );

}



export default function AthleteTabNavigator() {

  return <AthleteTabs />;

}

