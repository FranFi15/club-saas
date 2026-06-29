/** Valor para `tabBarBadge` de React Navigation (undefined = sin badge). */
export function tabBadgeLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return undefined;
  return n > 99 ? '99+' : String(n);
}
