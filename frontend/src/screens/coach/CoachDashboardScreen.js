import React from 'react';
import CoachStyleDashboard from '../../components/CoachStyleDashboard';

export default function CoachDashboardScreen({ navigation }) {
  return (
    <CoachStyleDashboard
      navigation={navigation}
      kicker="Panel del profe"
      sessionsTab="CoachSesiones"
      teamTab="CoachEquipo"
    />
  );
}
