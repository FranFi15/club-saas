import axios from 'axios';
import { CLUB_API_BASE } from './apiConfig';
import { getToken, saveToken } from './storage';

export function isAccessTokenExpired(token, skewSeconds = 60) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return true;
    return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

export async function persistAuthTokens({ token, refreshToken }) {
  if (token) await saveToken('userToken', token);
  if (refreshToken) await saveToken('userRefreshToken', refreshToken);
}

export async function performTokenRefresh(clubIdentifier, refreshTokenOverride) {
  const refreshToken = refreshTokenOverride || (await getToken('userRefreshToken'));
  if (!refreshToken || !clubIdentifier) {
    throw new Error('NO_REFRESH_TOKEN');
  }

  const { data } = await axios.post(
    `${CLUB_API_BASE}/auth/refresh`,
    { refreshToken },
    {
      headers: { 'x-club-identifier': clubIdentifier },
      timeout: 15000,
    },
  );

  if (!data?.token) {
    throw new Error('REFRESH_RESPONSE_INVALID');
  }

  await persistAuthTokens({
    token: data.token,
    refreshToken: data.refreshToken,
  });

  if (data.acceptedTermsVersion != null) {
    await saveToken('acceptedTermsVersion', String(data.acceptedTermsVersion || ''));
  }

  return data;
}

export async function ensureValidAccessToken(clubIdentifier) {
  const current = await getToken('userToken');
  if (!isAccessTokenExpired(current)) return current;

  const refreshToken = await getToken('userRefreshToken');
  if (!refreshToken || !clubIdentifier) return current;

  return performTokenRefresh(clubIdentifier, refreshToken).then((data) =>
    typeof data === 'string' ? data : data?.token,
  );
}
