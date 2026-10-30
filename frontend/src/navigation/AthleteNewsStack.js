import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fadeStackScreenOptions } from './screenFade';
import AthleteNewsScreen from '../screens/athlete/AthleteNewsScreen';

const Stack = createNativeStackNavigator();

export default function AthleteNewsStack() {
  return (
    <Stack.Navigator screenOptions={fadeStackScreenOptions}>
      <Stack.Screen name="AthleteNewsMain" component={AthleteNewsScreen} />
    </Stack.Navigator>
  );
}
