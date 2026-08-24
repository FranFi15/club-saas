import React, { useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import NoticiasScreen from '../screens/admin/NoticiasScreen';
import StaffProfileScreen from '../screens/staff/StaffProfileScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';
import { createProfileStack } from './createProfileStack';
import { tabPressResetToRoot } from './tabPressResetToRoot';
import { useBadges } from '../context/BadgeContext';
import { tabBadgeLabel } from '../utils/tabBadgeLabel';
import { createSwipeBottomTabNavigator, buildSwipeBottomTabOptions } from './swipeBottomTabs';

const Tab = createSwipeBottomTabNavigator();
const ChatStack = createNativeStackNavigator();
const ColaboradorProfileStack = createProfileStack(StaffProfileScreen);

function ColaboradorChatStackNav() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <ChatStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <ChatStack.Screen name="ChatNew" component={ChatNewScreen} />
    </ChatStack.Navigator>
  );
}

function ColaboradorNewsScreen({ navigation, route }) {
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

/** App mínima para personal general del club: noticias, chat y perfil. */
export default function ColaboradorTabNavigator() {
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
            ColabNoticias: focused ? 'newspaper' : 'newspaper-outline',
            ColabChat: focused ? 'chatbubbles' : 'chatbubbles-outline',
            ColabPerfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[name] || 'ellipse-outline'} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="ColabNoticias"
        component={ColaboradorNewsScreen}
        options={{
          tabBarLabel: 'Noticias',
          tabBarBadge: tabBadgeLabel(tab('noticias')),
        }}
      />
      <Tab.Screen
        name="ColabChat"
        component={ColaboradorChatStackNav}
        options={{
          tabBarLabel: 'Chat',
          tabBarBadge: tabBadgeLabel(tab('chat')),
        }}
        listeners={tabPressResetToRoot('ColabChat', 'ChatInbox')}
      />
      <Tab.Screen name="ColabPerfil" component={ColaboradorProfileStack} options={{ tabBarLabel: 'Perfil' }} />
    </Tab.Navigator>
  );
}
