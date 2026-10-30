import React, { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, View, Text, StyleSheet, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SCREEN_FADE_MS } from './screenFade';

/**
 * Bottom-looking tabs with horizontal swipe (PagerView).
 * Use `tabBarPosition="bottom"` on the Navigator.
 */
const BaseSwipeBottomTab = createMaterialTopTabNavigator;

/** Un toque deja esta marca. Un swipe la borra, para no fundir al deslizar. */
let pendingTabPressFade = false;

function markTabPressFade() {
  pendingTabPressFade = true;
}

function clearTabPressFade() {
  pendingTabPressFade = false;
}

function consumeTabPressFade() {
  if (!pendingTabPressFade) return false;
  pendingTabPressFade = false;
  return true;
}

function mergeScreenListeners(screenListeners) {
  return (props) => {
    const parent =
      typeof screenListeners === 'function' ? screenListeners(props) : screenListeners || {};
    return {
      ...parent,
      tabPress: (event) => {
        markTabPressFade();
        parent.tabPress?.(event);
      },
      swipeStart: (event) => {
        clearTabPressFade();
        parent.swipeStart?.(event);
      },
    };
  };
}

/** Fundido al entrar cuando el cambio vino de un toque en el ícono. */
function TabPressFade({ children }) {
  const isFocused = useIsFocused();
  const wasFocused = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    const becameFocused = isFocused && !wasFocused.current;
    wasFocused.current = isFocused;
    if (!becameFocused || !consumeTabPressFade()) return undefined;
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: SCREEN_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [isFocused, opacity]);

  return (
    <Animated.View style={[styles.fadeHost, { opacity }]} collapsable={false}>
      {children}
    </Animated.View>
  );
}

export function createSwipeBottomTabNavigator(config) {
  const Tabs = BaseSwipeBottomTab(config);

  function Navigator({ screenLayout, screenListeners, ...rest }) {
    return (
      <Tabs.Navigator
        {...rest}
        screenListeners={mergeScreenListeners(screenListeners)}
        screenLayout={(layoutProps) => (
          <TabPressFade>
            {typeof screenLayout === 'function' ? screenLayout(layoutProps) : layoutProps.children}
          </TabPressFade>
        )}
      />
    );
  }

  return { ...Tabs, Navigator };
}

/** Fixed glyph slot so every tab icon lines up (even with badges). */
export const TAB_ICON_SIZE = 22;
export const TAB_ICON_SLOT = 24;

/**
 * Shared look & feel for role main tabs (icons + labels at the bottom, swipe enabled).
 * Badges: pass `getBadge(routeName)` → string/number; rendered on the icon (not the tab edge).
 * Labels: pass `getLabel(routeName)` → string; drawn under the icon in one centered column
 * so icon + text stay aligned (material-top-tabs defaults to a horizontal row).
 */
export function buildSwipeBottomTabOptions({
  colorMarca,
  theme,
  tabBarHeight,
  tabBottomPad,
  // Kept for call-site compat; not applied to tabBarStyle — horizontal padding
  // misaligns the top indicator vs icons (indicator ignores bar padding).
  paddingHorizontal: _paddingHorizontal = 0,
  labelFontSize = 10,
  paddingTop = 6,
  getIcon,
  getBadge,
  getLabel,
}) {
  return ({ route }) => ({
    headerShown: false,
    swipeEnabled: true,
    lazy: true,
    // Un toque ya anima el pager, y el cambio de ruta lo anima otra vez.
    // En iOS esa segunda animación cierra la app, sobre todo al volver a la primera pestaña.
    animationEnabled: false,
    tabBarActiveTintColor: colorMarca,
    tabBarInactiveTintColor: theme.icon,
    tabBarShowIcon: true,
    // Label is rendered inside tabBarIcon (column stack).
    tabBarShowLabel: false,
    tabBarIndicatorStyle: {
      backgroundColor: colorMarca,
      height: 3,
      borderRadius: 0,
    },
    tabBarIndicatorContainerStyle: {
      top: 0,
      bottom: 'auto',
      height: 3,
      left: 0,
      right: 0,
    },
    tabBarPressColor: 'transparent',
    tabBarPressOpacity: 0.85,
    tabBarAllowFontScaling: false,
    tabBarScrollEnabled: false,
    tabBarBounces: false,
    tabBarGap: 0,
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      elevation: 8,
      height: tabBarHeight,
      minHeight: tabBarHeight,
      paddingHorizontal: 0,
      paddingTop: Math.max(paddingTop, 8),
      paddingBottom: tabBottomPad,
      shadowOpacity: 0,
    },
    tabBarContentContainerStyle: {
      alignItems: 'stretch',
      paddingHorizontal: 0,
      width: '100%',
    },
    tabBarItemStyle: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 0,
      paddingTop: 6,
      paddingBottom: 0,
      margin: 0,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'visible',
    },
    tabBarIconStyle: {
      width: '100%',
      height: 'auto',
      margin: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBarBadge: undefined,
    tabBarIcon: ({ focused, color }) => {
      const raw = getBadge?.(route.name);
      const badgeLabel =
        raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0'
          ? null
          : String(raw);
      const labelText = getLabel?.(route.name);
      return (
        <View style={styles.tabCol} pointerEvents="none">
          <View style={styles.iconWrap}>
            <View style={styles.iconSlot}>{getIcon(route.name, focused, color)}</View>
            {badgeLabel ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{badgeLabel}</Text>
              </View>
            ) : null}
          </View>
          {labelText ? (
            <Text
              style={[styles.label, { color, fontSize: labelFontSize }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {labelText}
            </Text>
          ) : null}
        </View>
      );
    },
  });
}

const styles = StyleSheet.create({
  fadeHost: {
    flex: 1,
  },
  tabCol: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: TAB_ICON_SLOT,
    height: TAB_ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    width: TAB_ICON_SLOT,
    height: TAB_ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 3,
    fontWeight: '600',
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#fff',
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});
