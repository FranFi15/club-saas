import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

/**
 * Bottom-looking tabs with horizontal swipe (PagerView).
 * Use `tabBarPosition="bottom"` on the Navigator.
 */
export const createSwipeBottomTabNavigator = createMaterialTopTabNavigator;

/**
 * Shared look & feel for role main tabs (icons + labels at the bottom, swipe enabled).
 */
export function buildSwipeBottomTabOptions({
  colorMarca,
  theme,
  tabBarHeight,
  tabBottomPad,
  paddingHorizontal = 8,
  labelFontSize = 10,
  paddingTop = 10,
  getIcon,
}) {
  return ({ route }) => ({
    headerShown: false,
    swipeEnabled: true,
    lazy: true,
    animationEnabled: true,
    tabBarActiveTintColor: colorMarca,
    tabBarInactiveTintColor: theme.icon,
    tabBarShowIcon: true,
    tabBarShowLabel: true,
    tabBarIndicatorStyle: { height: 0, width: 0 },
    tabBarPressColor: 'transparent',
    tabBarPressOpacity: 0.85,
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      elevation: 12,
      height: tabBarHeight,
      minHeight: tabBarHeight,
      paddingHorizontal,
      paddingTop,
      paddingBottom: tabBottomPad,
      shadowOpacity: 0,
    },
    tabBarItemStyle: {
      paddingVertical: 2,
      justifyContent: 'center',
    },
    tabBarLabelStyle: {
      fontSize: labelFontSize,
      fontWeight: '600',
      textTransform: 'none',
      marginTop: 2,
      marginBottom: 0,
    },
    tabBarIconStyle: { marginBottom: 0 },
    tabBarIcon: ({ focused, color }) => getIcon(route.name, focused, color),
  });
}
