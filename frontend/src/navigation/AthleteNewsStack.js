import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AthleteNewsScreen from '../screens/athlete/AthleteNewsScreen';

const Stack = createNativeStackNavigator();

export default function AthleteNewsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AthleteNewsMain" component={AthleteNewsScreen} />
    </Stack.Navigator>
  );
}
