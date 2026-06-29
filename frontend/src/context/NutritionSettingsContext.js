import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ClubContext } from './ClubContext';
import { getToken } from '../utils/storage';
import { clubApi } from '../utils/api';
import { normalizeBodyFatMethod } from '../utils/nutriBodyComposition';

export const NutritionSettingsContext = createContext({
  metodoGrasaCorporal: 'durnin_siri',
  loaded: false,
  refresh: async () => {},
  setMetodoGrasaCorporal: async () => {},
});

export function NutritionSettingsProvider({ children }) {
  const { clubData } = useContext(ClubContext);
  const [metodoGrasaCorporal, setMetodoState] = useState('durnin_siri');
  const [loaded, setLoaded] = useState(false);

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData?.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const refresh = useCallback(async () => {
    if (!clubData?.urlIdentifier) {
      setLoaded(true);
      return;
    }
    try {
      const h = await headers();
      const res = await clubApi.get('/performance/nutricion/settings', { headers: h });
      setMetodoState(normalizeBodyFatMethod(res.data?.metodoGrasaCorporal));
    } catch {
      setMetodoState('durnin_siri');
    } finally {
      setLoaded(true);
    }
  }, [clubData?.urlIdentifier, headers]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  const setMetodoGrasaCorporal = useCallback(
    async (metodo) => {
      const normalized = normalizeBodyFatMethod(metodo);
      const h = await headers();
      await clubApi.patch('/performance/nutricion/settings', { metodo: normalized }, { headers: h });
      setMetodoState(normalized);
      return normalized;
    },
    [headers],
  );

  const value = useMemo(
    () => ({
      metodoGrasaCorporal,
      loaded,
      refresh,
      setMetodoGrasaCorporal,
    }),
    [metodoGrasaCorporal, loaded, refresh, setMetodoGrasaCorporal],
  );

  return <NutritionSettingsContext.Provider value={value}>{children}</NutritionSettingsContext.Provider>;
}

export function useNutritionSettings() {
  return useContext(NutritionSettingsContext);
}
