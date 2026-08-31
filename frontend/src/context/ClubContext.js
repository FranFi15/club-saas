import React, { createContext, useState, useEffect, useCallback } from 'react';
import { CommonActions } from '@react-navigation/native';
import { getToken, saveToken, removeToken } from '../utils/storage';
import {
  clearAuthSession,
  beginAuthSession,
  registerSessionExpiredHandler,
  getAuthGeneration,
  CLUB_WORKSPACE_KEY,
} from '../utils/session';
import { performTokenRefresh } from '../utils/authTokens';
import { resolveMainNavigator } from '../constants/appRoles';
import { needsTermsAcceptance } from '../constants/legal';
import { navigationRef } from '../navigation/navigationRef';
import { clearAllScreenCache } from '../hooks/useCachedFocusLoad';

export { CLUB_WORKSPACE_KEY };

export const ClubContext = createContext();

export const ClubProvider = ({ children }) => {
  const [clubData, setClubDataState] = useState(null);
  const [clubHydrated, setClubHydrated] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [bootRoute, setBootRoute] = useState(null);
  const [memberSessionRol, setMemberSessionRol] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);

  const setClubData = useCallback(async (data) => {
    setClubDataState(data);
    try {
      if (data?.urlIdentifier) {
        await saveToken(CLUB_WORKSPACE_KEY, JSON.stringify(data));
      } else {
        await removeToken(CLUB_WORKSPACE_KEY);
      }
    } catch (e) {
      console.log('[club] persist workspace', e.message);
    }
  }, []);

  const clearSession = useCallback(async () => {
    clearAllScreenCache();
    await clearAuthSession();
    setMemberSessionRol(null);
    setSessionActive(false);

    if (navigationRef.isReady()) {
      const savedClub = await getToken(CLUB_WORKSPACE_KEY);
      let routeName = 'WorkspaceSearch';
      if (savedClub) {
        try {
          const parsed = JSON.parse(savedClub);
          if (parsed?.urlIdentifier) routeName = 'Login';
        } catch {
          routeName = 'WorkspaceSearch';
        }
      }
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: routeName }],
        }),
      );
    }
  }, []);

  useEffect(() => {
    registerSessionExpiredHandler(clearSession);
    return () => registerSessionExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;
    const bootGeneration = getAuthGeneration();

    (async () => {
      let nextBootRoute = 'WorkspaceSearch';

      try {
        const savedClub = await getToken(CLUB_WORKSPACE_KEY);

        if (savedClub) {
          try {
            const parsed = JSON.parse(savedClub);
            if (parsed?.urlIdentifier) {
              if (!cancelled) setClubDataState(parsed);

              const refreshToken = await getToken('userRefreshToken');
              const rol = await getToken('userRol');

              if (refreshToken) {
                try {
                  const refreshData = await performTokenRefresh(parsed.urlIdentifier, refreshToken);
                  if (!cancelled && getAuthGeneration() === bootGeneration) {
                    beginAuthSession();
                    setSessionActive(true);
                    if (rol === 'atleta' || rol === 'tutor' || rol === 'socio') {
                      setMemberSessionRol(rol);
                    }
                    const acceptedVersion =
                      refreshData?.acceptedTermsVersion ??
                      (await getToken('acceptedTermsVersion'));
                    nextBootRoute = needsTermsAcceptance(acceptedVersion)
                      ? 'TermsAcceptance'
                      : resolveMainNavigator(rol);
                  } else if (!cancelled) {
                    nextBootRoute = 'Login';
                  }
                } catch {
                  if (!cancelled && getAuthGeneration() === bootGeneration) {
                    await clearAuthSession();
                  }
                  nextBootRoute = 'Login';
                }
              } else {
                nextBootRoute = 'Login';
              }
            }
          } catch {
            await removeToken(CLUB_WORKSPACE_KEY);
          }
        }
      } finally {
        if (!cancelled) {
          setBootRoute(nextBootRoute);
          setClubHydrated(true);
          setSessionHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ClubContext.Provider
      value={{
        clubData,
        setClubData,
        clubHydrated,
        sessionHydrated,
        bootRoute,
        memberSessionRol,
        setMemberSessionRol,
        sessionActive,
        setSessionActive,
        clearSession,
      }}
    >
      {children}
    </ClubContext.Provider>
  );
};
