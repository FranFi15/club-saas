import React, { useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SearchableDropdown from './SearchableDropdown';
import MeasurementBarChart from './MeasurementBarChart';
import DesignCard from './DesignCard';
import { ThemeContext } from '../context/ThemeContext';
import {
  buildMetricTimeSeries,
  metricDropdownOptions,
} from '../utils/metricChartSeries';

/**
 * Selector de métrica + gráfico de barras (misma UX atleta prep. físico / nutrición).
 */
export default function MetricSingleBarChartPanel({
  defs,
  mediciones,
  chartMetricId,
  onChangeChartMetricId,
  chartLayout,
  theme,
  isDarkMode: isDarkModeProp,
  colorMarca,
  nutriLabels = false,
  emptyDefsMessage = 'Todavía no hay mediciones para graficar.',
  emptySeriesMessage = 'Sin datos para esta métrica.',
}) {
  const { isDarkMode: isDarkModeCtx } = useContext(ThemeContext);
  const isDarkMode = isDarkModeProp ?? isDarkModeCtx;
  const options = metricDropdownOptions(defs, { nutriLabels });
  const chartMetricDef = defs.find((d) => String(d._id) === String(chartMetricId));
  const series = buildMetricTimeSeries(mediciones, chartMetricId);

  if (!defs.length) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyDefsMessage}</Text>;
  }

  return (
    <>
      <Text style={[styles.label, { color: theme.textMuted }]}>Métrica</Text>
      <View style={styles.dropdownWrap}>
        <SearchableDropdown
          data={options}
          value={chartMetricId}
          onChange={onChangeChartMetricId}
          placeholder="Elegí una métrica…"
          theme={theme}
          colorMarca={colorMarca}
        />
      </View>
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={colorMarca}
        contentStyle={styles.chartCardInner}
      >
        {chartMetricDef ? (
          <Text style={[styles.chartTitle, { color: theme.text }]}>
            {chartMetricDef.nombre} ({chartMetricDef.unidad})
          </Text>
        ) : null}
        {series.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{emptySeriesMessage}</Text>
        ) : (
          <>
            <MeasurementBarChart
              series={series}
              width={chartLayout.chartWidth}
              height={chartLayout.singleChartHeight}
              color={colorMarca}
              theme={theme}
              metricName={chartMetricDef?.nombre || ''}
            />
            <Text style={[styles.countHint, { color: theme.textMuted }]}>
              {series.length} medición{series.length === 1 ? '' : 'es'} en el tiempo
            </Text>
          </>
        )}
      </DesignCard>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  dropdownWrap: { marginBottom: 8 },
  chartCardInner: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  chartTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  countHint: { fontSize: 12, marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 16, fontSize: 15, lineHeight: 22, paddingHorizontal: 8 },
});
