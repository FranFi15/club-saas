import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import NoticiasScreen from '../screens/admin/NoticiasScreen';
import AdminClubEntryScanScreen from '../screens/admin/AdminClubEntryScanScreen';
import StaffProfileScreen from '../screens/staff/StaffProfileScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';
import { createProfileStack } from './createProfileStack';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeText } from '../utils/tabBadgeLabel';
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';

const Tab = createSwipeBottomTabNavigator();
const ChatStack = createNativeStackNavigator();
const ControlProfileStack = createProfileStack(StaffProfileScreen);

function ControlChatStackNav() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <ChatStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <ChatStack.Screen name="ChatNew" component={ChatNewScreen} />
    </ChatStack.Navigator>
  );
}

function ControlNewsScreen({ navigation, route }) {
  return (
    <NoticiasScreen
      navigation={navigation}
      route={{
        ...route,
        params: { ...(route?.params || {}), tabRoot: true, embeddedStaff: true },
      }}
    />
  );
}

export default function ControlIngresoNavigator() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { tab, refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const insets = useSafeAreaInsets();
  const tabBottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10);
  const tabBarHeight = 64 + tabBottomPad;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <Tab.Navigator
      key={isDarkMode ? 'dark' : 'light'}
      tabBarPosition="bottom"
      screenOptions={buildSwipeBottomTabOptions({
        colorMarca,
        theme,
        tabBarHeight,
        tabBottomPad,
        paddingHorizontal: 10,
        labelFontSize: 11,
        getIcon: (name, focused, color) => {
          const map = {
            ControlIngresoNoticias: focused ? 'newspaper' : 'newspaper-outline',
            ControlIngresoScan: focused ? 'qr-code' : 'qr-code-outline',
            ControlIngresoChat: focused ? 'chatbubbles' : 'chatbubbles-outline',
            ControlIngresoPerfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[name] || 'ellipse-outline'} size={22} color={color} />;
        },
        getBadge: (name) =>
          ({
            ControlIngresoNoticias: tabBadgeText(tab('noticias')),
            ControlIngresoChat: tabBadgeText(tab('chat')),
            ControlIngresoPerfil: tabBadgeText(tab('perfil')),
          })[name],
        getLabel: (name) =>
          ({
            ControlIngresoNoticias: 'Noticias',
            ControlIngresoScan: 'Ingreso',
            ControlIngresoChat: 'Chat',
            ControlIngresoPerfil: 'Perfil',
          })[name],
      })}
    >
      <Tab.Screen name="ControlIngresoNoticias" component={ControlNewsScreen} />
      <Tab.Screen
        name="ControlIngresoScan"
        component={AdminClubEntryScanScreen}
        initialParams={{ standalone: true }}
      />
      <Tab.Screen
        name="ControlIngresoChat"
        component={ControlChatStackNav}
        listeners={tabPressResetToRoot('ControlIngresoChat', 'ChatInbox')}
      />
      <Tab.Screen name="ControlIngresoPerfil" component={ControlProfileStack} />
    </Tab.Navigator>
  );
}
