import React from 'react';
import CoachStyleDashboard from '../../components/CoachStyleDashboard';

const QUICK_ACCESS = [
  {
    screen: 'sessions',
    icon: 'calendar-outline',
    title: 'Agenda y sesiones',
    subtitle: 'Tomar asistencia, cronómetro por bloque y cierre con estadísticas',
  },
  {
    screen: 'team',
    icon: 'people-outline',
    title: 'Equipo y categorías',
    subtitle: 'Bienestar, mediciones y plantel por categoría',
  },
  {
    screen: 'comms',
    icon: 'chatbubbles-outline',
    title: 'Comunicar',
    subtitle: 'Noticias, material multimedia y pedidos de documentación',
  },
];

export default function CoachDashboardScreen({ navigation }) {
  return (
    <CoachStyleDashboard
      navigation={navigation}
      kicker="Panel del profe"
      sessionsTab="CoachSesiones"
      teamTab="CoachEquipo"
      commsTab="CoachComunicar"
      quickAccess={QUICK_ACCESS}
    />
  );
}
