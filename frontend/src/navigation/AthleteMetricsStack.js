import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fadeStackScreenOptions } from './screenFade';
import AthleteMetricsScreen from '../screens/athlete/AthleteMetricsScreen';
import AthleteCourtMetricDetailScreen from '../screens/athlete/AthleteCourtMetricDetailScreen';
import CoachSessionStatsScreen from '../screens/coach/CoachSessionStatsScreen';

const Stack = createNativeStackNavigator();

export default function AthleteMetricsStack() {
  return (
    <Stack.Navigator screenOptions={fadeStackScreenOptions}>
      <Stack.Screen name="AthleteMetricsMain" component={AthleteMetricsScreen} />
      <Stack.Screen name="AthleteCourtMetricDetail" component={AthleteCourtMetricDetailScreen} />
    </Stack.Navigator>
  );
}
