import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { USE_NATIVE_DRIVER } from '../utils/nativeDriver';

/**
 * Compact three-dot pulse for button / inline loading.
 * Prefer this over ClubSpinLoader inside buttons (especially when several can busy at once).
 */
export default function ButtonDotsLoader({ color = '#fff', size = 7, style }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  const dots = [a, b, c];

  useEffect(() => {
    const loops = dots.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 320,
            easing: Easing.in(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.delay(220),
        ]),
      ),
    );
    loops.forEach((anim) => anim.start());
    return () => loops.forEach((anim) => anim.stop());
    // values are stable Animated.Value refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.row, style]} accessibilityRole="progressbar" accessibilityLabel="Cargando">
      {dots.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            marginHorizontal: 2.5,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [
              {
                scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.15] }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 22,
  },
});
