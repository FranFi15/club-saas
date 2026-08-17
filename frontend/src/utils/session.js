import { removeToken } from './storage';

export const CLUB_WORKSPACE_KEY = 'clubWorkspace';

const AUTH_KEYS = [
  'userToken',
  'userRefreshToken',
  'userRol',
  'userId',
  'userNombre',
  'userApellido',
  'userFotoPerfil',
  'acceptedTermsVersion',
];

let authGeneration = 0;
let sessionExpiredHandler = null;

/** Invalida respuestas 401 de peticiones iniciadas antes del login actual. */
export function beginAuthSession() {
  authGeneration += 1;
  return authGeneration;
}

export function getAuthGeneration() {
  return authGeneration;
}

export function registerSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler;
}

export function notifySessionExpired() {
  sessionExpiredHandler?.();
}

export async function clearAuthSession() {
  beginAuthSession();
  await Promise.all(AUTH_KEYS.map((key) => removeToken(key)));
}

export function isAuthError(error) {
  return error?.response?.status === 401 || error?.response?.status === 403;
}

export function shouldClearSessionOnAuthError(requestGeneration) {
  return requestGeneration === getAuthGeneration();
}
