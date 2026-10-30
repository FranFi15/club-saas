import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import ClubSpinLoader from '../components/ClubSpinLoader';

export const DEFAULT_PAGE_SIZE = 20;

/**
 * Client-side windowing for lists that already have the full dataset in memory.
 * Use server pagination (page/limit APIs) when the fetch itself is the bottleneck.
 */
export function useClientInfiniteScroll(items, {
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey,
  colorMarca,
  theme,
  showEndLabel = false,
  endLabel = 'Fin del listado',
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (visibleCount > list.length && list.length > 0) {
      setVisibleCount(list.length);
    }
  }, [list.length, visibleCount]);

  const visibleItems = useMemo(
    () => list.slice(0, visibleCount),
    [list, visibleCount],
  );

  const hasMore = visibleCount < list.length;

  const onEndReached = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((c) => Math.min(c + pageSize, list.length));
  }, [hasMore, pageSize, list.length]);

  const reset = useCallback(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  const ListFooterComponent = useMemo(() => {
    if (hasMore) {
      return (
        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
          <ClubSpinLoader size={40} />
        </View>
      );
    }
    if (showEndLabel && list.length > 0) {
      return (
        <Text
          style={{
            textAlign: 'center',
            fontSize: 12,
            fontWeight: '600',
            color: theme?.textMuted || '#94a3b8',
            marginVertical: 10,
          }}
        >
          {endLabel}
        </Text>
      );
    }
    return null;
  }, [hasMore, showEndLabel, list.length, colorMarca, theme, endLabel]);

  return {
    visibleItems,
    visibleCount,
    hasMore,
    onEndReached,
    onEndReachedThreshold: 0.35,
    ListFooterComponent,
    reset,
    totalCount: list.length,
  };
}
