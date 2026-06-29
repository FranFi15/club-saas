import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { ClubContext } from './ClubContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { isAuthError, getAuthGeneration, shouldClearSessionOnAuthError } from '../utils/session';

const EMPTY_SUMMARY = {
  notifications: { unread: 0 },
  tabs: {},
  hubs: {},
};

export const BadgeContext = createContext(null);

export function BadgeProvider({ children }) {
  const { clubData, sessionActive, clearSession } = useContext(ClubContext);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!clubData?.urlIdentifier || !sessionActive) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    const requestGeneration = getAuthGeneration();
    try {
      const token = await getToken('userToken');
      if (!token) {
        setSummary(EMPTY_SUMMARY);
        return;
      }
      const { data } = await clubApi.get('/badges/summary', {
        headers: {
          'x-club-identifier': clubData.urlIdentifier,
          Authorization: `Bearer ${token}`,
        },
      });
      setSummary(data || EMPTY_SUMMARY);
    } catch (e) {
      if (
        isAuthError(e) &&
        shouldClearSessionOnAuthError(requestGeneration)
      ) {
        const refreshToken = await getToken('userRefreshToken');
        if (!refreshToken) {
          await clearSession();
        }
        setSummary(EMPTY_SUMMARY);
        return;
      }
      if (__DEV__) console.log('BadgeProvider refresh', e.message);
    } finally {
      setLoading(false);
    }
  }, [clubData?.urlIdentifier, sessionActive, clearSession]);

  const markSeen = useCallback(
    async (payload) => {
      if (!clubData?.urlIdentifier) return;
      const requestGeneration = getAuthGeneration();
      try {
        const token = await getToken('userToken');
        const { data } = await clubApi.patch('/badges/seen', payload, {
          headers: {
            'x-club-identifier': clubData.urlIdentifier,
            Authorization: `Bearer ${token}`,
          },
        });
        setSummary(data || EMPTY_SUMMARY);
      } catch (e) {
        if (
          isAuthError(e) &&
          shouldClearSessionOnAuthError(requestGeneration)
        ) {
          const refreshToken = await getToken('userRefreshToken');
          if (!refreshToken) {
            await clearSession();
          }
          setSummary(EMPTY_SUMMARY);
          return;
        }
        if (__DEV__) console.log('BadgeProvider markSeen', e.message);
      }
    },
    [clubData?.urlIdentifier, clearSession],
  );

  useEffect(() => {
    setLoading(true);
    refresh();
    intervalRef.current = setInterval(refresh, 90000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [refresh]);

  const hub = useCallback((key) => Number(summary?.hubs?.[key]) || 0, [summary]);
  const tab = useCallback((key) => Number(summary?.tabs?.[key]) || 0, [summary]);
  const notificationsUnread = summary?.notifications?.unread || 0;

  return (
    <BadgeContext.Provider
      value={{
        summary,
        loading,
        refresh,
        markSeen,
        hub,
        tab,
        notificationsUnread,
      }}
    >
      {children}
    </BadgeContext.Provider>
  );
}

export function useBadges() {
  const ctx = useContext(BadgeContext);
  if (!ctx) {
    throw new Error('useBadges debe usarse dentro de BadgeProvider');
  }
  return ctx;
}

/** Seguro fuera del provider (pantallas pre-login). */
export function useBadgesOptional() {
  return useContext(BadgeContext);
}
