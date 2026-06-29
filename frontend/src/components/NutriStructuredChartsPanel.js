import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SearchableDropdown from './SearchableDropdown';
import NutriMetricsChart from './NutriMetricsChart';
import { NUTRI_STRUCTURED_SECTIONS } from '../constants/nutritionMetrics';
import {
  buildNutriChartSeries,
  formatNutriChartDate,
  pickDefaultFilterId,
  seriesLatestPunto,
} from '../utils/nutriMeasurementChart';

function LatestMetricRow({ series, theme }) {
  const latest = seriesLatestPunto(series);
  return (
    <View style={[styles.latestRow, { borderColor: theme.border }]}>
      <View style={[styles.latestDot, { backgroundColor: series.color }]} />
      <Text style={[styles.latestName, { color: theme.text }]} numberOfLines={1}>
        {series.label}
      </Text>
      <View style={styles.latestValues}>
        <Text style={[styles.latestVal, { color: theme.text }]}>
          {latest ? `${latest.display} ${series.unit || ''}`.trim() : '—'}
        </Text>
        {latest?.fecha ? (
          <Text style={[styles.latestDate, { color: theme.textMuted }]}>
            {formatNutriChartDate(latest.fecha)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PromedioBanner({ series, theme, colorMarca }) {
  const latest = seriesLatestPunto(series);
  if (!latest) return null;
  return (
    <View style={[styles.banner, { borderColor: colorMarca + '55', backgroundColor: colorMarca + '12' }]}>
      <Text style={[styles.bannerLbl, { color: theme.textMuted }]}>Último registro</Text>
      <Text style={[styles.bannerVal, { color: colorMarca }]}>
        {latest.display} {series.unit || 'mm'}
      </Text>
      <Text style={[styles.bannerDate, { color: theme.textMuted }]}>
        {formatNutriChartDate(latest.fecha)}
      </Text>
    </View>
  );
}

function NutriChartSection({ section, chartLayout, theme, colorMarca }) {
  return (
    <View style={[styles.section, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.title, { color: theme.text }]}>{section.title}</Text>
      {section.subtitle ? (
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>{section.subtitle}</Text>
      ) : null}
      {section.showLatestBanner ? (
        <PromedioBanner series={section.series[0]} theme={theme} colorMarca={colorMarca} />
      ) : null}
      <NutriMetricsChart
        series={section.series}
        width={chartLayout?.chartWidth}
        theme={theme}
        colorMarca={colorMarca}
        groupedNutriCharts={false}
        showLegend={false}
        showCaption={false}
        perChartHeight={section.key === 'basicos' ? 220 : 260}
      />
      {section.showLatestList ? (
        <View style={styles.latestList}>
          <Text style={[styles.latestHead, { color: theme.textMuted }]}>Última medición</Text>
          {section.series.map((s) => (
            <LatestMetricRow key={s.key} series={s} theme={theme} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Perfil nutricionista: elegir un bloque (pliegues, diámetros, promedio, básicos)
 * con gráfico de líneas + lista de últimos valores.
 */
export default function NutriStructuredChartsPanel({
  mediciones,
  defs,
  chartLayout,
  theme,
  colorMarca,
  emptyMessage = 'Todavía no hay mediciones para graficar.',
}) {
  const [selectedSectionKey, setSelectedSectionKey] = useState('');

  const allSeries = useMemo(
    () => buildNutriChartSeries(mediciones, defs, { avgColor: colorMarca }),
    [mediciones, defs, colorMarca],
  );

  const sections = useMemo(
    () =>
      NUTRI_STRUCTURED_SECTIONS.map((meta) => ({
        ...meta,
        series: allSeries.filter(meta.match),
      })).filter((s) => s.series.length > 0),
    [allSeries],
  );

  const sectionOptions = useMemo(
    () => sections.map((s) => ({ value: s.key, label: s.title })),
    [sections],
  );

  useEffect(() => {
    setSelectedSectionKey((prev) => pickDefaultFilterId(sectionOptions, prev));
  }, [sectionOptions]);

  const activeSection = useMemo(
    () => sections.find((s) => s.key === selectedSectionKey) || sections[0] || null,
    [sections, selectedSectionKey],
  );

  if (!sections.length) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.filterLbl, { color: theme.textMuted }]}>Gráfico</Text>
      <View style={styles.dropdownWrap}>
        <SearchableDropdown
          data={sectionOptions}
          value={activeSection?.key || ''}
          onChange={setSelectedSectionKey}
          placeholder="Elegí qué ver…"
          theme={theme}
          colorMarca={colorMarca}
        />
      </View>
      {activeSection ? (
        <NutriChartSection
          section={activeSection}
          chartLayout={chartLayout}
          theme={theme}
          colorMarca={colorMarca}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  filterLbl: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  dropdownWrap: { marginBottom: 12 },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    paddingBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  subtitle: { fontSize: 12, marginTop: 4, lineHeight: 17, marginBottom: 4 },
  banner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
  },
  bannerLbl: { fontSize: 12, fontWeight: '600', width: '100%' },
  bannerVal: { fontSize: 24, fontWeight: '900' },
  bannerDate: { fontSize: 13, fontWeight: '600' },
  latestList: { marginTop: 12, gap: 0 },
  latestHead: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  latestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  latestDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  latestName: { flex: 1, fontSize: 14, fontWeight: '600' },
  latestValues: { alignItems: 'flex-end', flexShrink: 0 },
  latestVal: { fontSize: 15, fontWeight: '800' },
  latestDate: { fontSize: 11, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 16, fontSize: 15, lineHeight: 22, paddingHorizontal: 8 },
});
