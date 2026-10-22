import { useCallback, useContext, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../context/ClubContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { useMercadoPagoLinked } from './useMercadoPagoLinked';

/** Eventos publicados cuya puerta puede escanear el usuario logueado. */
export function useEventDoorEvents() {
  const { clubData } = useContext(ClubContext);
  const mpLinked = useMercadoPagoLinked();
  const [events, setEvents] = useState([]);

  const reload = useCallback(async () => {
    if (!clubData?.urlIdentifier || !mpLinked) {
      setEvents([]);
      return;
    }
    try {
      const token = await getToken('userToken');
      const { data } = await clubApi.get('/events/door', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-club-identifier': clubData.urlIdentifier,
        },
      });
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    }
  }, [clubData?.urlIdentifier, mpLinked]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return events;
}
