import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Ancho mínimo para shell admin de escritorio (sidebar + contenido). */
export const ADMIN_DESKTOP_BREAKPOINT = 960;

/**
 * Admin en web/PC ancho: sidebar en lugar de bottom tabs.
 * En teléfono, ventana angosta o nativo sigue el shell móvil.
 */
export function useAdminDesktopLayout() {
  const { width } = useWindowDimensions();
  return useMemo(() => {
    const isWeb = Platform.OS === 'web';
    const isDesktop = isWeb && width >= ADMIN_DESKTOP_BREAKPOINT;
    return { isWeb, isDesktop, width };
  }, [width]);
}
