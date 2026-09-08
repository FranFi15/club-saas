import React from 'react';
import CoachStyleDashboard from '../../components/CoachStyleDashboard';

export default function NutritionDashboardScreen({ navigation }) {
  return (
    <CoachStyleDashboard
      navigation={navigation}
      kicker="Panel de nutrición"
      sessionsTab="NutSesiones"
      teamTab="NutEquipo"
      teamRosterScreen="NutRoster"
      agendaPath="/sessions/nutricionista/agenda"
      showPlantel={false}
      sessionMode="consult"
      cacheKeySuffix="nutricionista"
      sectionLabel="Consultas del día"
      emptyDayMessage="No hay consultas programadas este día. Elegí otro día con punto o creá una desde Sesiones."
    />
  );
}
