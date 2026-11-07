/**
 * Desktop catalog helpers: keep card width equal to a full N-column row
 * even when the last row has fewer items (FlatList flex:1 wrappers expand otherwise).
 */

export function padCatalogData(items, columns) {
  const list = Array.isArray(items) ? items : [];
  if (columns <= 1 || list.length === 0) return list;
  const remainder = list.length % columns;
  if (remainder === 0) return list;
  const pad = columns - remainder;
  return [
    ...list,
    ...Array.from({ length: pad }, (_, i) => ({
      __catalogSpacer: true,
      _id: `__catalog-spacer-${i}`,
    })),
  ];
}

export function isCatalogSpacer(item) {
  return !!(item && item.__catalogSpacer);
}
