import { ensureValidAccessToken } from '../../utils/authTokens';

export async function clubHeaders(clubData) {
  const token = await ensureValidAccessToken(clubData.urlIdentifier);
  return {
    'x-club-identifier': clubData.urlIdentifier,
    Authorization: `Bearer ${token}`,
  };
}

/** Query para endpoints que requieren atletaId cuando el usuario es tutor. */
export function memberScopeParams(isTutor, memberId) {
  if (!isTutor || !memberId) return {};
  return { atletaId: memberId };
}
