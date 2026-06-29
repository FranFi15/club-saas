import { DarkTheme, DefaultTheme } from '@react-navigation/native';

export function buildNavigationTheme(theme, isDarkMode) {
  const base = isDarkMode ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDarkMode,
    colors: {
      ...base.colors,
      primary: theme.text,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
    },
  };
}
