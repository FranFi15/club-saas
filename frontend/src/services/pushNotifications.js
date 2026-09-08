import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { clubApi } from '../utils/api';
import { getToken, saveToken, removeToken } from '../utils/storage';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

export const PUSH_ENABLED_KEY = 'pushNotificationsEnabled';
export const PUSH_PROMPT_SHOWN_KEY = 'pushPermissionPromptShown';
export const PUSH_DEVICE_TOKEN_KEY = 'pushDeviceToken';

/** Expo Go: remote push is unsupported on Android (SDK 53+). Never load the native module there. */
export function isExpoGo() {
  return Constants.appOwnership === 'expo';
}

export function isPushSupportedOnDevice() {
  if (isExpoGo()) return false;
  return IS_NATIVE && Device.isDevice;
}

let notificationsModulePromise = null;
let handlerReady = false;

async function getNotifications() {
  if (isExpoGo() || !IS_NATIVE) return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch((e) => {
      if (__DEV__) console.warn('[push] expo-notifications unavailable:', e?.message || e);
      notificationsModulePromise = null;
      return null;
    });
  }
  return notificationsModulePromise;
}

export function initPushNotifications() {
  if (handlerReady || !IS_NATIVE || isExpoGo()) return;
  void getNotifications().then((Notifications) => {
    if (!Notifications || handlerReady) return;
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
      handlerReady = true;
    } catch (e) {
      if (__DEV__) console.warn('[push] setNotificationHandler skipped:', e?.message || e);
    }
  });
}

function resolveProjectId() {
  const fromEas = Constants.easConfig?.projectId;
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  return fromEas || fromExtra || null;
}

function isPushConfigError(error) {
  const msg = String(error?.message || '');
  return (
    msg.includes('EXPERIENCE_NOT_FOUND') ||
    msg.includes('projectId') ||
    msg.includes('Expo Go') ||
    msg.includes('development build') ||
    msg.includes('expo-notifications')
  );
}

async function ensureAndroidChannel(Notifications) {
  if (Platform.OS !== 'android' || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos del club',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#150224',
      sound: 'default',
    });
  } catch (e) {
    if (__DEV__) console.warn('[push] channel skipped:', e?.message || e);
  }
}

export async function isPushEnabledByUser() {
  const value = await getToken(PUSH_ENABLED_KEY);
  return value === 'true';
}

export async function setPushEnabledByUser(enabled) {
  await saveToken(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function wasPushPromptShown() {
  return (await getToken(PUSH_PROMPT_SHOWN_KEY)) === 'true';
}

export async function markPushPromptShown() {
  await saveToken(PUSH_PROMPT_SHOWN_KEY, 'true');
}

export async function getNotificationPermissionStatus() {
  if (!isPushSupportedOnDevice()) return 'unavailable';
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return 'unavailable';
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return 'unavailable';
  }
}

export async function requestNotificationPermission() {
  if (!isPushSupportedOnDevice()) return 'unavailable';
  try {
    const existing = await getNotificationPermissionStatus();
    if (existing === 'granted') return 'granted';
    const Notifications = await getNotifications();
    if (!Notifications) return 'unavailable';
    const { status } = await Notifications.requestPermissionsAsync();
    return status;
  } catch {
    return 'unavailable';
  }
}

export async function getDevicePushToken({ requestPermission = false } = {}) {
  if (!isPushSupportedOnDevice()) return null;

  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      if (!requestPermission) return null;
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    await ensureAndroidChannel(Notifications);

    const projectId = resolveProjectId();
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenData?.data || null;
  } catch (e) {
    if (__DEV__ && isPushConfigError(e)) {
      console.warn(
        '[push] Push no disponible en este entorno. Usá un development build o build de tienda.',
      );
    } else if (__DEV__) {
      console.warn('[push] token error:', e?.message || e);
    }
    return null;
  }
}

export async function registerPushTokenWithBackend(clubIdentifier, { requestPermission = false } = {}) {
  if (!clubIdentifier || !IS_NATIVE || isExpoGo()) return null;

  try {
    const enabled = await isPushEnabledByUser();
    if (!enabled) return null;

    const authToken = await getToken('userToken');
    if (!authToken) return null;

    const pushToken = await getDevicePushToken({ requestPermission });
    if (!pushToken) return null;

    await clubApi.post(
      '/users/push-token',
      { token: pushToken, platform: Platform.OS },
      {
        headers: {
          'x-club-identifier': clubIdentifier,
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    await saveToken(PUSH_DEVICE_TOKEN_KEY, pushToken);
    return pushToken;
  } catch (e) {
    if (__DEV__ && !isPushConfigError(e)) {
      console.log('[push] register', e.response?.data?.message || e.message);
    }
    return null;
  }
}

export async function unregisterPushTokenFromBackend(clubIdentifier, pushToken) {
  const token = pushToken || (await getToken(PUSH_DEVICE_TOKEN_KEY));
  if (!clubIdentifier || !token) return;
  try {
    const authToken = await getToken('userToken');
    if (!authToken) return;

    await clubApi.delete('/users/push-token', {
      data: { token },
      headers: {
        'x-club-identifier': clubIdentifier,
        Authorization: `Bearer ${authToken}`,
      },
    });
    await removeToken(PUSH_DEVICE_TOKEN_KEY);
  } catch (e) {
    console.log('[push] unregister', e.response?.data?.message || e.message);
  }
}

export async function enablePushNotifications(clubIdentifier) {
  await setPushEnabledByUser(true);
  return registerPushTokenWithBackend(clubIdentifier, { requestPermission: true });
}

export async function disablePushNotifications(clubIdentifier) {
  await setPushEnabledByUser(false);
  await unregisterPushTokenFromBackend(clubIdentifier);
}

export function buildNotificationItemFromPushData(data) {
  if (!data) return null;
  return {
    id: data.notificationId || `push-${Date.now()}`,
    tipo: data.tipo || 'general',
    titulo: data.title || '',
    mensaje: data.body || '',
    referencia: data.referencia || null,
    leida: false,
    createdAt: new Date().toISOString(),
  };
}

/** Subscribe to notification events; no-op in Expo Go. Returns cleanup fn. */
export async function subscribeToNotificationEvents({
  onReceived,
  onResponse,
  onLastResponse,
} = {}) {
  if (!isPushSupportedOnDevice()) return () => {};

  const Notifications = await getNotifications();
  if (!Notifications) return () => {};

  const subs = [];
  try {
    if (onReceived) {
      subs.push(Notifications.addNotificationReceivedListener(onReceived));
    }
    if (onResponse) {
      subs.push(Notifications.addNotificationResponseReceivedListener(onResponse));
    }
    if (onLastResponse) {
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) onLastResponse(response);
        })
        .catch(() => {});
    }
  } catch (e) {
    if (__DEV__) console.warn('[push] listeners skipped:', e?.message || e);
  }

  return () => {
    subs.forEach((s) => {
      try {
        s?.remove?.();
      } catch {
        /* ignore */
      }
    });
  };
}
