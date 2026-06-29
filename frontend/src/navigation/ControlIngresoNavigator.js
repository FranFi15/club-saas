import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminClubEntryScanScreen from '../screens/admin/AdminClubEntryScanScreen';

const Stack = createNativeStackNavigator();

export default function ControlIngresoNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="ControlIngresoMain"
        component={AdminClubEntryScanScreen}
        initialParams={{ standalone: true }}
      />
    </Stack.Navigator>
  );
}
