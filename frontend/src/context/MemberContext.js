import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ClubContext } from './ClubContext';
import { clubHeaders } from '../screens/athlete/athleteApi';
import { clubApi } from '../utils/api';
import { persistUserTokensFromProfile } from '../utils/profileTokens';
import { getToken } from '../utils/storage';
import { isAuthError, getAuthGeneration, shouldClearSessionOnAuthError } from '../utils/session';
import { readScreenCache, writeScreenCache } from '../hooks/useCachedFocusLoad';

function memberCacheKey(urlIdentifier, mode) {
  if (!urlIdentifier) return '';
  return `member-profile:${urlIdentifier}:${mode || 'athlete'}`;
}

export const MemberContext = createContext(null);

export function MemberProvider({ mode, children: childNodes }) {
  const { clubData, clearSession } = useContext(ClubContext);
  const active = mode === 'atleta' || mode === 'tutor' || mode === 'socio';
  const isTutor = mode === 'tutor';
  const isSocio = mode === 'socio';

  const [profile, setProfile] = useState(() => {
    const key = memberCacheKey(clubData?.urlIdentifier, mode);
    return key ? readScreenCache(key)?.profile ?? null : null;
  });
  const [hijos, setHijos] = useState(() => {
    const key = memberCacheKey(clubData?.urlIdentifier, mode);
    return key ? readScreenCache(key)?.hijos ?? [] : [];
  });
  const [activeAtletaId, setActiveAtletaId] = useState(() => {
    const key = memberCacheKey(clubData?.urlIdentifier, mode);
    return key ? readScreenCache(key)?.activeAtletaId ?? null : null;
  });
  const [loading, setLoading] = useState(() => {
    const key = memberCacheKey(clubData?.urlIdentifier, mode);
    return key ? !readScreenCache(key) : true;
  });
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async ({ background = false } = {}) => {
    if (!clubData?.urlIdentifier) return;
    if (!background) setLoading(true);
    setLoadError(null);
    const requestGeneration = getAuthGeneration();
    const cacheKey = memberCacheKey(clubData.urlIdentifier, mode);
    try {
      const h = await clubHeaders(clubData);
      const meRes = await clubApi.get('/users/me', { headers: h });
      setProfile(meRes.data);
      await persistUserTokensFromProfile(meRes.data);

      let nextHijos = [];
      let nextActiveId = meRes.data._id;

      if (isTutor) {
        if (meRes.data?.rol && meRes.data.rol !== 'tutor') {
          setLoadError('Tu cuenta no tiene rol de tutor en este club.');
          setHijos([]);
          setActiveAtletaId(null);
          writeScreenCache(cacheKey, { profile: meRes.data, hijos: [], activeAtletaId: null });
          return;
        }
        const hijosRes = await clubApi.get('/users/mis-hijos', { headers: h });
        const list = hijosRes.data || [];
        nextHijos = list;
        setHijos(list);
        let resolvedActiveId = null;
        setActiveAtletaId((prev) => {
          resolvedActiveId =
            prev && list.some((x) => String(x._id) === String(prev)) ? prev : list[0]?._id || null;
          return resolvedActiveId;
        });
        nextActiveId = resolvedActiveId;
        if (!list.length) {
          setLoadError(
            'No hay atletas vinculados. En administración, editá cada atleta y asigná este usuario como tutor principal.',
          );
        }
      } else {
        setActiveAtletaId(meRes.data._id);
        setHijos([]);
      }

      writeScreenCache(cacheKey, {
        profile: meRes.data,
        hijos: isTutor ? nextHijos : [],
        activeAtletaId: isTutor ? nextActiveId : meRes.data._id,
      });
    } catch (e) {
      if (
        isAuthError(e) &&
        shouldClearSessionOnAuthError(requestGeneration)
      ) {
        const refreshToken = await getToken('userRefreshToken');
        if (!refreshToken) {
          await clearSession();
        }
        setProfile(null);
        setHijos([]);
        setActiveAtletaId(null);
        setLoadError(null);
        return;
      }
      const msg = e.response?.data?.message || e.message || 'No se pudo cargar tu perfil.';
      setLoadError(msg);
      if (__DEV__) console.log('MemberProvider', msg);
    } finally {
      setLoading(false);
    }
  }, [clubData?.urlIdentifier, mode, isTutor, clearSession]);

  const selectAtleta = useCallback(
    (id) => {
      setActiveAtletaId(id);
      const key = memberCacheKey(clubData?.urlIdentifier, mode);
      if (!key) return;
      const prev = readScreenCache(key) || {};
      writeScreenCache(key, { ...prev, activeAtletaId: id });
    },
    [clubData?.urlIdentifier, mode],
  );

  useEffect(() => {
    if (!active) return;
    const key = memberCacheKey(clubData?.urlIdentifier, mode);
    if (key && readScreenCache(key)) {
      refresh({ background: true });
      return;
    }
    refresh();
  }, [active, refresh, clubData?.urlIdentifier, mode]);

  const memberId = isTutor ? activeAtletaId : profile?._id;
  const cuotasEnApp = isTutor || (profile != null && profile.cuotasEnApp !== false);
  const puedePagar = isTutor || profile?.puedePagarEnApp === true;
  const activeHijo = isTutor ? hijos.find((x) => String(x._id) === String(activeAtletaId)) : null;

  const value = {
    isTutor,
    isSocio,
    profile,
    hijos,
    activeAtletaId,
    setActiveAtletaId: selectAtleta,
    activeHijo,
    memberId,
    cuotasEnApp,
    puedePagar,
    loading,
    loadError,
    refresh,
  };

  return <MemberContext.Provider value={value}>{childNodes}</MemberContext.Provider>;
}

export function useMember() {
  const ctx = useContext(MemberContext);
  if (!ctx) {
    throw new Error('useMember debe usarse dentro de MemberProvider');
  }
  return ctx;
}

export function useMemberOptional() {
  return useContext(MemberContext);
}
