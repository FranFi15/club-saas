import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fadeStackScreenOptions } from './screenFade';
import TutorProfileScreen from '../screens/tutor/TutorProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AthleteMetricsScreen from '../screens/athlete/AthleteMetricsScreen';
import AthleteCourtMetricDetailScreen from '../screens/athlete/AthleteCourtMetricDetailScreen';
import CoachSessionStatsScreen from '../screens/coach/CoachSessionStatsScreen';
import MemberClubEntryScreen from '../screens/member/MemberClubEntryScreen';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';
import MemberAlquilerScreen from '../screens/member/MemberAlquilerScreen';

const Stack = createNativeStackNavigator();

export default function TutorProfileStackNav() {
  return (
    <Stack.Navigator screenOptions={fadeStackScreenOptions}>
      <Stack.Screen name="ProfileMain" component={TutorProfileScreen} />
      <Stack.Screen name="TutorPayments" component={MemberPaymentsScreen} />
      <Stack.Screen name="MemberAlquiler" component={MemberAlquilerScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="TutorMetrics" component={AthleteMetricsScreen} />
      <Stack.Screen name="AthleteCourtMetricDetail" component={AthleteCourtMetricDetailScreen} />
      <Stack.Screen name="PartidoStats" component={CoachSessionStatsScreen} />
      <Stack.Screen name="ClubEntryQr" component={MemberClubEntryScreen} />
    </Stack.Navigator>
  );
}
