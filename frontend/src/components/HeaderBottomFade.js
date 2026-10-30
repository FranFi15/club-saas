import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Solo un borde corto sobre la lista, para no tapar el gesto de scroll. */
export const HEADER_BOTTOM_FADE = 8;
const LIST_FADE = HEADER_BOTTOM_FADE;

function clearColor(color) {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return `${color}00`;
  return 'transparent';
}

/** El color de marca pasa al fondo. El tramo de abajo es casi transparente para que la lista se pueda scrollear. */
export default function HeaderBottomFade({ color, background = '#ffffff' }) {
  const page = background || '#ffffff';
  return (
    <View pointerEvents="none" style={styles.hitPass}>
      <LinearGradient
        pointerEvents="none"
        colors={[color, page, clearColor(page)]}
        locations={[0, 0.62, 1]}
        style={styles.fade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hitPass: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -LIST_FADE,
    height: LIST_FADE,
    zIndex: 1,
  },
  fade: {
    flex: 1,
  },
});
