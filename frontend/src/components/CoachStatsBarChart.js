import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

/**
 * Barras verticales: items = [{ label, value, color? }]
 */
export default function CoachStatsBarChart({
  items,
  width,
  height = 200,
  theme,
  valueSuffix = '',
  maxValue: maxValueProp,
}) {
  const layout = useMemo(() => {
    const pad = { top: 16, right: 12, bottom: 44, left: 12 };
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = Math.max(1, height - pad.top - pad.bottom);
    const data = (items || []).filter((it) => it && it.value != null && !Number.isNaN(Number(it.value)));
    const maxV = maxValueProp != null ? maxValueProp : Math.max(...data.map((d) => Number(d.value)), 1);

    const n = data.length || 1;
    const gap = 10;
    const barW = Math.max(12, (innerW - gap * (n - 1)) / n);

    const bars = data.map((it, i) => {
      const v = Number(it.value);
      const h = Math.max(4, (v / maxV) * innerH);
      const x = pad.left + i * (barW + gap);
      const y = pad.top + innerH - h;
      return { x, y, w: barW, h, label: it.label, value: v, color: it.color, key: it.key || i };
    });

    return { pad, innerW, innerH, bars, maxV, data };
  }, [items, width, height, maxValueProp]);

  const gridColor = theme?.border || '#e5e7eb';
  const muted = theme?.textMuted || '#6b7280';
  const defaultColor = theme?.primary || '#3b82f6';

  if (!layout.data.length) {
    return (
      <View style={[styles.empty, { borderColor: gridColor }]}>
        <Text style={{ color: muted, textAlign: 'center' }}>Sin datos para graficar.</Text>
      </View>
    );
  }

  const { pad, innerW, innerH, bars } = layout;

  return (
    <View style={[styles.wrap, { borderColor: gridColor }]}>
      <Svg width={width} height={height}>
        <Line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={pad.left + innerW}
          y2={pad.top + innerH}
          stroke={gridColor}
          strokeWidth={1}
        />
        {bars.map((b) => (
          <React.Fragment key={b.key}>
            <Rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={b.color || defaultColor} />
            <SvgText
              x={b.x + b.w / 2}
              y={height - 22}
              fontSize={9}
              fill={muted}
              textAnchor="middle"
            >
              {b.label.length > 8 ? `${b.label.slice(0, 7)}…` : b.label}
            </SvgText>
            <SvgText
              x={b.x + b.w / 2}
              y={b.y - 4}
              fontSize={10}
              fill={muted}
              textAnchor="middle"
              fontWeight="600"
            >
              {`${b.value}${valueSuffix}`}
            </SvgText>
          </React.Fragment>
        ))}
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
