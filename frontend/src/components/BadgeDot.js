import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Punto o contador compacto para filas de menú / iconos.
 * @param {number} count — 0 oculta el badge
 * @param {boolean} dot — solo punto sin número
 */
export default function BadgeDot({ count = 0, dot = false, style }) {
  const n = Number(count) || 0;
  if (n <= 0 && !dot) return null;

  if (dot) {
    return <View style={[styles.dot, style]} />;
  }

  return (
    <View style={[styles.pill, style]}>
      <Text style={styles.pillTxt}>{n > 99 ? '99+' : String(n)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  pill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
