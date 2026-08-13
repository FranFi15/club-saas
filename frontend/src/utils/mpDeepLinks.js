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
  let search = '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      path = parsed.pathname.replace(/^\/+|\/+$/g, '');
      search = parsed.search || '';
    } catch {
      const withoutScheme = normalized.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
      const [p, q] = withoutScheme.split('?');
      path = (p || '').replace(/^\/+|\/+$/g, '');
      search = q ? `?${q}` : '';
    }
  } else {
    const [p, q] = normalized.split('?');
    path = (p || '').replace(/^\/+|\/+$/g, '');
    search = q ? `?${q}` : '';
  }

  if (!path) return null;

  let mpPaymentId = null;
  let collectionStatus = null;
  if (search) {
    try {
      const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      mpPaymentId =
        params.get('payment_id') ||
        params.get('collection_id') ||
        params.get('data.id') ||
        null;
      if (mpPaymentId === 'null' || mpPaymentId === 'undefined') mpPaymentId = null;
      collectionStatus = params.get('collection_status') || params.get('status') || null;
    } catch {
      /* ignore */
    }
  }

  if (path === MP_DEEP_LINK_EVENTS.OAUTH_SUCCESS) return { type: 'oauth', status: 'success' };
  if (path === MP_DEEP_LINK_EVENTS.OAUTH_ERROR) return { type: 'oauth', status: 'error' };
  if (path === MP_DEEP_LINK_EVENTS.PAYMENT_OK) {
    return { type: 'payment', status: 'ok', mpPaymentId, collectionStatus };
  }
  if (path === MP_DEEP_LINK_EVENTS.PAYMENT_ERROR) {
    return { type: 'payment', status: 'error', mpPaymentId, collectionStatus };
  }
  if (path === MP_DEEP_LINK_EVENTS.PAYMENT_PENDING) {
    return { type: 'payment', status: 'pending', mpPaymentId, collectionStatus };
  }
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
