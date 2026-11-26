import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { FadeInUp } from 'react-native-reanimated';

/**
 * Gain-style entrance: opacity fade + slight upward move, staggered by index.
 * Same idea as MOVIL-APP / Gain — transparency + index delay.
 */

export const ENTRANCE_STEP_MS = 45;
export const ENTRANCE_DURATION_MS = 280;
export const ENTRANCE_MAX_STAGGER = 8;

/** Stable epoch string so lists can re-animate when filters/tabs change. */
export function useEntranceEpoch(...parts) {
  return useMemo(
    () => parts.map((p) => (p == null ? 'x' : String(p))).join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    parts,
  );
}

/** Web: skip until after hydration to avoid SSR/CSR opacity mismatches. */
export function useEntranceAllowed() {
  const [allowed, setAllowed] = useState(() => Platform.OS !== 'web');
  useEffect(() => {
    setAllowed(true);
  }, []);
  return allowed;
}

export function staggerEntering(index = 0, stepMs = ENTRANCE_STEP_MS, duration = ENTRANCE_DURATION_MS) {
  // Reanimated layout `entering` has caused iOS release/TestFlight crashes around
  // mount (LA manager / RCTMountingManager). Keep entrances on web only until stable.
  if (Platform.OS !== 'web') return undefined;
  return FadeInUp.delay(Math.min(Number(index) || 0, ENTRANCE_MAX_STAGGER) * stepMs).duration(
    duration,
  );
}

let webEntrancesReady = Platform.OS !== 'web';

export function markWebEntrancesReady() {
  webEntrancesReady = true;
}

const seenEntrances = new Set();

/** Play once per token so recycled FlatList rows don't re-fire. */
export function shouldPlayEntrance(token, allowed = true) {
  if (Platform.OS !== 'web') return false;
  if (!webEntrancesReady) return false;
  if (!allowed || !token || seenEntrances.has(token)) return false;
  seenEntrances.add(token);
  if (seenEntrances.size > 800) {
    const keep = [...seenEntrances].slice(-400);
    seenEntrances.clear();
    keep.forEach((k) => seenEntrances.add(k));
  }
  return true;
}

const StaggerContext = createContext(null);

/**
 * Wrap menu / list blocks so children can auto-claim a stagger index in order.
 * Reset each render so visible order stays consistent; tokens prevent re-play.
 */
export function StaggerScope({ epoch = 'stagger', children }) {
  const seq = useRef(0);
  seq.current = 0;
  const value = useMemo(
    () => ({
      epoch: String(epoch || 'stagger'),
      takeIndex: () => seq.current++,
    }),
    [epoch],
  );
  return <StaggerContext.Provider value={value}>{children}</StaggerContext.Provider>;
}

export function useStaggerSlot(explicitIndex, fallbackKey = 'item') {
  const ctx = useContext(StaggerContext);
  const stored = useRef(null);
  if (explicitIndex != null && Number.isFinite(Number(explicitIndex))) {
    return {
      index: Number(explicitIndex),
      epoch: ctx?.epoch || 'stagger',
    };
  }
  if (stored.current == null) {
    stored.current = ctx ? ctx.takeIndex() : 0;
  }
  return {
    index: stored.current,
    epoch: ctx?.epoch || fallbackKey,
  };
}
