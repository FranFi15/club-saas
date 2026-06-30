import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { handleMercadoPagoUrl } from '../utils/mpDeepLinks';
import { APP_WEB_URL } from '../constants/appUrl';

function handleWebMercadoPagoReturn() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return false;
  const handled = handleMercadoPagoUrl(`${APP_WEB_URL}/${path}`);
  if (handled) {
    window.history.replaceState({}, document.title, '/');
  }
  return handled;
}

export default function MercadoPagoDeepLinkHandler() {
  useEffect(() => {
    handleWebMercadoPagoReturn();

    Linking.getInitialURL().then((url) => handleMercadoPagoUrl(url));

    const sub = Linking.addEventListener('url', ({ url }) => handleMercadoPagoUrl(url));
    return () => sub.remove();
  }, []);

  return null;
}
