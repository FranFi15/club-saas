import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/** Plain label for list rows / ProfileLinkRow (string or undefined). */
export function tabBadgeText(count) {
  const n = Number(count) || 0;
  if (n <= 0) return undefined;
  return n > 10 ? '+' : String(n);
}

/**
 * Badge for swipeable bottom tabs (material-top-tabs).
 * Must be a function returning a React element — unlike bottom-tabs' string/number badge.
 * @returns {undefined | (() => React.ReactElement)}
 */
export function tabBadgeLabel(count) {
  const label = tabBadgeText(count);
  if (!label) return undefined;
  return function TabBadge() {
    return (
      <View style={styles.badge}>
        <Text style={styles.txt}>{label}</Text>
      </View>
    );
  };
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  txt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
