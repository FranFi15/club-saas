import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

function formatBarValue(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

/**
 * Barras verticales por fecha: serie = [{ t: Date, value: number }]
 */
export default function MeasurementBarChart({
  series,
  width,
  height = 220,
  color,
  theme,
  metricName = '',
}) {
  const layout = useMemo(() => {
    const pad = { top: 24, right: 12, bottom: 40, left: 44 };
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = Math.max(1, height - pad.top - pad.bottom);

    const pts = (series || [])
      .map((s) => ({
        t: s.t instanceof Date ? s.t : new Date(s.t),
        value: Number(s.value),
      }))
      .filter((s) => !Number.isNaN(s.value) && !Number.isNaN(s.t.getTime()))
      .sort((a, b) => a.t - b.t);

    if (pts.length === 0) {
      return { pts: [], pad, innerW, innerH, bars: [], yTicks: [], maxV: 1 };
    }

    const vals = pts.map((p) => p.value);
    let minV = Math.min(...vals);
    let maxV = Math.max(...vals);
    if (minV === maxV) {
      minV -= Math.abs(minV) * 0.05 || 1;
      maxV += Math.abs(maxV) * 0.05 || 1;
    }
    const span = maxV - minV || 1;
    const toY = (v) => pad.top + innerH - ((v - minV) / span) * innerH;

    const n = pts.length;
    const gap = Math.min(12, Math.max(6, innerW / (n * 4)));
    const barW = Math.max(14, (innerW - gap * (n - 1)) / n);

    const bars = pts.map((p, i) => {
      const h = Math.max(4, pad.top + innerH - toY(p.value));
      const x = pad.left + i * (barW + gap);
      const y = toY(p.value);
      const dd = String(p.t.getDate()).padStart(2, '0');
      const mm = String(p.t.getMonth() + 1).padStart(2, '0');
      return {
        key: `${p.t.getTime()}-${i}`,
        x,
        y,
        w: barW,
        h,
        value: p.value,
        dateLabel: `${dd}/${mm}`,
      };
    });

    const yTicks = [minV, minV + span / 2, maxV].map((v, idx) => ({
      y: toY(v),
      label: Number.isInteger(v) ? String(v) : v.toFixed(1),
      key: idx,
    }));

    return { pts, pad, innerW, innerH, bars, yTicks, maxV };
  }, [series, width, height]);

  const gridColor = theme?.border || '#e5e7eb';
  const muted = theme?.textMuted || '#6b7280';
  const barColor = color || '#3b82f6';

  if (!series || series.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: gridColor }]}>
        <Text style={{ color: muted, textAlign: 'center' }}>No hay datos para graficar.</Text>
      </View>
    );
  }

  if (layout.pts.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: gridColor }]}>
        <Text style={{ color: muted, textAlign: 'center' }}>Valores inválidos en la serie.</Text>
      </View>
    );
  }

  const { pad, innerW, innerH, bars, yTicks } = layout;

  return (
    <View style={[styles.wrap, { borderColor: gridColor }]}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((fr) => {
          const y = pad.top + innerH * (1 - fr);
          return (
            <Line
              key={fr}
              x1={pad.left}
              y1={y}
              x2={pad.left + innerW}
              y2={y}
              stroke={gridColor}
              strokeWidth={1}
              opacity={0.6}
            />
          );
        })}
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
            <Rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={barColor} opacity={0.92} />
            <SvgText
              x={b.x + b.w / 2}
              y={b.y - 6}
              fontSize={10}
              fontWeight="700"
              fill={barColor}
              textAnchor="middle"
            >
              {formatBarValue(b.value)}
            </SvgText>
            <SvgText
              x={b.x + b.w / 2}
              y={height - 10}
              fontSize={9}
              fill={muted}
              textAnchor="middle"
            >
              {b.dateLabel}
            </SvgText>
          </React.Fragment>
        ))}
        {yTicks.map((t) => (
          <SvgText
            key={t.key}
            x={pad.left - 8}
            y={t.y + 4}
            fontSize={10}
            fill={muted}
            textAnchor="end"
          >
            {t.label}
          </SvgText>
        ))}
      </Svg>
      <Text style={[styles.caption, { color: muted }]}>
        {metricName ? `${metricName} · ` : ''}Eje horizontal: fecha · vertical: valor
      </Text>
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
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  caption: { fontSize: 11, marginTop: 8, marginHorizontal: 8, marginBottom: 8 },
});
