import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import AthleteNewsScreen from '../screens/athlete/AthleteNewsScreen';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';
import MemberClubEntryScreen from '../screens/member/MemberClubEntryScreen';
import MemberMediaViewerScreen from '../screens/member/MemberMediaViewerScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import SocioProfileScreen from '../screens/socio/SocioProfileScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeLabel } from '../utils/tabBadgeLabel';
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';

const Tab = createSwipeBottomTabNavigator();
const Stack = createNativeStackNavigator();

function SocioNewsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SocioNewsMain" component={AthleteNewsScreen} />
      <Stack.Screen name="MemberMediaViewer" component={MemberMediaViewerScreen} />
    </Stack.Navigator>
  );
}

function SocioChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
      <Stack.Screen name="ChatNew" component={ChatNewScreen} />
    </Stack.Navigator>
  );
}

function SocioProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={SocioProfileScreen} />
      <Stack.Screen name="SocioPayments" component={MemberPaymentsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ClubEntryQr" component={MemberClubEntryScreen} />
    </Stack.Navigator>
  );
}

function SocioTabs() {
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
          const map = {
            SocioCuotas: focused ? 'wallet' : 'wallet-outline',
            SocioNoticias: focused ? 'newspaper' : 'newspaper-outline',
            SocioQr: focused ? 'qr-code' : 'qr-code-outline',
            SocioChat: focused ? 'chatbubbles' : 'chatbubbles-outline',
            SocioProfile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[name] || 'ellipse-outline'} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="SocioCuotas"
        component={MemberPaymentsScreen}
        options={{ tabBarLabel: 'Cuota', tabBarBadge: tabBadgeLabel(tab('cuotas')) }}
      />
      <Tab.Screen
        name="SocioNoticias"
        component={SocioNewsStack}
        options={{ tabBarLabel: 'Noticias', tabBarBadge: tabBadgeLabel(tab('noticias')) }}
        listeners={tabPressResetToRoot('SocioNoticias', 'SocioNewsMain')}
      />
      <Tab.Screen
        name="SocioQr"
        component={MemberClubEntryScreen}
        options={{ tabBarLabel: 'Mi QR' }}
      />
      <Tab.Screen
        name="SocioChat"
        component={SocioChatStack}
        options={{ tabBarLabel: 'Chat', tabBarBadge: tabBadgeLabel(tab('chat')) }}
        listeners={tabPressResetToRoot('SocioChat', 'ChatInbox')}
      />
      <Tab.Screen
        name="SocioProfile"
        component={SocioProfileStack}
        options={{ tabBarLabel: 'Perfil' }}
        listeners={tabPressResetToRoot('SocioProfile', 'ProfileMain')}
      />
    </Tab.Navigator>
  );
}

export default function SocioTabNavigator() {
  return <SocioTabs />;
}
