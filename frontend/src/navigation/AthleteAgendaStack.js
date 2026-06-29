import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AthleteAgendaScreen from '../screens/athlete/AthleteAgendaScreen';

const Stack = createNativeStackNavigator();

export default function AthleteAgendaStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AthleteAgendaMain" component={AthleteAgendaScreen} />
    </Stack.Navigator>
  );
}
