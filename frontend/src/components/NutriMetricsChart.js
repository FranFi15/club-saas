import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import {
  collectNutriDates,
  groupNutriSeriesByUnit,
  scaleMaxForNutriGroup,
} from '../utils/nutriMeasurementChart';
import { useChartLayout } from '../utils/chartLayout';
import { NUTRI_CHART_GROUP_META } from '../constants/nutritionMetrics';

function formatDotValue(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

function shortMetricName(name, isAverage) {
  if (isAverage) return 'Prom. ISAK';
  const n = String(name || '').trim();
  if (n.length <= 11) return n;
  return `${n.slice(0, 10)}…`;
}

function formatDotLabel(seriesName, value, isAverage) {
  const v = formatDotValue(value);
  if (!v) return shortMetricName(seriesName, isAverage);
  return `${shortMetricName(seriesName, isAverage)} ${v}`;
}

function latestPuntoValue(series) {
  const pts = series?.puntos || [];
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  return formatDotValue(last.valor);
}

const LABEL_OFFSET_X = 12;

/** Etiqueta al costado del punto; alterna izq/der para no superponer. */
function dotLabelSide(d, lineIndex, dotIndex, pad, innerW) {
  const nearRight = d.x > pad.left + innerW * 0.72;
  const nearLeft = d.x < pad.left + innerW * 0.28;
  let toRight = (lineIndex + dotIndex) % 2 === 0;
  if (nearRight) toRight = false;
  if (nearLeft) toRight = true;
  return {
    x: toRight ? d.x + LABEL_OFFSET_X : d.x - LABEL_OFFSET_X,
    y: d.y + 4,
    anchor: toRight ? 'start' : 'end',
  };
}

function computeLayout(chartSeries, scaleMax, chartHeight, width, compact) {
  const pad = compact
    ? { top: 12, right: 44, bottom: 22, left: 40 }
    : { top: 16, right: 52, bottom: 32, left: 48 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, chartHeight - pad.top - pad.bottom);
  const dates = collectNutriDates(chartSeries);
  if (!dates.length || !chartSeries.length) return null;

  const maxV = scaleMax > 0 ? scaleMax : 1;
  const n = dates.length;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  const singleSeries = chartSeries.length === 1;
  const lines = chartSeries.map((s) => {
    const coords = (s.puntos || [])
      .filter((p) => p.valor != null && dateIndex.has(p.fecha))
      .map((p) => {
        const i = dateIndex.get(p.fecha);
        const raw = Number(p.valor);
        const v = Math.min(maxV, Math.max(0, raw));
        const x = pad.left + (n > 1 ? i * step : innerW / 2);
        const y = pad.top + innerH - (v / maxV) * innerH;
        return {
          x,
          y,
          valor: raw,
          label: singleSeries
            ? formatDotValue(raw)
            : formatDotLabel(s.label, raw, s.isAverage),
          key: `${s.key}-${i}`,
        };
      });
    return {
      key: s.key,
      seriesLabel: s.label,
      color: s.color,
      strokeWidth: s.isAverage ? 3 : 2,
      points: coords.map((c) => `${c.x},${c.y}`).join(' '),
      dots: coords,
    };
  });

  return { pad, innerW, innerH, dates, lines, baselineY: pad.top + innerH, chartHeight };
}

function UnitChart({ chartSeries, scaleMax, chartHeight, width, compact, muted, grid }) {
  const layout = useMemo(
    () => computeLayout(chartSeries, scaleMax, chartHeight, width, compact),
    [chartSeries, scaleMax, chartHeight, width, compact],
  );

  if (!layout) {
    return (
      <View style={[styles.emptyUnit, { height: chartHeight, borderColor: grid }]}>
        <Text style={{ color: muted, fontSize: 12 }}>Sin datos en esta escala</Text>
      </View>
    );
  }

  const { pad, innerW, innerH, dates, lines, baselineY, chartHeight: h } = layout;

  return (
    <Svg width={width} height={h}>
      {[0, 0.5, 1].map((fr) => {
        const y = pad.top + innerH * (1 - fr);
        return (
          <Line
            key={fr}
            x1={pad.left}
            y1={y}
            x2={pad.left + innerW}
            y2={y}
            stroke={grid}
            strokeWidth={1}
            opacity={0.5}
          />
        );
      })}
      <Line x1={pad.left} y1={baselineY} x2={pad.left + innerW} y2={baselineY} stroke={grid} strokeWidth={1} />
      <SvgText x={4} y={pad.top + 10} fontSize={9} fill={muted}>
        {Number.isInteger(scaleMax) ? String(scaleMax) : scaleMax.toFixed(1)}
      </SvgText>
      <SvgText x={4} y={baselineY - 2} fontSize={9} fill={muted}>
        0
      </SvgText>
      {lines.map((ln) =>
        ln.points ? (
          <Polyline
            key={ln.key}
            points={ln.points}
            fill="none"
            stroke={ln.color}
            strokeWidth={ln.strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null,
      )}
      {lines.map((ln) =>
        ln.dots.map((d) => (
          <Circle key={d.key} cx={d.x} cy={d.y} r={ln.strokeWidth >= 3 ? 4.5 : 3.5} fill={ln.color} />
        )),
      )}
      {lines.map((ln, lineIndex) =>
        ln.dots.map((d, dotIndex) => {
          const pos = dotLabelSide(d, lineIndex, dotIndex, pad, innerW);
          return (
            <SvgText
              key={`lbl-${d.key}`}
              x={pos.x}
              y={pos.y}
              fontSize={9}
              fontWeight="700"
              fill={ln.color}
              textAnchor={pos.anchor}
            >
              {d.label}
            </SvgText>
          );
        }),
      )}
      {dates.length <= 12
        ? dates.map((d, i) => {
            const x = pad.left + (dates.length > 1 ? i * (innerW / (dates.length - 1)) : innerW / 2);
            const parts = d.split('-');
            return (
              <SvgText key={d} x={x} y={h - 8} fontSize={8} fill={muted} textAnchor="middle">
                {`${parts[2]}/${parts[1]}`}
              </SvgText>
            );
          })
        : null}
    </Svg>
  );
}

const UNIT_TITLES = {
  mm: 'Pliegues corporales (mm)',
  cm: 'Diámetros óseos (cm)',
};

function nutriUnitGroupTitle(unit, groupSeries) {
  if (!groupSeries?.length) return `Medidas (${unit})`;

  if (groupSeries.length === 1) {
    const s = groupSeries[0];
    if (s.area === 'datos_basicos') {
      if (s.unit === 'kg' || unit === 'kg') return 'Peso (kg)';
      if (s.unit === 'cm' || unit === 'cm') return 'Estatura (cm)';
    }
    return `${s.label} (${s.unit || unit})`;
  }

  if (unit === 'cm' && groupSeries.every((s) => s.area === 'perimetros')) {
    return 'Perímetros (cm)';
  }

  return UNIT_TITLES[unit] || `Medidas (${unit})`;
}

/**
 * Gráfico multi-serie para nutricionista: todas las medidas + promedio ISAK de pliegues.
 */
export default function NutriMetricsChart({
  series = [],
  width,
  height = 280,
  perChartHeight = 260,
  theme,
  colorMarca = '#3b82f6',
  groupedNutriCharts = false,
  showLegend = true,
  showCaption = true,
}) {
  const layout = useChartLayout({ grouped: groupedNutriCharts });
  const blockWidth = groupedNutriCharts ? layout.groupedBlockWidth : width;
  const blockHeight = groupedNutriCharts ? layout.perChartHeight : perChartHeight;

  const activeSeries = useMemo(
    () => (series || []).filter((s) => s.puntos?.length > 0),
    [series],
  );
  const unitGroups = useMemo(() => groupNutriSeriesByUnit(activeSeries), [activeSeries]);

  const nutriChartGroups = useMemo(() => {
    if (!groupedNutriCharts) return [];
    const blocks = NUTRI_CHART_GROUP_META.map((meta) => ({
      key: meta.key,
      title: meta.title,
      subtitle: meta.subtitle,
      series: activeSeries.filter(meta.match),
    })).filter((b) => b.series.length > 0);

    if (!blocks.length && activeSeries.length) {
      blocks.push({ key: 'all', title: 'Mediciones', subtitle: null, series: activeSeries });
    }
    return blocks;
  }, [groupedNutriCharts, activeSeries]);

  const muted = theme?.textMuted || '#6b7280';
  const grid = theme?.border || '#e5e7eb';
  const chartH = Math.max(160, height - 56 - unitGroups.length * 8);
  const wrapWide = layout.isWide ? { maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%' } : null;

  if (!activeSeries.length) {
    return (
      <View style={[styles.wrap, styles.empty, { borderColor: grid, width }]}>
        <Text style={{ color: muted, textAlign: 'center', fontSize: 13 }}>
          Registrá mediciones para ver la evolución de todas las medidas juntas.
        </Text>
      </View>
    );
  }

  if (groupedNutriCharts && nutriChartGroups.length) {
    return (
      <View style={[styles.separateWrap, wrapWide]}>
        {nutriChartGroups.map((block) => {
          const avgSeries = block.key === 'pliegues' ? block.series.find((s) => s.isAverage) : null;
          const avgLatest = avgSeries ? latestPuntoValue(avgSeries) : null;
          const useStackedSingles = block.key === 'basicos' && block.series.length > 1;

          return (
            <View
              key={block.key}
              style={[
                styles.separateCard,
                { borderColor: grid, backgroundColor: theme?.surface },
              ]}
            >
              <View style={styles.separateHead}>
                <Text style={[styles.separateTitle, { color: theme?.text || '#111' }]}>{block.title}</Text>
                {block.subtitle ? (
                  <Text style={[styles.separateSub, { color: muted }]}>{block.subtitle}</Text>
                ) : null}
                {avgLatest ? (
                  <Text style={[styles.separateLatest, { color: colorMarca }]}>
                    Último promedio ISAK: {avgLatest} mm
                  </Text>
                ) : null}
              </View>
              {useStackedSingles
                ? block.series.map((s) => {
                    const scaleMax = scaleMaxForNutriGroup([s]);
                    return (
                      <View key={s.key} style={styles.stackedChart}>
                        <Text style={[styles.stackedLbl, { color: theme?.text || '#111' }]}>
                          {s.label} ({s.unit})
                        </Text>
                        <UnitChart
                          chartSeries={[s]}
                          scaleMax={scaleMax}
                          chartHeight={Math.max(200, blockHeight - 20)}
                          width={Math.max(260, blockWidth - 8)}
                          compact={false}
                          muted={muted}
                          grid={grid}
                        />
                      </View>
                    );
                  })
                : (
                  <UnitChart
                    chartSeries={block.series}
                    scaleMax={scaleMaxForNutriGroup(block.series)}
                    chartHeight={blockHeight}
                    width={Math.max(260, blockWidth - 8)}
                    compact={false}
                    muted={muted}
                    grid={grid}
                  />
                )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { borderColor: grid, width: layout.isWide ? layout.chartWidth : width }, wrapWide]}>
      {showLegend ? (
        <View style={styles.legendWrap}>
          {activeSeries.map((s) => {
            const latest = latestPuntoValue(s);
            const unitSuffix = s.isAverage ? ' mm' : s.unit ? ` ${s.unit}` : '';
            return (
              <View key={s.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text
                  style={[
                    styles.legendTxt,
                    { color: muted },
                    s.isAverage && { fontWeight: '800', color: theme?.text || muted },
                  ]}
                  numberOfLines={2}
                >
                  {s.label}
                  {latest != null && latest !== ''
                    ? ` · ${latest}${unitSuffix}`
                    : !s.isAverage && s.unit
                      ? ` (${s.unit})`
                      : ''}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {unitGroups.map(([unit, groupSeries]) => {
        const scaleMax = scaleMaxForNutriGroup(groupSeries);
        const title = nutriUnitGroupTitle(unit, groupSeries);
        return (
          <View key={unit} style={styles.block}>
            <Text style={[styles.scaleTitle, { color: muted }]}>{title}</Text>
            <UnitChart
              chartSeries={groupSeries}
              scaleMax={scaleMax}
              chartHeight={unitGroups.length > 1 ? Math.max(140, chartH / unitGroups.length) : chartH}
              width={width}
              compact={false}
              muted={muted}
              grid={grid}
            />
          </View>
        );
      })}

      {showCaption ? (
        <Text style={[styles.caption, { color: muted }]}>
          Línea destacada: promedio de los pliegues ISAK registrados el mismo día · Eje horizontal: fecha
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  separateWrap: { marginTop: 4, gap: 14, width: '100%' },
  separateCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    paddingBottom: 8,
    width: '100%',
  },
  separateHead: { marginBottom: 8 },
  separateTitle: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  separateSub: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  separateLatest: { fontSize: 14, fontWeight: '800', marginTop: 6 },
  stackedChart: { marginTop: 8 },
  stackedLbl: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  block: { marginTop: 6 },
  scaleTitle: { fontSize: 11, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase' },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: '100%', flexBasis: '48%', flexGrow: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  legendTxt: { fontSize: 10, fontWeight: '600', flexShrink: 1 },
  caption: { fontSize: 11, marginTop: 10, lineHeight: 16 },
  empty: {
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyUnit: {
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
