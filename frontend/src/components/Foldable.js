import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FOLD_MS = 240;

/** Height and fade for a section that opens and closes in place. */
export default function Foldable({ open, children }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: FOLD_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, progress]);

  const height = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, measured],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <Animated.View
      style={{ height, opacity, overflow: 'hidden' }}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <View
        style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
        onLayout={(event) => {
          const next = Math.ceil(event.nativeEvent.layout.height);
          if (next > 0 && next !== measured) setMeasured(next);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** Chevron that turns as the section opens. */
export function FoldableChevron({ open, color, size = 20 }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: FOLD_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="chevron-down" size={size} color={color} />
    </Animated.View>
  );
}
