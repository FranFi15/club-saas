/** Plain label for tab badges / ProfileLinkRow (string or undefined). */
export function tabBadgeText(count) {
  const n = Number(count) || 0;
  if (n <= 0) return undefined;
  return n > 10 ? '+' : String(n);
}
