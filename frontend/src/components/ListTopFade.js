import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function clearColor(color) {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return `${color}00`;
  return 'transparent';
}

/** Degradé corto en la parte de arriba de una lista. No intercepta el scroll. */
export default function ListTopFade({ color = '#f3f4f6' }) {
  const page = color || '#f3f4f6';
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[page, clearColor(page)]}
      style={styles.fade}
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    zIndex: 2,
  },
});
