import React, { useContext } from 'react';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import HubMenuCard from './HubMenuCard';
import { useEventDoorEvents } from '../hooks/useEventDoorEvents';

/** Aparece solo si este usuario tiene eventos asignados en la puerta. */
export default function EventDoorCard({ navigation, routeName = 'EventDoorScan' }) {
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const events = useEventDoorEvents();
  if (!events.length) return null;

  const subtitle =
    events.length === 1
      ? events[0].titulo
      : `${events.length} eventos para escanear`;

  return (
    <HubMenuCard
      theme={theme}
      colorMarca={colorMarca}
      icon="ticket-outline"
      title="Ingreso a eventos"
      subtitle={subtitle}
      onPress={() => navigation.navigate(routeName)}
    />
  );
}
