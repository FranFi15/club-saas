import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MemberCommsHubScreen from '../screens/member/MemberCommsHubScreen';
import AthleteNewsScreen from '../screens/athlete/AthleteNewsScreen';
import AthleteDocumentsScreen from '../screens/athlete/AthleteDocumentsScreen';
import AthleteResourcesScreen from '../screens/athlete/AthleteResourcesScreen';
import MemberMediaViewerScreen from '../screens/member/MemberMediaViewerScreen';
import ChatInboxScreen from '../screens/chat/ChatInboxScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import ChatNewScreen from '../screens/chat/ChatNewScreen';

const Stack = createNativeStackNavigator();

export default function MemberCommsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MemberCommsHub" component={MemberCommsHubScreen} />
      <Stack.Screen name="MemberNews" component={AthleteNewsScreen} />
      <Stack.Screen name="MemberDocuments" component={AthleteDocumentsScreen} />
      <Stack.Screen name="MemberResources" component={AthleteResourcesScreen} />
      <Stack.Screen name="MemberMediaViewer" component={MemberMediaViewerScreen} />
      <Stack.Screen name="ChatInbox" component={ChatInboxScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
      <Stack.Screen name="ChatNew" component={ChatNewScreen} />
    </Stack.Navigator>
  );
}
