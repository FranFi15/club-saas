import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SearchableDropdown from './SearchableDropdown';
import NutriMetricsChart from './NutriMetricsChart';
import {
  buildNutriChartSeries,
  nutriChartFilterOptions,
} from '../utils/nutriMeasurementChart';

/**
 * Gráfico de líneas nutricionista con filtro para ver una métrica a la vez.
 */
export default function NutriFilteredLineChartPanel({
  mediciones,
  defs,
  chartMetricId,
  onChangeChartMetricId,
  chartLayout,
  theme,
  colorMarca,
  emptyMessage = 'Todavía no hay mediciones para graficar.',
}) {
  const options = useMemo(() => nutriChartFilterOptions(mediciones, defs), [mediciones, defs]);
  const series = useMemo(
    () =>
      chartMetricId
        ? buildNutriChartSeries(mediciones, defs, { avgColor: colorMarca, metricId: chartMetricId })
        : [],
    [mediciones, defs, colorMarca, chartMetricId],
  );

  if (!options.length) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>;
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
      <NutriMetricsChart
        series={series}
        width={chartLayout?.chartWidth}
        theme={theme}
        colorMarca={colorMarca}
        groupedNutriCharts={false}
        showLegend={false}
        showCaption={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  dropdownWrap: { marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 16, fontSize: 15, lineHeight: 22, paddingHorizontal: 8 },
});
