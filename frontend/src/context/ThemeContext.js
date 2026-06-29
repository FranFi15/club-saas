import React, { createContext } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme } from '../theme/colors';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const systemTheme = useColorScheme(); 
  const isDarkMode = systemTheme === 'dark';
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};