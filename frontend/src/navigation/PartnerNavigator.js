import React, { useContext } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ThemeContext } from '../context/ThemeContext';
import PartnerRedeemScreen from '../screens/partner/PartnerRedeemScreen';
import PartnerSaleScreen from '../screens/partner/PartnerSaleScreen';
import PartnerProfileScreen from '../screens/partner/PartnerProfileScreen';

const Tab = createBottomTabNavigator();

export default function PartnerNavigator() {
  const { theme } = useContext(ThemeContext);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary || '#3b82f6',
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarIcon: ({ color, size, focused }) => {
          const map = {
            PartnerRedeem: focused ? 'qr-code' : 'qr-code-outline',
            PartnerSale: focused ? 'cash' : 'cash-outline',
            PartnerProfile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={map[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="PartnerRedeem" component={PartnerRedeemScreen} options={{ title: 'Canjear' }} />
      <Tab.Screen name="PartnerSale" component={PartnerSaleScreen} options={{ title: 'Venta' }} />
      <Tab.Screen name="PartnerProfile" component={PartnerProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}
