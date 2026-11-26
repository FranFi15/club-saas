import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ClubContext } from './ClubContext';
import { clubHeaders } from '../screens/athlete/athleteApi';
import { clubApi } from '../utils/api';
import { persistUserTokensFromProfile } from '../utils/profileTokens';
import { getToken } from '../utils/storage';
import { isAuthError, getAuthGeneration, shouldClearSessionOnAuthError } from '../utils/session';
import { readScreenCache, writeScreenCache } from '../hooks/useCachedFocusLoad';

function memberCacheKey(urlIdentifier, mode) {
  if (!urlIdentifier) return '';
  return `member-profile:${urlIdentifier}:${mode || 'shell'}`;
}

function roleList(profile) {
  if (Array.isArray(profile?.roles) && profile.roles.length) return profile.roles;
  if (profile?.rol) return [profile.rol];
  return [];
}

export const MemberContext = createContext(null);

export function MemberProvider({ mode, children: childNodes }) {
  const { clubData, clearSession } = useContext(ClubContext);
  const shellTutor = mode === 'tutor';
  const shellSocio = mode === 'socio';
  const shellAtleta = mode === 'atleta';

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
    const accessToken = await getToken('userToken');
    const refreshTokenProbe = await getToken('userRefreshToken');
    if (!accessToken && !refreshTokenProbe) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    if (!background) setLoading(true);
    setLoadError(null);
    const requestGeneration = getAuthGeneration();
    const cacheKey = memberCacheKey(clubData.urlIdentifier, mode);
    try {
      const h = await clubHeaders(clubData);
      const meRes = await clubApi.get('/users/me', { headers: h });
      setProfile(meRes.data);
      await persistUserTokensFromProfile(meRes.data);

      const roles = roleList(meRes.data);
      const tutorCapable = roles.includes('tutor');

      let nextHijos = [];
      let nextActiveId = meRes.data._id;

      if (tutorCapable) {
        try {
          const hijosRes = await clubApi.get('/users/mis-hijos', { headers: h });
          const list = Array.isArray(hijosRes.data) ? hijosRes.data : [];
          nextHijos = list;
          setHijos(list);
          let resolvedActiveId = null;
          setActiveAtletaId((prev) => {
            resolvedActiveId =
              prev && list.some((x) => String(x._id) === String(prev)) ? prev : list[0]?._id || null;
            return resolvedActiveId;
          });
          nextActiveId = resolvedActiveId;
          if (shellTutor && !list.length) {
            setLoadError(
              'No hay atletas vinculados. En administración, editá cada atleta y asigná este usuario como tutor principal.',
            );
          }
        } catch (e) {
          if (shellTutor) throw e;
          setHijos([]);
          setActiveAtletaId(meRes.data._id);
          nextHijos = [];
          nextActiveId = meRes.data._id;
        }
      } else {
        setActiveAtletaId(meRes.data._id);
        setHijos([]);
      }

      writeScreenCache(cacheKey, {
        profile: meRes.data,
        hijos: tutorCapable ? nextHijos : [],
        activeAtletaId: tutorCapable ? nextActiveId : meRes.data._id,
      });
    } catch (e) {
      if (isAuthError(e) && shouldClearSessionOnAuthError(requestGeneration)) {
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
  }, [clubData?.urlIdentifier, mode, shellTutor, clearSession]);

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
    if (!clubData?.urlIdentifier) return;
    const key = memberCacheKey(clubData.urlIdentifier, mode);
    if (key && readScreenCache(key)) {
      refresh({ background: true });
      return;
    }
    refresh();
  }, [refresh, clubData?.urlIdentifier, mode]);

  const roles = useMemo(() => roleList(profile), [profile]);
  const isTutor = shellTutor || roles.includes('tutor');
  const isSocio = shellSocio || roles.includes('socio');
  const hasAtletaRole = shellAtleta || roles.includes('atleta');

  const memberId = isTutor && shellTutor ? activeAtletaId : profile?._id;
  const cuotasEnApp =
    isTutor ||
    isSocio ||
    (hasAtletaRole && profile != null && profile.cuotasEnApp !== false);
  const puedePagar =
    isTutor ||
    isSocio ||
    profile?.puedePagarEnApp === true ||
    profile?.puedePagarComoAtleta === true;
  const showCuotasEntry =
    isTutor ||
    isSocio ||
    (hasAtletaRole && profile != null && profile.cuotasEnApp !== false);
  const activeHijo = isTutor ? hijos.find((x) => String(x._id) === String(activeAtletaId)) : null;

  const value = {
    mode,
    isTutor,
    isSocio,
    hasAtletaRole,
    roles,
    showCuotasEntry,
    profile,
    hijos,
    activeAtletaId,
    setActiveAtletaId: selectAtleta,
    activeHijo,
    memberId: memberId || profile?._id,
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
