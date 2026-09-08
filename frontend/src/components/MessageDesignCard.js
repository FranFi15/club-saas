import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Message cards from CodePen kristen17 / wBwNEdZ.
 * Unread (active): radial wash top-right + gradient rim accent.
 * Read: flat shell, no wash.
 */
export default function MessageDesignCard({
  children,
  isDarkMode,
  accent = '#01c3a8',
  washColor,
  active = true,
  onPress,
  style,
  contentStyle,
}) {
  const base = isDarkMode ? '#151419' : '#ffffff';
  const rimMid = isDarkMode ? '#232228' : '#e8e8ed';
  const glow = washColor || accent;
  // Pen washes: #107667ed / #00458f8f / #ffb74194 — strong top-right glow
  const washHot = isDarkMode ? `${glow}ed` : `${glow}99`;
  const washMid = isDarkMode ? `${glow}88` : `${glow}44`;

  const inner = (
    <View style={[styles.shell, style]}>
      {active ? (
        <LinearGradient
          colors={[rimMid, rimMid, rimMid, rimMid, accent]}
          locations={[0, 0.35, 0.55, 0.72, 1]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.rim}
        >
          <View style={[styles.inner, { backgroundColor: base }]}>
            <LinearGradient
              colors={[washHot, washMid, 'transparent']}
              locations={[0, 0.35, 0.72]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.05, y: 0.95 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[styles.body, contentStyle]}>{children}</View>
          </View>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.innerFlat,
            {
              backgroundColor: base,
              borderColor: isDarkMode ? '#2a2930' : '#e8e8ed',
            },
          ]}
        >
          <View style={[styles.body, contentStyle]}>{children}</View>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={[
          styles.pressWrap,
          Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: active ? 8 : 2 },
              shadowOpacity: isDarkMode ? (active ? 0.4 : 0.2) : active ? 0.14 : 0.06,
              shadowRadius: active ? 14 : 6,
            },
            android: { elevation: active ? 6 : 2 },
            default: { elevation: active ? 6 : 2 },
          }),
        ]}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return <View style={styles.pressWrap}>{inner}</View>;
}

const styles = StyleSheet.create({
  pressWrap: {
    marginBottom: 10,
  },
  shell: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  rim: {
    borderRadius: 14,
    padding: 2,
  },
  inner: {
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 96,
  },
  innerFlat: {
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    position: 'relative',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
});
