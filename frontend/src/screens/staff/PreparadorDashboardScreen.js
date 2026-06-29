import React from 'react';
import CoachStyleDashboard from '../../components/CoachStyleDashboard';

const QUICK_ACCESS = [
  {
    screen: 'sessions',
    icon: 'fitness-outline',
    title: 'Sesiones y plan',
    subtitle: 'Nueva sesión, bloques/ejercicios, cronómetro y cierre con tiempos reales',
  },
  {
    screen: 'team',
    icon: 'people-outline',
    title: 'Mis atletas',
    subtitle: 'Plantel a tu cargo, mediciones físicas y wellness',
  },
  {
    screen: 'comms',
    icon: 'chatbubbles-outline',
    title: 'Comunicar',
    subtitle: 'Noticias, videos o fotos para el grupo, pedidos de documentación',
  },
];

/** Panel inicial del preparador físico — mismo layout que el profe (calendario + sesiones del día). */
export default function PreparadorDashboardScreen({ navigation }) {
  return (
    <CoachStyleDashboard
      navigation={navigation}
      kicker="Preparación física"
      sessionsTab="PrepSesiones"
      teamTab="PrepEquipo"
      teamRosterScreen="PrepRoster"
      commsTab="PrepComunicar"
      quickAccess={QUICK_ACCESS}
    />
  );
}
