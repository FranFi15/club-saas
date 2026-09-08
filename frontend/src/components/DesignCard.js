import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Course-design style card (CodePen kristen17 / NPKRxBd):
 * radial accent wash + gradient rim, soft shadow, rounded shell.
 * Light: white + club/accent tint. Dark: #151419 + accent tint.
 */
export default function DesignCard({
  children,
  theme,
  isDarkMode,
  accent = '#3b82f6',
  onPress,
  style,
  contentStyle,
  contentProps,
  footer,
  muted = false,
}) {
  const base = isDarkMode ? '#151419' : '#ffffff';
  const footerBg = isDarkMode ? '#121116' : '#f8fafc';
  const rimMid = isDarkMode ? '#232228' : '#e8e8ed';
  const wash = isDarkMode ? `${accent}b8` : `${accent}55`;
  const opacity = muted ? 0.88 : 1;

  const body = onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} {...contentProps}>
      <View style={[styles.body, contentStyle]}>{children}</View>
    </TouchableOpacity>
  ) : (
    <View style={[styles.body, contentStyle]} {...contentProps}>
      {children}
    </View>
  );

  const shadow = Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isDarkMode ? 10 : 6 },
      shadowOpacity: isDarkMode ? 0.35 : 0.12,
      shadowRadius: isDarkMode ? 18 : 12,
    },
    android: { elevation: isDarkMode ? 8 : 4 },
    default: { elevation: isDarkMode ? 8 : 4 },
  });

  return (
    <View style={[styles.pressWrap, shadow, style]}>
      <View style={[styles.shell, { opacity }]}>
        <LinearGradient
          colors={[rimMid, rimMid, accent]}
          locations={[0, 0.72, 1]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.rim}
        >
          <View style={[styles.inner, { backgroundColor: base }]}>
            <LinearGradient
              colors={[wash, 'transparent', 'transparent']}
              locations={[0, 0.48, 1]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.15, y: 0.85 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {body}
            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    backgroundColor: footerBg,
                    borderTopColor: isDarkMode ? '#292929' : theme?.border || '#e5e7eb',
                  },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressWrap: {
    marginBottom: 14,
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
    minHeight: 88,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
