import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

const screenCache = new Map();

export function readScreenCache(key) {
  if (!key) return undefined;
  return screenCache.get(key)?.data;
}

export function writeScreenCache(key, data) {
  if (!key) return;
  screenCache.set(key, { data, fetchedAt: Date.now() });
}

export function clearScreenCache(key) {
  if (key) screenCache.delete(key);
}

export function clearAllScreenCache() {
  screenCache.clear();
}

export function clearScreenCacheMatching(matchFn) {
  if (typeof matchFn !== 'function') return;
  for (const key of [...screenCache.keys()]) {
    if (matchFn(key)) screenCache.delete(key);
  }
}

/**
 * Stale-while-revalidate: muestra datos en caché al volver a la pantalla,
 * refresca en segundo plano y soporta pull-to-refresh manual.
 */
export function useCachedFocusLoad({
  cacheKey,
  enabled = true,
  fetchData,
  onFetched,
  onFetchError,
  onFocus,
}) {
  const hasCache = enabled && cacheKey && screenCache.has(cacheKey);
  const [loading, setLoading] = useState(() => enabled && !hasCache);
  const [refreshing, setRefreshing] = useState(false);
  const fetchGenRef = useRef(0);
  const cacheKeyRef = useRef(cacheKey);
  const fetchRef = useRef(fetchData);
  const onFetchedRef = useRef(onFetched);
  const onErrorRef = useRef(onFetchError);
  fetchRef.current = fetchData;
  onFetchedRef.current = onFetched;
  onErrorRef.current = onFetchError;
  cacheKeyRef.current = cacheKey;

  const runFetch = useCallback(
    async ({ background = false, pull = false } = {}) => {
      if (!enabled || !cacheKey) return;

      const gen = ++fetchGenRef.current;
      const keyForRequest = cacheKey;
      const hadCache = screenCache.has(keyForRequest);

      if (pull) setRefreshing(true);
      else if (!background && !hadCache) setLoading(true);

      try {
        const data = await fetchRef.current();
        if (gen !== fetchGenRef.current) return;
        if (cacheKeyRef.current !== keyForRequest) return;

        writeScreenCache(keyForRequest, data);
        onFetchedRef.current?.(data);
      } catch (e) {
        if (gen !== fetchGenRef.current) return;
        if (cacheKeyRef.current !== keyForRequest) return;
        if (!background && !screenCache.has(keyForRequest)) {
          onErrorRef.current?.(e);
        }
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [enabled, cacheKey],
  );

  useEffect(() => {
    if (!enabled || !cacheKey) {
      setLoading(false);
      return;
    }

    const cached = readScreenCache(cacheKey);
    if (cached !== undefined) {
      onFetchedRef.current?.(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    runFetch({ background: cached !== undefined });
  }, [cacheKey, enabled, runFetch]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        onFocus?.();
        return undefined;
      }

      runFetch({ background: true });
      onFocus?.();
      return undefined;
    }, [enabled, runFetch, onFocus]),
  );

  const onRefresh = useCallback(() => {
    runFetch({ background: true, pull: true });
  }, [runFetch]);

  const reload = useCallback(
    (options) => {
      runFetch(options ?? { background: true });
    },
    [runFetch],
  );

  return { loading, refreshing, onRefresh, reload };
}
