import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AthleteProfileScreen from '../screens/athlete/AthleteProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import MemberClubEntryScreen from '../screens/member/MemberClubEntryScreen';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';

const Stack = createNativeStackNavigator();

export default function AthleteProfileStackNav() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={AthleteProfileScreen} />
      <Stack.Screen name="AthletePayments" component={MemberPaymentsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ClubEntryQr" component={MemberClubEntryScreen} />
    </Stack.Navigator>
  );
}
