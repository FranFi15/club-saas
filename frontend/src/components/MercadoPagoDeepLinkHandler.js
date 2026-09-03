import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { handleMercadoPagoUrl } from '../utils/mpDeepLinks';
import { APP_WEB_URL } from '../constants/appUrl';

const MP_RETURN_QUERY = 'mp_return';

function handleWebMercadoPagoReturn() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search || '');
    const mpReturn = params.get(MP_RETURN_QUERY);
    if (mpReturn) {
      const handled = handleMercadoPagoUrl(`${APP_WEB_URL}/${mpReturn.replace(/^\//, '')}`);
      params.delete(MP_RETURN_QUERY);
      const next = params.toString();
      window.history.replaceState({}, document.title, next ? `/?${next}` : '/');
      return handled;
    }
  } catch {
    /* ignore */
  }

  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return false;
  const handled = handleMercadoPagoUrl(`${APP_WEB_URL}/${path}${window.location.search || ''}`);
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
