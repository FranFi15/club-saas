import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fadeStackScreenOptions } from './screenFade';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import MemberClubEntryScreen from '../screens/member/MemberClubEntryScreen';
import MemberPaymentsScreen from '../screens/member/MemberPaymentsScreen';

const Stack = createNativeStackNavigator();

/** Stack de perfil con pantalla de edición de datos personales. */
export function createProfileStack(MainScreen, mainRouteName = 'ProfileMain') {
  function ProfileStackNav() {
    return (
      <Stack.Navigator screenOptions={fadeStackScreenOptions}>
        <Stack.Screen name={mainRouteName} component={MainScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="ClubEntryQr" component={MemberClubEntryScreen} />
        <Stack.Screen name="MemberPayments" component={MemberPaymentsScreen} />
      </Stack.Navigator>
    );
  }
  return ProfileStackNav;
}
