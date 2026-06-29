import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

/**
 * Gráfico de historial wellness (ánimo pre / RPE post como valor unificado).
 */
export default function WellnessHistoryChart({ puntos, width, height = 160, colorMarca, theme }) {
  const layout = useMemo(() => {
    const data = (puntos || []).filter((p) => p && p.valor != null && !Number.isNaN(Number(p.valor)));
    const pad = { top: 12, right: 12, bottom: 28, left: 28 };
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = Math.max(1, height - pad.top - pad.bottom);
    const minV = 1;
    const maxV = 10;

    if (!data.length) return null;

    const step = data.length > 1 ? innerW / (data.length - 1) : 0;
    const coords = data.map((p, i) => {
      const v = Math.min(maxV, Math.max(minV, Number(p.valor)));
      const x = pad.left + (data.length > 1 ? i * step : innerW / 2);
      const y = pad.top + innerH - ((v - minV) / (maxV - minV)) * innerH;
      return { x, y, label: p.label, tipo: p.tipo, valor: v, key: i };
    });

    return { pad, innerW, innerH, coords, data, points: coords.map((c) => `${c.x},${c.y}`).join(' ') };
  }, [puntos, width, height]);

  const muted = theme?.textMuted || '#6b7280';
  const grid = theme?.border || '#e5e7eb';
  const color = colorMarca || '#3b82f6';

  if (!layout) {
    return (
      <View style={[styles.empty, { borderColor: grid }]}>
        <Text style={{ color: muted, textAlign: 'center' }}>Sin registros en el período.</Text>
      </View>
    );
  }

  const { pad, innerW, innerH, coords, points } = layout;
  const baselineY = pad.top + innerH;

  return (
    <View style={[styles.wrap, { borderColor: grid }]}>
      <Text style={[styles.legend, { color: muted }]}>
        Línea: ánimo (pre) o RPE (post) · escala 1–10
      </Text>
      <Svg width={width} height={height}>
        <Line x1={pad.left} y1={baselineY} x2={pad.left + innerW} y2={baselineY} stroke={grid} strokeWidth={1} />
        <Line x1={pad.left} y1={pad.top} x2={pad.left} y2={baselineY} stroke={grid} strokeWidth={1} />
        <SvgText x={4} y={pad.top + 8} fontSize={9} fill={muted}>
          10
        </SvgText>
        <SvgText x={4} y={baselineY} fontSize={9} fill={muted}>
          1
        </SvgText>
        {points ? (
          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {coords.map((c) => (
          <Circle key={c.key} cx={c.x} cy={c.y} r={4} fill={c.tipo === 'post' ? '#f59e0b' : color} />
        ))}
        {coords.length <= 8
          ? coords.map((c) => (
              <SvgText
                key={`l-${c.key}`}
                x={c.x}
                y={height - 6}
                fontSize={8}
                fill={muted}
                textAnchor="middle"
              >
                {c.label || ''}
              </SvgText>
            ))
          : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 4 },
  legend: { fontSize: 11, marginBottom: 4 },
  empty: {
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
    padding: 20,
    marginTop: 4,
  },
});
