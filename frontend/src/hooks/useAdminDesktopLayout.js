import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

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

/**
 * True when the current screen is inside the admin desktop shell
 * (sidebar chrome). Use to hide hub backs / club logo in headers.
 */
export function useIsAdminDesktopShell() {
  const { isDesktop } = useAdminDesktopLayout();
  const navigation = useNavigation();

  return useMemo(() => {
    if (!isDesktop) return false;
    let current = navigation;
    for (let i = 0; i < 8 && current; i++) {
      const names = current.getState?.()?.routeNames;
      if (Array.isArray(names) && names.includes('Estructura') && names.includes('Finanzas')) {
        return true;
      }
      current = current.getParent?.();
    }
    return false;
  }, [isDesktop, navigation]);
}
