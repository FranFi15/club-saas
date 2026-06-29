import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AthleteWellnessHubScreen from '../screens/athlete/AthleteWellnessHubScreen';
import CoachWellnessScreen from '../screens/coach/CoachWellnessScreen';

const Stack = createNativeStackNavigator();

export default function AthleteWellnessStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AthleteWellnessMain" component={AthleteWellnessHubScreen} />
      <Stack.Screen name="AthleteWellnessForm" component={CoachWellnessScreen} />
    </Stack.Navigator>
  );
}
