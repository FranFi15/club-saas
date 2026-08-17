import axios from 'axios';
import { Platform } from 'react-native';
import { API_HOST, SUPER_API_BASE, CLUB_API_BASE } from './apiConfig';
import { getToken } from './storage';
import { CLUB_WORKSPACE_KEY, clearAuthSession, notifySessionExpired } from './session';

export const superAdminApi = axios.create({
  baseURL: SUPER_API_BASE,
  timeout: 15000,
});

export const clubApi = axios.create({
  baseURL: CLUB_API_BASE,
  timeout: 15000,
});

if (__DEV__ && Platform.OS !== 'web') {
  console.log(`[api] host=${API_HOST} super=${SUPER_API_BASE} club=${CLUB_API_BASE}`);
}

let refreshInFlight = null;

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase());
  }
  return headers[name] || headers[name.toLowerCase()];
}

function setHeader(headers, name, value) {
  if (typeof headers.set === 'function') {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
}

function isAccessTokenExpired(token, skewSeconds = 60) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return true;
    return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

async function resolveClubIdentifier(config) {
  const fromHeader = getHeader(config?.headers, 'x-club-identifier');
  if (fromHeader) return fromHeader;

  const savedClub = await getToken(CLUB_WORKSPACE_KEY);
  if (!savedClub) return null;
  try {
    const parsed = JSON.parse(savedClub);
    return parsed?.urlIdentifier || null;
  } catch {
    return null;
  }
}

function isAuthRoute(config) {
  const url = String(config?.url || '');
  return url.includes('/auth/login') || url.includes('/auth/refresh');
}

async function refreshAccessToken(clubIdentifier) {
  if (!refreshInFlight) {
    refreshInFlight = import('./authTokens')
      .then(async ({ performTokenRefresh }) => {
        const data = await performTokenRefresh(clubIdentifier);
        return typeof data === 'string' ? data : data?.token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function attachFreshAuthHeaders(config) {
  if (isAuthRoute(config)) return config;

  const clubIdentifier = await resolveClubIdentifier(config);
  const refreshToken = await getToken('userRefreshToken');
  let accessToken = await getToken('userToken');

  if (clubIdentifier && refreshToken && isAccessTokenExpired(accessToken)) {
    try {
      accessToken = await refreshAccessToken(clubIdentifier);
    } catch {
      // Response interceptor will handle a 401 if refresh fails.
    }
  }

  config.headers = config.headers || {};
  if (clubIdentifier) {
    setHeader(config.headers, 'x-club-identifier', clubIdentifier);
  }
  if (accessToken) {
    setHeader(config.headers, 'Authorization', `Bearer ${accessToken}`);
  }

  return config;
}

clubApi.interceptors.request.use(attachFreshAuthHeaders, (error) => Promise.reject(error));

clubApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (!originalRequest || status !== 401 || originalRequest._authRetry) {
      return Promise.reject(error);
    }
    if (isAuthRoute(originalRequest)) {
      return Promise.reject(error);
    }

    const clubIdentifier = await resolveClubIdentifier(originalRequest);
    const refreshToken = await getToken('userRefreshToken');
    if (!clubIdentifier || !refreshToken) {
      return Promise.reject(error);
    }

    originalRequest._authRetry = true;

    try {
      const newToken = await refreshAccessToken(clubIdentifier);
      originalRequest.headers = originalRequest.headers || {};
      setHeader(originalRequest.headers, 'Authorization', `Bearer ${newToken}`);
      setHeader(originalRequest.headers, 'x-club-identifier', clubIdentifier);
      return clubApi(originalRequest);
    } catch (refreshError) {
      await clearAuthSession();
      notifySessionExpired();
      return Promise.reject(refreshError);
    }
  },
);
