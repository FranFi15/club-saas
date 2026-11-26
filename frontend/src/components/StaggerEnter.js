import React from 'react';
import { Platform, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  shouldPlayEntrance,
  staggerEntering,
  useEntranceAllowed,
  useStaggerSlot,
} from '../hooks/useEntranceEpoch';

const EntranceHost = Platform.OS === 'web'
  ? require('react-native-reanimated').default.View
  : View;

/**
 * Fade + rise entrance (Gain style). Pass index, or nest under StaggerScope for auto index.
 * Only starts when the screen is focused so tab switches don't animate off-screen (crash-prone).
 * Native uses a plain View — Reanimated layout/entering has crashed TestFlight builds.
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

  const hostProps = entering ? { entering, style } : { style };

  return <EntranceHost {...hostProps}>{children}</EntranceHost>;
}
