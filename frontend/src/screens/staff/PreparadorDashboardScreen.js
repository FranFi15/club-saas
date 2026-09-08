import React from 'react';
import CoachStyleDashboard from '../../components/CoachStyleDashboard';

/** Panel inicial del preparador físico — mismo layout que el profe (calendario + sesiones del día). */
export default function PreparadorDashboardScreen({ navigation }) {
  return (
    <CoachStyleDashboard
      navigation={navigation}
      kicker="Preparación física"
      sessionsTab="PrepSesiones"
      teamTab="PrepEquipo"
      teamRosterScreen="PrepRoster"
    />
  );
}
