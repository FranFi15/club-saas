import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';

/**
 * Mini gráfico de línea para historial wellness (valor 1–10).
 * puntos: [{ valor, label? }]
 */
export default function WellnessSparkline({
  puntos,
  width = 200,
  height = 56,
  color = '#3b82f6',
  theme,
  showLabels = false,
}) {
  const layout = useMemo(() => {
    const data = (puntos || []).filter((p) => p && p.valor != null && !Number.isNaN(Number(p.valor)));
    const pad = { top: 8, right: 6, bottom: showLabels ? 18 : 8, left: 6 };
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = Math.max(1, height - pad.top - pad.bottom);
    const minV = 1;
    const maxV = 10;

    if (!data.length) return { data: [], points: '', dots: [] };

    const step = data.length > 1 ? innerW / (data.length - 1) : 0;
    const coords = data.map((p, i) => {
      const v = Math.min(maxV, Math.max(minV, Number(p.valor)));
      const x = pad.left + (data.length > 1 ? i * step : innerW / 2);
      const y = pad.top + innerH - ((v - minV) / (maxV - minV)) * innerH;
      return { x, y, label: p.label, valor: v, key: i };
    });

    const points = coords.map((c) => `${c.x},${c.y}`).join(' ');
    return { data, points, dots: coords, pad, innerW, innerH };
  }, [puntos, width, height, showLabels]);

  const muted = theme?.textMuted || '#9ca3af';
  const grid = theme?.border || '#e5e7eb';

  if (!layout.data.length) {
    return (
      <View style={[styles.empty, { width, height, borderColor: grid }]}>
        <Text style={{ color: muted, fontSize: 11 }}>Sin historial</Text>
      </View>
    );
  }

  const baselineY = layout.pad.top + layout.innerH;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Line
          x1={layout.pad.left}
          y1={baselineY}
          x2={layout.pad.left + layout.innerW}
          y2={baselineY}
          stroke={grid}
          strokeWidth={1}
        />
        {layout.points ? (
          <Polyline
            points={layout.points}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {layout.dots.map((d) => (
          <Circle key={d.key} cx={d.x} cy={d.y} r={3} fill={color} />
        ))}
      </Svg>
      {showLabels && layout.dots.length > 0 ? (
        <View style={[styles.labels, { paddingHorizontal: layout.pad.left }]}>
          <Text style={[styles.labelTxt, { color: muted }]} numberOfLines={1}>
            {layout.dots[0].label || ''}
          </Text>
          <Text style={[styles.labelTxt, { color: muted }]} numberOfLines={1}>
            {layout.dots[layout.dots.length - 1].label || ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  labelTxt: { fontSize: 9, maxWidth: 48 },
});
