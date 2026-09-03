import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { lightTheme, darkTheme } from '../theme/colors';

export function buildNavigationTheme(theme, isDarkMode) {
  const base = isDarkMode ? DarkTheme : DefaultTheme;
  const colors = theme || (isDarkMode ? darkTheme : lightTheme);
  return {
    ...base,
    dark: isDarkMode,
    colors: {
      ...base.colors,
      primary: colors.text,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };
}
