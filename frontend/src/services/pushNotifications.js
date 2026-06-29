import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function resolveProjectId() {
  const fromEas = Constants.easConfig?.projectId;
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  return fromEas || fromExtra || null;
}

function isPushConfigError(error) {
  const msg = String(error?.message || '');
  return msg.includes('EXPERIENCE_NOT_FOUND') || msg.includes('projectId');
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Avisos del club',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#150224',
    sound: 'default',
  });
}

export async function getDevicePushToken() {
  if (!IS_NATIVE || !Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  await ensureAndroidChannel();

  const projectId = resolveProjectId();
  try {
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenData?.data || null;
  } catch (e) {
    if (__DEV__ && isPushConfigError(e)) {
      console.warn(
        '[push] Sin proyecto EAS vinculado. Para builds: npx eas init en frontend/',
      );
    }
    return null;
  }
}

export async function registerPushTokenWithBackend(clubIdentifier) {
  if (!clubIdentifier || !IS_NATIVE) return null;

  try {
    const authToken = await getToken('userToken');
    if (!authToken) return null;

    const pushToken = await getDevicePushToken();
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

    return pushToken;
  } catch (e) {
    if (__DEV__ && !isPushConfigError(e)) {
      console.log('[push] register', e.response?.data?.message || e.message);
    }
    return null;
  }
}

export async function unregisterPushTokenFromBackend(clubIdentifier, pushToken) {
  if (!clubIdentifier || !pushToken) return;
  try {
    const authToken = await getToken('userToken');
    if (!authToken) return;

    await clubApi.delete('/users/push-token', {
      data: { token: pushToken },
      headers: {
        'x-club-identifier': clubIdentifier,
        Authorization: `Bearer ${authToken}`,
      },
    });
  } catch (e) {
    console.log('[push] unregister', e.response?.data?.message || e.message);
  }
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
