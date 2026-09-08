import React from 'react';
import CoachStyleDashboard from '../../components/CoachStyleDashboard';

export default function PsychologyDashboardScreen({ navigation }) {
  return (
    <CoachStyleDashboard
      navigation={navigation}
      kicker="Panel de psicología"
      sessionsTab="PsiSesiones"
      teamTab="PsiEquipo"
      teamRosterScreen="PsiRoster"
      agendaPath="/sessions/psicologo/agenda"
      showPlantel={false}
      sessionMode="consult"
      cacheKeySuffix="psicologo"
      sectionLabel="Consultas del día"
      emptyDayMessage="No hay consultas programadas este día. Elegí otro día con punto o creá una desde Sesiones."
    />
  );
}
