import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AthleteMetricsScreen from '../screens/athlete/AthleteMetricsScreen';
import AthleteCourtMetricDetailScreen from '../screens/athlete/AthleteCourtMetricDetailScreen';

const Stack = createNativeStackNavigator();

export default function AthleteMetricsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AthleteMetricsMain" component={AthleteMetricsScreen} />
      <Stack.Screen name="AthleteCourtMetricDetail" component={AthleteCourtMetricDetailScreen} />
    </Stack.Navigator>
  );
}
