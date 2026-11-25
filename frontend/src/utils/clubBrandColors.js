const DEFAULT_PRIMARY = '#3b82f6';

/** Main brand color (buttons, CTAs, highlights). */
export function clubPrimaryColor(clubData) {
  const c = String(clubData?.primaryColor || '').trim();
  return c || DEFAULT_PRIMARY;
}

/**
 * Secondary brand color for app icons (tab bar, etc.).
 * Falls back to primary when not set.
 */
export function clubIconColor(clubData) {
  const c = String(clubData?.secondaryColor || '').trim();
  return c || clubPrimaryColor(clubData);
}
