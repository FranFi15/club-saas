import { useCallback, useContext, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../context/ClubContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';

const linkedCache = new Map();

/** True only after the club admin linked Mercado Pago on this club. */
export function useMercadoPagoLinked() {
  const { clubData } = useContext(ClubContext);
  const clubId = clubData?.urlIdentifier || '';
  const [linked, setLinked] = useState(() => (clubId ? linkedCache.get(clubId) === true : false));

  useFocusEffect(
    useCallback(() => {
      if (!clubId) {
        setLinked(false);
        return undefined;
      }
      let cancelled = false;
      (async () => {
        try {
          const token = await getToken('userToken');
          const { data } = await clubApi.get('/mercadopago/linked', {
            headers: {
              Authorization: `Bearer ${token}`,
              'x-club-identifier': clubId,
            },
          });
          const value = !!data?.linked;
          linkedCache.set(clubId, value);
          if (!cancelled) setLinked(value);
        } catch {
          if (!cancelled) setLinked(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [clubId]),
  );

  return linked;
}
