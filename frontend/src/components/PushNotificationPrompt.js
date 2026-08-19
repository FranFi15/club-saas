import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ClubContext } from '../context/ClubContext';
import CustomAlert from './CustomAlert';
import { needsTermsAcceptance } from '../constants/legal';
import { getToken } from '../utils/storage';
import { navigationRef } from '../navigation/navigationRef';
import {
  enablePushNotifications,
  isPushSupportedOnDevice,
  markPushPromptShown,
  setPushEnabledByUser,
  wasPushPromptShown,
} from '../services/pushNotifications';

const AUTH_ROUTES = new Set(['WorkspaceSearch', 'Login', 'TermsAcceptance']);

/** Pide permiso de notificaciones la primera vez que hay sesión activa. */
export default function PushNotificationPrompt() {
  const { clubData, sessionActive, sessionHydrated } = useContext(ClubContext);
  const [visible, setVisible] = useState(false);
  const promptedRef = useRef(false);

  const dismissPrompt = useCallback(async (enable) => {
    promptedRef.current = true;
    setVisible(false);
    await markPushPromptShown();
    if (enable && clubData?.urlIdentifier) {
      await enablePushNotifications(clubData.urlIdentifier);
    } else {
      await setPushEnabledByUser(false);
    }
  }, [clubData?.urlIdentifier]);

  const maybeShowPrompt = useCallback(async () => {
    if (!sessionHydrated || !sessionActive || !clubData?.urlIdentifier) return;
    if (!isPushSupportedOnDevice() || promptedRef.current || visible) return;
    if (!navigationRef.isReady()) return;

    const routeName = navigationRef.getCurrentRoute()?.name;
    if (!routeName || AUTH_ROUTES.has(routeName)) return;

    const alreadyShown = await wasPushPromptShown();
    if (alreadyShown) return;

    const acceptedVersion = await getToken('acceptedTermsVersion');
    if (needsTermsAcceptance(acceptedVersion)) return;

    promptedRef.current = true;
    setVisible(true);
  }, [sessionHydrated, sessionActive, clubData?.urlIdentifier, visible]);

  useEffect(() => {
    maybeShowPrompt();
  }, [maybeShowPrompt]);

  useEffect(() => {
    if (!navigationRef.isReady?.()) return undefined;
    const unsubscribe = navigationRef.addListener('state', () => {
      maybeShowPrompt();
    });
    return unsubscribe;
  }, [maybeShowPrompt]);

  return (
    <CustomAlert
      visible={visible}
      title="Notificaciones"
      message="¿Querés recibir avisos del club sobre cuotas, entrenamientos y novedades?"
      confirmText="Activar"
      cancelText="Ahora no"
      showCancel
      onConfirm={() => dismissPrompt(true)}
      onCancel={() => dismissPrompt(false)}
    />
  );
}
