import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';
import CoachWellnessScreen from '../screens/coach/CoachWellnessScreen';

const Stack = createNativeStackNavigator();

export default function AthleteCuotasStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AthleteCuotasMain" component={MemberPaymentsScreen} />
      <Stack.Screen name="AthleteWellnessForm" component={CoachWellnessScreen} />
    </Stack.Navigator>
  );
}
