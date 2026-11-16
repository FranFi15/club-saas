import React from 'react';
import {
  ScrollView as GHScrollView,
  RefreshControl as GHRefreshControl,
} from 'react-native-gesture-handler';

/**
 * Use as FlatList `renderScrollComponent` when rows use ReanimatedSwipeable.
 * On Android, RN FlatList's native scroll does not cancel the swipeable pan, so
 * vertical scrolls get stolen after a slight sideways drift. GH ScrollView
 * participates in gesture arbitration and lets scroll win.
 *
 * Pair with `SwipeableListRefreshControl` (not RN RefreshControl).
 */
export function renderSwipeableListScroll(props) {
  return <GHScrollView {...props} />;
}

/** RefreshControl that works with `renderSwipeableListScroll`. */
export const SwipeableListRefreshControl = GHRefreshControl;
