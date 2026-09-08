import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

/**
 * Bottom-looking tabs with horizontal swipe (PagerView).
 * Use `tabBarPosition="bottom"` on the Navigator.
 */
export const createSwipeBottomTabNavigator = createMaterialTopTabNavigator;

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
    animationEnabled: true,
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
