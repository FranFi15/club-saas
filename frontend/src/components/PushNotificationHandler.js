import { useCallback, useContext, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { ClubContext } from '../context/ClubContext';
import { useBadgesOptional } from '../context/BadgeContext';
import { useMemberOptional } from '../context/MemberContext';
import { getToken } from '../utils/storage';
import {
  registerPushTokenWithBackend,
  isPushEnabledByUser,
} from '../services/pushNotifications';
import { navigateFromNotification } from '../utils/notificationNavigation';
import { navigationRef } from '../navigation/navigationRef';
import { clearScreenCacheMatching } from '../hooks/useCachedFocusLoad';

async function buildNavCtx() {
  const rol = await getToken('userRol');
  return {
    rol: rol || null,
    isTutor: rol === 'tutor',
    cuotasEnApp: true,
  };
}

function handlePushNavigation(response) {
  const content = response?.notification?.request?.content;
  const data = content?.data || {};
  const item = {
    id: data.notificationId || `push-${Date.now()}`,
    tipo: data.tipo || 'general',
    titulo: content?.title || data.title || 'Notificación',
    mensaje: content?.body || data.body || '',
    referencia: data.referencia || null,
    conversationId: data.conversationId || null,
    leida: false,
    createdAt: new Date().toISOString(),
  };
  if (!navigationRef.isReady()) return;

  buildNavCtx().then((ctx) => {
    navigateFromNotification(navigationRef, item, ctx);
  });
}

export default function PushNotificationHandler() {
  const { clubData, sessionActive } = useContext(ClubContext);
  const badges = useBadgesOptional();
  const member = useMemberOptional();
  const registeredRef = useRef(false);

  const syncPushRegistration = useCallback(async () => {
    if (!clubData?.urlIdentifier || !sessionActive) return;
    const authToken = await getToken('userToken');
    if (!authToken) return;
    if (!(await isPushEnabledByUser())) return;

    await registerPushTokenWithBackend(clubData.urlIdentifier);
    registeredRef.current = true;
  }, [clubData?.urlIdentifier, sessionActive]);

  useEffect(() => {
    registeredRef.current = false;
    syncPushRegistration();
  }, [syncPushRegistration]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((response) => {
      const tipo = response?.notification?.request?.content?.data?.tipo;
      if (['consulta_confirmada', 'consulta_rechazada'].includes(tipo)) {
        clearScreenCacheMatching((key) => key.startsWith('member-agenda:'));
      }
      badges?.refresh?.();
      member?.refresh?.({ background: true });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.atletaId && member?.setActiveAtletaId) {
        member.setActiveAtletaId(data.atletaId);
      }
      const tipo = data?.tipo;
      if (['consulta_confirmada', 'consulta_rechazada'].includes(tipo)) {
        clearScreenCacheMatching((key) => key.startsWith('member-agenda:'));
      }
      handlePushNavigation(response);
      badges?.refresh?.();
      member?.refresh?.({ background: true });
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      setTimeout(() => handlePushNavigation(response), 600);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [badges, member]);

  return null;
}
