const listeners = new Set();

export const MP_DEEP_LINK_EVENTS = {
  OAUTH_SUCCESS: 'mp-oauth/success',
  OAUTH_ERROR: 'mp-oauth/error',
  PAYMENT_OK: 'pago/ok',
  PAYMENT_ERROR: 'pago/error',
  PAYMENT_PENDING: 'pago/pendiente',
};

export function parseMercadoPagoDeepLink(url) {
  if (!url || typeof url !== 'string') return null;
  const normalized = url.trim();
  if (!normalized) return null;

  let path = '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      path = parsed.pathname.replace(/^\/+|\/+$/g, '');
    } catch {
      const withoutScheme = normalized.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
      path = withoutScheme.split('?')[0].replace(/^\/+|\/+$/g, '');
    }
  } else {
    path = normalized.replace(/^\/+|\/+$/g, '');
  }

  if (!path) return null;

  if (path === MP_DEEP_LINK_EVENTS.OAUTH_SUCCESS) return { type: 'oauth', status: 'success' };
  if (path === MP_DEEP_LINK_EVENTS.OAUTH_ERROR) return { type: 'oauth', status: 'error' };
  if (path === MP_DEEP_LINK_EVENTS.PAYMENT_OK) return { type: 'payment', status: 'ok' };
  if (path === MP_DEEP_LINK_EVENTS.PAYMENT_ERROR) return { type: 'payment', status: 'error' };
  if (path === MP_DEEP_LINK_EVENTS.PAYMENT_PENDING) return { type: 'payment', status: 'pending' };
  return null;
}

export function subscribeMercadoPagoDeepLinks(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitMercadoPagoDeepLink(event) {
  if (!event) return;
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch (e) {
      if (__DEV__) console.log('mpDeepLink listener', e.message);
    }
  });
}

export function handleMercadoPagoUrl(url) {
  const event = parseMercadoPagoDeepLink(url);
  if (event) emitMercadoPagoDeepLink(event);
  return event;
}
