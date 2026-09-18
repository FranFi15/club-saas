import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

/**
 * Swipeable row that on web opens the right actions on mouse hover
 * (swipe is awkward with a mouse; phones keep the normal swipe).
 */
const HoverRevealSwipeable = forwardRef(function HoverRevealSwipeable(
  { children, enabled = true, ...swipeableProps },
  ref,
) {
  const swipeRef = useRef(null);
  const closeTimerRef = useRef(null);
  const isWeb = Platform.OS === 'web';

  useImperativeHandle(ref, () => ({
    close: () => swipeRef.current?.close?.(),
    openRight: () => swipeRef.current?.openRight?.(),
    openLeft: () => swipeRef.current?.openLeft?.(),
    reset: () => swipeRef.current?.reset?.(),
  }));

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const onMouseEnter = useCallback(() => {
    if (!enabled || !isWeb) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    swipeRef.current?.openRight?.();
  }, [enabled, isWeb]);

  const onMouseLeave = useCallback(() => {
    if (!enabled || !isWeb) return;
    // Short delay so the cursor can move onto the revealed action buttons.
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      swipeRef.current?.close?.();
      closeTimerRef.current = null;
    }, 180);
  }, [enabled, isWeb]);

  const row = (
    <Swipeable ref={swipeRef} enabled={enabled} {...swipeableProps}>
      {children}
    </Swipeable>
  );

  if (!isWeb) return row;

  return (
    <View onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {row}
    </View>
  );
});

export default HoverRevealSwipeable;
