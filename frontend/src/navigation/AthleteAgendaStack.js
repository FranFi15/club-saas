import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fadeStackScreenOptions } from './screenFade';
import AthleteAgendaScreen from '../screens/athlete/AthleteAgendaScreen';
import MatchReportScreen from '../screens/MatchReportScreen';

const Stack = createNativeStackNavigator();

export default function AthleteAgendaStack() {
  return (
    <Stack.Navigator screenOptions={fadeStackScreenOptions}>
      <Stack.Screen name="AthleteAgendaMain" component={AthleteAgendaScreen} />
      <Stack.Screen name="MatchReport" component={MatchReportScreen} />
    </Stack.Navigator>
  );
}
