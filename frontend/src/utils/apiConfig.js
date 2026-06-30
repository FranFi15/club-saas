import Constants from 'expo-constants';
import { Platform } from 'react-native';

const FALLBACK_LAN_IP = '192.168.0.128';

function trimUrlBase(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

/** Ensures env URLs end with /api (common deploy mistake: omitting the suffix). */
function normalizeApiBase(url) {
  const trimmed = trimUrlBase(url);
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function resolveNativeApiHost() {
  const fromEnv = process.env.EXPO_PUBLIC_API_HOST;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim().split(':')[0];
  }

  const debuggerHost = Constants.expoGoConfig?.debuggerHost;
  if (debuggerHost) {
    return debuggerHost.split(':')[0];
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }

  return FALLBACK_LAN_IP;
}

function resolveApiHost() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return window.location.hostname;
    }
    return 'localhost';
  }
  return resolveNativeApiHost();
}

export const API_HOST = resolveApiHost();

const clubFromEnv = normalizeApiBase(process.env.EXPO_PUBLIC_CLUB_API_URL);
const superFromEnv = normalizeApiBase(process.env.EXPO_PUBLIC_SUPER_API_URL);

export const CLUB_API_BASE = clubFromEnv || `http://${API_HOST}:5000/api`;
export const SUPER_API_BASE = superFromEnv || `http://${API_HOST}:4000/api`;
