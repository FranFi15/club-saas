import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TutorProfileScreen from '../screens/tutor/TutorProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AthleteMetricsScreen from '../screens/athlete/AthleteMetricsScreen';
import MemberClubEntryScreen from '../screens/member/MemberClubEntryScreen';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';

const Stack = createNativeStackNavigator();

export default function TutorProfileStackNav() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={TutorProfileScreen} />
      <Stack.Screen name="TutorPayments" component={MemberPaymentsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="TutorMetrics" component={AthleteMetricsScreen} />
      <Stack.Screen name="ClubEntryQr" component={MemberClubEntryScreen} />
    </Stack.Navigator>
  );
}
