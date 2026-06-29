import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';

function formatDotValue(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

const LABEL_OFFSET_X = 12;

/**
 * Serie ordenada por fecha ascendente: { t: Date | string ISO, value: number }
 */
export default function MeasurementLineChart({
  series,
  width,
  height = 220,
  color,
  theme,
  metricName = '',
}) {
  const layout = useMemo(() => {
    const pad = { top: 20, right: 48, bottom: 36, left: 44 };
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
      return { pts: [], pad, innerW, innerH, minV: 0, maxV: 1, polyline: '', dots: [], yTicks: [], xLabels: [] };
    }

    const vals = pts.map((p) => p.value);
    let minV = Math.min(...vals);
    let maxV = Math.max(...vals);
    if (minV === maxV) {
      minV -= Math.abs(minV) * 0.05 || 1;
      maxV += Math.abs(maxV) * 0.05 || 1;
    }
    const span = maxV - minV || 1;

    const n = pts.length;
    const toX = (i) => pad.left + (innerW * (n === 1 ? 0.5 : i / (n - 1)));
    const toY = (v) => pad.top + innerH - ((v - minV) / span) * innerH;

    const dots = pts.map((p, i) => ({ cx: toX(i), cy: toY(p.value), ...p }));
    const polyline = dots.map((d) => `${d.cx},${d.cy}`).join(' ');

    const yTicks = [minV, minV + span / 2, maxV].map((v, idx) => ({
      y: toY(v),
      label: Number.isInteger(v) ? String(v) : v.toFixed(1),
      key: idx,
    }));

    const xLabels = dots.map((d, i) => {
      const dd = String(d.t.getDate()).padStart(2, '0');
      const mm = String(d.t.getMonth() + 1).padStart(2, '0');
      return { x: d.cx, label: `${dd}/${mm}`, key: i };
    });

    return { pts, pad, innerW, innerH, minV, maxV, polyline, dots, yTicks, xLabels };
  }, [series, width, height]);

  const gridColor = theme?.border || '#e5e7eb';
  const muted = theme?.textMuted || '#6b7280';

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

  const { pad, innerW, innerH, polyline, dots, yTicks, xLabels } = layout;

  return (
    <View style={[styles.wrap, { borderColor: gridColor }]}>
      <Svg width={width} height={height}>
        {/* Grid horizontales */}
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
        {layout.pts.length >= 2 ? (
          <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {dots.map((d) => (
          <Circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
        ))}
        {dots.map((d, i) => {
          const nearRight = d.cx > pad.left + innerW * 0.72;
          const nearLeft = d.cx < pad.left + innerW * 0.28;
          let toRight = i % 2 === 0;
          if (nearRight) toRight = false;
          if (nearLeft) toRight = true;
          const v = formatDotValue(d.value);
          const shortName =
            metricName.length <= 11 ? metricName : `${metricName.slice(0, 10)}…`;
          const text = metricName ? `${shortName} ${v}` : v;
          return (
            <SvgText
              key={`lbl-${i}`}
              x={toRight ? d.cx + LABEL_OFFSET_X : d.cx - LABEL_OFFSET_X}
              y={d.cy + 4}
              fontSize={9}
              fontWeight="700"
              fill={color}
              textAnchor={toRight ? 'start' : 'end'}
            >
              {text}
            </SvgText>
          );
        })}
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
        {xLabels.map((xl) => (
          <SvgText
            key={xl.key}
            x={xl.x}
            y={height - 10}
            fontSize={9}
            fill={muted}
            textAnchor="middle"
          >
            {xl.label}
          </SvgText>
        ))}
      </Svg>
      <Text style={[styles.caption, { color: muted }]}>Eje horizontal: fecha · vertical: valor</Text>
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
