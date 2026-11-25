import React from 'react';
import Animated from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import {
  shouldPlayEntrance,
  staggerEntering,
  useEntranceAllowed,
  useStaggerSlot,
} from '../hooks/useEntranceEpoch';

/**
 * Fade + rise entrance (Gain style). Pass index, or nest under StaggerScope for auto index.
 * Only starts when the screen is focused so tab switches don't animate off-screen (crash-prone).
 */
export default function StaggerEnter({
  index: explicitIndex,
  token,
  children,
  style,
  enabled = true,
}) {
  const isFocused = useIsFocused();
  const allowed = useEntranceAllowed() && isFocused;
  const { index, epoch } = useStaggerSlot(explicitIndex);
  const playToken = token || `${epoch}:${index}`;
  const entering =
    enabled && shouldPlayEntrance(playToken, allowed) ? staggerEntering(index) : undefined;

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
