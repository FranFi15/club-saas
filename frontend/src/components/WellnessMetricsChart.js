import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { collectWellnessDates } from '../utils/wellnessHistorial';

const DEFAULT_COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#f97316', '#f59e0b', '#06b6d4'];

function computeLayout(chartSeries, scaleMax, chartHeight, width, compact, showLegend) {
  const pad = compact
    ? { top: 6, right: 8, bottom: showLegend ? 14 : 6, left: 22 }
    : { top: 12, right: 12, bottom: 28, left: 28 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, chartHeight - pad.top - pad.bottom);
  const dates = collectWellnessDates(chartSeries);
  if (!dates.length || !chartSeries.length) return null;

  const maxV = scaleMax;
  const n = dates.length;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  const lines = chartSeries.map((s, si) => {
    const color = s.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length];
    const coords = (s.puntos || [])
      .filter((p) => p.valor != null && dateIndex.has(p.fecha))
      .map((p) => {
        const i = dateIndex.get(p.fecha);
        const v = Math.min(maxV, Math.max(0, Number(p.valor)));
        const x = pad.left + (n > 1 ? i * step : innerW / 2);
        const y = pad.top + innerH - (v / (maxV || 1)) * innerH;
        return { x, y, key: `${s.key}-${i}` };
      });
    return {
      key: s.key,
      color,
      points: coords.map((c) => `${c.x},${c.y}`).join(' '),
      dots: coords,
    };
  });

  return { pad, innerW, innerH, dates, lines, baselineY: pad.top + innerH, chartHeight };
}

function ScaleChart({ chartSeries, scaleMax, chartHeight, width, compact, showLegend, muted, grid }) {
  const layout = useMemo(
    () => computeLayout(chartSeries, scaleMax, chartHeight, width, compact, showLegend),
    [chartSeries, scaleMax, chartHeight, width, compact, showLegend],
  );

  if (!layout) {
    return (
      <View style={[styles.empty, { height: chartHeight, borderColor: grid }]}>
        <Text style={{ color: muted, fontSize: compact ? 10 : 12 }}>Sin datos</Text>
      </View>
    );
  }

  const { pad, innerW, innerH, dates, lines, baselineY, chartHeight: h } = layout;

  return (
    <Svg width={width} height={h}>
      <Line x1={pad.left} y1={baselineY} x2={pad.left + innerW} y2={baselineY} stroke={grid} strokeWidth={1} />
      <Line x1={pad.left} y1={pad.top} x2={pad.left} y2={baselineY} stroke={grid} strokeWidth={1} />
      {!compact ? (
        <>
          <SvgText x={4} y={pad.top + 10} fontSize={9} fill={muted}>
            {scaleMax}
          </SvgText>
          <SvgText x={4} y={baselineY - 2} fontSize={9} fill={muted}>
            0
          </SvgText>
        </>
      ) : null}
      {lines.map((ln) =>
        ln.points ? (
          <Polyline
            key={ln.key}
            points={ln.points}
            fill="none"
            stroke={ln.color}
            strokeWidth={compact ? 1.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null,
      )}
      {lines.map((ln) => ln.dots.map((d) => <Circle key={d.key} cx={d.x} cy={d.y} r={compact ? 2.5 : 3.5} fill={ln.color} />))}
      {!compact && dates.length <= 10
        ? dates.map((d, i) => {
            const x = pad.left + (dates.length > 1 ? i * (innerW / (dates.length - 1)) : innerW / 2);
            const parts = d.split('-');
            return (
              <SvgText key={d} x={x} y={h - 6} fontSize={8} fill={muted} textAnchor="middle">
                {`${parts[2]}/${parts[1]}`}
              </SvgText>
            );
          })
        : null}
    </Svg>
  );
}

/**
 * Gráfico multi-serie: una línea por métrica (ánimo, RPE, sueño, etc.).
 */
export default function WellnessMetricsChart({
  series = [],
  width,
  height = 160,
  theme,
  colorMarca = '#3b82f6',
  compact = false,
  showLegend = true,
}) {
  const activeSeries = useMemo(
    () => (series || []).filter((s) => s.puntos?.length > 0),
    [series],
  );

  const scale10Series = useMemo(
    () => activeSeries.filter((s) => (s.scaleMax || 10) <= 10),
    [activeSeries],
  );
  const hoursSeries = useMemo(
    () => activeSeries.filter((s) => (s.scaleMax || 10) > 10),
    [activeSeries],
  );

  const muted = theme?.textMuted || '#6b7280';
  const grid = theme?.border || '#e5e7eb';
  const legendSeries = compact ? activeSeries.slice(0, 6) : activeSeries;
  const chartH10 = compact
    ? Math.max(48, height - (hoursSeries.length ? 36 : 0) - (showLegend ? 28 : 8))
    : height - (hoursSeries.length ? 70 : 0) - 24;
  const chartHHours = compact ? 32 : 56;

  if (!activeSeries.length) {
    return (
      <View style={[styles.wrap, styles.empty, { borderColor: grid, width }]}>
        <Text style={{ color: muted, textAlign: 'center', fontSize: compact ? 11 : 13 }}>
          Sin registros en el período.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { borderColor: grid, width }]}>
      {showLegend ? (
        <View style={styles.legendWrap}>
          {legendSeries.map((s, i) => {
            const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] || colorMarca;
            return (
              <View key={s.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={[styles.legendTxt, { color: muted }]} numberOfLines={1}>
                  {s.label}
                  {s.tipo === 'pre' ? ' (pre)' : ' (post)'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {scale10Series.length > 0 ? (
        <View style={styles.block}>
          {hoursSeries.length > 0 && !compact ? (
            <Text style={[styles.scaleTitle, { color: muted }]}>Escala 1–10</Text>
          ) : null}
          <ScaleChart
            chartSeries={scale10Series}
            scaleMax={10}
            chartHeight={chartH10}
            width={width}
            compact={compact}
            showLegend={showLegend}
            muted={muted}
            grid={grid}
          />
        </View>
      ) : null}
      {hoursSeries.length > 0 ? (
        <View style={styles.block}>
          <Text style={[styles.scaleTitle, { color: muted }]}>
            {compact ? 'Horas sueño' : 'Horas de sueño (máx. 12)'}
          </Text>
          <ScaleChart
            chartSeries={hoursSeries}
            scaleMax={12}
            chartHeight={chartHHours}
            width={width}
            compact={compact}
            showLegend={showLegend}
            muted={muted}
            grid={grid}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 4 },
  block: { marginTop: 4 },
  scaleTitle: { fontSize: 10, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', maxWidth: '48%' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  legendTxt: { fontSize: 10, fontWeight: '600', flexShrink: 1 },
  empty: {
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
