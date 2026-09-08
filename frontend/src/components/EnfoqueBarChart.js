import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { ENFOQUE_COLORS, ENFOQUE_LABELS } from '../constants/trainingEnfoque';

/**
 * Barras horizontales por minutos de enfoque táctico.
 * Valor encima de cada barra; etiqueta a la izquierda.
 * items: [{ key, minutos, porcentaje }]
 */
export default function EnfoqueBarChart({ items, width, theme, colorMarca }) {
  const rowH = 46;
  const barH = 16;
  const pad = { top: 8, left: 100, right: 12 };
  const chartItems = (items || []).filter((it) => it.minutos > 0);
  const height = Math.max(120, pad.top + chartItems.length * rowH + 8);
  const innerW = Math.max(1, width - pad.left - pad.right);
  const maxMins = Math.max(...chartItems.map((i) => i.minutos), 1);

  const rows = useMemo(
    () =>
      chartItems.map((it, idx) => {
        const barW = Math.max(4, (it.minutos / maxMins) * innerW);
        const y = pad.top + idx * rowH;
        const color = ENFOQUE_COLORS[it.key] || colorMarca;
        const label = ENFOQUE_LABELS[it.key] || it.key;
        return { ...it, barW, y, color, label, key: it.key || idx };
      }),
    [chartItems, innerW, maxMins, colorMarca],
  );

  const muted = theme?.textMuted || '#6b7280';
  const textColor = theme?.text || '#111827';
  const gridColor = theme?.border || '#e5e7eb';

  if (!chartItems.length) {
    return (
      <View style={[styles.empty, { borderColor: gridColor }]}>
        <Text style={{ color: muted, textAlign: 'center' }}>
          Sin bloques con enfoque en sesiones completadas.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { borderColor: gridColor }]}>
      <Svg width={width} height={height}>
        {rows.map((r) => {
          const valueY = r.y + 12;
          const barY = r.y + 18;
          const labelY = barY + barH / 2 + 4;
          return (
            <React.Fragment key={r.key}>
              <SvgText x={4} y={labelY} fontSize={11} fill={muted} textAnchor="start">
                {r.label}
              </SvgText>
              <SvgText x={pad.left} y={valueY} fontSize={11} fill={textColor} fontWeight="700" textAnchor="start">
                {`${r.minutos} min · ${r.porcentaje}%`}
              </SvgText>
              <Rect x={pad.left} y={barY} width={r.barW} height={barH} rx={4} fill={r.color} opacity={0.9} />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  empty: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
});
