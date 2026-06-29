import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Ancho mínimo de ventana para tratar la UI como escritorio. */
export const CHART_WIDE_BREAKPOINT = 720;

const MOBILE_CHART_MAX = 400;
const DESKTOP_CHART_MAX = 680;
const DESKTOP_CONTENT_MAX = 960;
/**
 * Dimensiones de gráficos que se adaptan al ancho de ventana (web/PC y resize).
 */
export function useChartLayout({ grouped = false } = {}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = windowWidth >= CHART_WIDE_BREAKPOINT;

  return useMemo(() => {
    const sidePad = isWide ? 48 : 32;
    const contentMaxWidth = isWide
      ? Math.min(windowWidth - sidePad, DESKTOP_CONTENT_MAX)
      : Math.max(280, windowWidth - sidePad);

    const chartsInRow = false;
    const groupedBlockWidth = Math.min(
      contentMaxWidth - 24,
      isWide ? DESKTOP_CHART_MAX : MOBILE_CHART_MAX,
    );

    const chartWidth = Math.min(
      contentMaxWidth - 24,
      isWide ? DESKTOP_CHART_MAX : MOBILE_CHART_MAX,
    );

    const perChartHeight = isWide
      ? Math.min(420, Math.max(320, Math.round(windowHeight * 0.36)))
      : 300;

    const singleChartHeight = isWide
      ? Math.min(360, Math.max(260, Math.round(windowHeight * 0.32)))
      : 240;

    return {
      isWeb,
      isWide,
      contentMaxWidth,
      chartWidth,
      groupedBlockWidth,
      chartsInRow,
      perChartHeight,
      singleChartHeight,
    };
  }, [windowWidth, windowHeight, isWeb, isWide, grouped]);
}

/** Contenedor centrado para pantallas con gráficos en escritorio. */
export function chartContentWrapStyle(layout) {
  if (!layout?.isWide) return null;
  return {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
  };
}
