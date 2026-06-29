import { useEffect } from 'react';
import { Linking } from 'react-native';
import { handleMercadoPagoUrl } from '../utils/mpDeepLinks';

export default function MercadoPagoDeepLinkHandler() {
  useEffect(() => {
    Linking.getInitialURL().then((url) => handleMercadoPagoUrl(url));

    const sub = Linking.addEventListener('url', ({ url }) => handleMercadoPagoUrl(url));
    return () => sub.remove();
  }, []);

  return null;
}
