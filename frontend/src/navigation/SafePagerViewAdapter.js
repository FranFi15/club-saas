/**
 * Drop-in replacement for react-native-tab-view's PagerViewAdapter.
 * Defers setPage* until the pager is idle so a tab tap cannot race an
 * in-progress swipe (that race aborts iOS release builds).
 */
import * as React from 'react';
import { Animated, Keyboard, Platform, StyleSheet } from 'react-native';
import ViewPager from 'react-native-pager-view';
import useLatestCallback from 'use-latest-callback';

// Same helper tab-view uses internally (tiny, avoid deep imports).
function useAnimatedValue(initial) {
  const ref = React.useRef(null);
  if (ref.current == null) {
    ref.current = new Animated.Value(initial);
  }
  return ref.current;
}

const AnimatedViewPager = Animated.createAnimatedComponent(ViewPager);
const useNativeDriver = Platform.OS !== 'web';

function isPagerBusy(state) {
  return state === 'dragging' || state === 'settling';
}

export function PagerViewAdapter({
  keyboardDismissMode = 'auto',
  swipeEnabled = true,
  navigationState,
  onIndexChange,
  onTabSelect,
  onSwipeStart,
  onSwipeEnd,
  children,
  style,
  animationEnabled,
  ...rest
}) {
  const { index } = navigationState;
  const listenersRef = React.useRef([]);
  const pagerRef = React.useRef(null);
  const indexRef = React.useRef(index);
  const navigationStateRef = React.useRef(navigationState);
  const scrollStateRef = React.useRef('idle');
  const pendingIndexRef = React.useRef(null);
  const position = useAnimatedValue(index);
  const offset = useAnimatedValue(0);

  React.useEffect(() => {
    navigationStateRef.current = navigationState;
  });

  const applyIndex = React.useCallback(
    (nextIndex) => {
      if (animationEnabled) {
        pagerRef.current?.setPage(nextIndex);
      } else {
        pagerRef.current?.setPageWithoutAnimation(nextIndex);
        position.setValue(nextIndex);
      }
    },
    [animationEnabled, position],
  );

  const jumpTo = useLatestCallback((key) => {
    const nextIndex = navigationStateRef.current.routes.findIndex((route) => route.key === key);
    if (nextIndex < 0) return;

    if (isPagerBusy(scrollStateRef.current)) {
      pendingIndexRef.current = nextIndex;
      onIndexChange(nextIndex);
      return;
    }

    applyIndex(nextIndex);
    onIndexChange(nextIndex);
  });

  React.useEffect(() => {
    if (keyboardDismissMode === 'auto') {
      Keyboard.dismiss();
    }
    if (indexRef.current === index) return;

    if (isPagerBusy(scrollStateRef.current)) {
      pendingIndexRef.current = index;
      return;
    }

    applyIndex(index);
  }, [keyboardDismissMode, index, applyIndex]);

  const flushPending = React.useCallback(() => {
    const pending = pendingIndexRef.current;
    if (pending == null) return;
    pendingIndexRef.current = null;
    if (indexRef.current === pending) return;
    applyIndex(pending);
  }, [applyIndex]);

  const onPageScrollStateChanged = (state) => {
    const { pageScrollState } = state.nativeEvent;
    scrollStateRef.current = pageScrollState;

    switch (pageScrollState) {
      case 'idle':
        flushPending();
        onSwipeEnd?.();
        return;
      case 'dragging': {
        const subscription = offset.addListener(({ value }) => {
          const next = index + (value > 0 ? Math.ceil(value) : Math.floor(value));
          if (next !== index) {
            listenersRef.current.forEach((listener) => listener(next));
          }
          offset.removeListener(subscription);
        });
        onSwipeStart?.();
        return;
      }
      default:
        return;
    }
  };

  const addEnterListener = useLatestCallback((listener) => {
    listenersRef.current.push(listener);
    return () => {
      const i = listenersRef.current.indexOf(listener);
      if (i > -1) listenersRef.current.splice(i, 1);
    };
  });

  const memoizedPosition = React.useMemo(() => Animated.add(position, offset), [offset, position]);

  return children({
    position: memoizedPosition,
    addEnterListener,
    jumpTo,
    render: (pages) => (
      <AnimatedViewPager
        {...rest}
        ref={pagerRef}
        style={[styles.container, style]}
        initialPage={index}
        keyboardDismissMode={keyboardDismissMode === 'auto' ? 'on-drag' : keyboardDismissMode}
        onPageScroll={Animated.event(
          [{ nativeEvent: { position, offset } }],
          { useNativeDriver },
        )}
        onPageSelected={(e) => {
          const next = e.nativeEvent.position;
          indexRef.current = next;
          onIndexChange(next);
          onTabSelect?.({ index: next });
        }}
        onPageScrollStateChanged={onPageScrollStateChanged}
        scrollEnabled={swipeEnabled}
      >
        {pages}
      </AnimatedViewPager>
    ),
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
