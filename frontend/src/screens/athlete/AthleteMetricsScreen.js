import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { formatJsDateToDisplay } from '../../utils/dateDisplay';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import NutriMetricsChart from '../../components/NutriMetricsChart';
import NutriBodyFatPanel from '../../components/NutriBodyFatPanel';
import NutriStructuredChartsPanel from '../../components/NutriStructuredChartsPanel';
import MetricSingleBarChartPanel from '../../components/MetricSingleBarChartPanel';
import DesignCard from '../../components/DesignCard';
import { defsWithChartData, pickDefaultMetricId } from '../../utils/metricChartSeries';
import { buildNutriChartSeries } from '../../utils/nutriMeasurementChart';
import { NUTRI_AREA_LABELS, sortDefsByNutritionProtocol } from '../../constants/nutritionMetrics';
import {
  ATHLETE_METRICS_STAFF_FILTERS,
  filterMedicionesByStaff,
  staffFiltersWithData,
} from '../../constants/athleteMetricsStaff';
import { chartContentWrapStyle, useChartLayout } from '../../utils/chartLayout';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { clubHeaders } from './athleteApi';

const TABS = [
  { key: 'grafico', label: 'Gráfico', icon: 'analytics-outline' },
  { key: 'historial', label: 'Historial', icon: 'list-outline' },
];

const AREA_LABELS = {
  ...NUTRI_AREA_LABELS,
  fisico: 'Físico',
};

function defsFromMediciones(mediciones, sortNutri = true) {
  const map = new Map();
  for (const m of mediciones) {
    if (!m.metrica?._id) continue;
    map.set(String(m.metrica._id), m.metrica);
  }
  const list = [...map.values()];
  return sortNutri ? sortDefsByNutritionProtocol(list) : list.sort((a, b) => String(a.nombre).localeCompare(b.nombre));
}

export default function AthleteMetricsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor, memberId, loading: memberLoading } = useMember();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const canGoBack = navigation.canGoBack();
  const chartLayout = useChartLayout({ grouped: true });
  const contentWrap = chartContentWrapStyle(chartLayout);
  const metricsCacheKey =
    clubData?.urlIdentifier && (!isTutor || memberId)
      ? `athlete-metrics:${clubData.urlIdentifier}:${isTutor ? memberId : 'self'}`
      : '';

  const [activeTab, setActiveTab] = useState('grafico');
  const [mediciones, setMediciones] = useState(() => readScreenCache(metricsCacheKey)?.mediciones ?? []);
  const [informesPsicologia, setInformesPsicologia] = useState(
    () => readScreenCache(metricsCacheKey)?.informesPsicologia ?? [],
  );
  const [notasPsicologia, setNotasPsicologia] = useState(
    () => readScreenCache(metricsCacheKey)?.notasPsicologia ?? [],
  );
  const [searchHistorial, setSearchHistorial] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [chartMetricId, setChartMetricId] = useState('');
  const [atletaMeta, setAtletaMeta] = useState(() => readScreenCache(metricsCacheKey)?.atletaMeta ?? null);
  const [nutricionSettings, setNutricionSettings] = useState(
    () => readScreenCache(metricsCacheKey)?.nutricionSettings ?? { metodoGrasaCorporal: 'durnin_siri' },
  );

  const isPrepFisico = selectedStaffId === 'preparador_fisico';
  const isNutriStaff = selectedStaffId === 'nutricionista';
  const isPsiStaff = selectedStaffId === 'psicologo';

  const staffOptions = useMemo(() => {
    const fromMeds = staffFiltersWithData(mediciones);
    const hasPsi =
      (informesPsicologia || []).length > 0 || (notasPsicologia || []).length > 0;
    if (hasPsi) {
      const psi = ATHLETE_METRICS_STAFF_FILTERS.find((f) => f.id === 'psicologo');
      if (psi && !fromMeds.some((f) => f.id === 'psicologo')) return [...fromMeds, psi];
    }
    return fromMeds;
  }, [mediciones, informesPsicologia, notasPsicologia]);

  const staffMediciones = useMemo(
    () => filterMedicionesByStaff(mediciones, selectedStaffId),
    [mediciones, selectedStaffId],
  );

  const defs = useMemo(
    () => defsFromMediciones(staffMediciones, isNutriStaff),
    [staffMediciones, isNutriStaff],
  );

  const fisicoDefs = useMemo(
    () => (isPrepFisico ? defsFromMediciones(staffMediciones, false) : []),
    [staffMediciones, isPrepFisico],
  );

  const chartDefs = useMemo(() => {
    if (!isPrepFisico) return [];
    return defsWithChartData(staffMediciones, fisicoDefs);
  }, [isPrepFisico, fisicoDefs, staffMediciones]);

  const otherStaffChartSeries = useMemo(
    () =>
      !isPrepFisico && !isNutriStaff
        ? buildNutriChartSeries(staffMediciones, defs, { avgColor: colorMarca })
        : [],
    [staffMediciones, defs, colorMarca, isPrepFisico, isNutriStaff],
  );

  const selectedStaff = useMemo(
    () => ATHLETE_METRICS_STAFF_FILTERS.find((f) => f.id === selectedStaffId) || null,
    [selectedStaffId],
  );

  useEffect(() => {
    if (!staffOptions.length) {
      setSelectedStaffId('');
      return;
    }
    setSelectedStaffId((prev) =>
      prev && staffOptions.some((o) => o.id === prev) ? prev : staffOptions[0].id,
    );
  }, [staffOptions]);

  useEffect(() => {
    if (!isPrepFisico) {
      setChartMetricId('');
      return;
    }
    setChartMetricId((prev) => pickDefaultMetricId(chartDefs, prev));
  }, [isPrepFisico, chartDefs]);

  const psychTimelineRows = useMemo(() => {
    const sessionRows = (informesPsicologia || []).map((n) => ({
      kind: 'session',
      id: `s-${n._id}`,
      date: n.fecha ? new Date(n.fecha).getTime() : 0,
      data: n,
    }));
    const noteRows = (notasPsicologia || []).map((n) => ({
      kind: 'note',
      id: `n-${n._id}`,
      date: n.fecha ? new Date(n.fecha).getTime() : 0,
      data: n,
    }));
    return [...sessionRows, ...noteRows].sort((a, b) => b.date - a.date);
  }, [informesPsicologia, notasPsicologia]);

  const historialFiltered = useMemo(() => {
    if (isPsiStaff) {
      const q = searchHistorial.trim().toLowerCase();
      if (!q) return psychTimelineRows;
      return psychTimelineRows.filter((row) => {
        if (row.kind === 'session') {
          return String(row.data.informeSesion || '').toLowerCase().includes(q);
        }
        const hay = `${row.data.titulo || ''} ${row.data.contenidoRichText || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const q = searchHistorial.trim().toLowerCase();
    let rows = staffMediciones;
    if (!q) return rows;
    return rows.filter((m) => {
      const areaLbl = AREA_LABELS[m.metrica?.area] || '';
      const label = `${m.metrica?.nombre || ''} ${m.metrica?.unidad || ''} ${areaLbl}`.toLowerCase();
      return label.includes(q);
    });
  }, [staffMediciones, searchHistorial, isPsiStaff, psychTimelineRows]);

  const applyMetrics = useCallback((data) => {
    setMediciones(data.mediciones);
    setInformesPsicologia(data.informesPsicologia || []);
    setNotasPsicologia(data.notasPsicologia || []);
    setAtletaMeta(data.atletaMeta);
    setNutricionSettings(data.nutricionSettings);
  }, []);

  const fetchMetrics = useCallback(async () => {
    if (!clubData?.urlIdentifier) {
      return {
        mediciones: [],
        informesPsicologia: [],
        notasPsicologia: [],
        atletaMeta: null,
        nutricionSettings: { metodoGrasaCorporal: 'durnin_siri' },
      };
    }
    const atletaId = isTutor ? memberId : await getToken('userId');
    if (!atletaId) {
      return {
        mediciones: [],
        informesPsicologia: [],
        notasPsicologia: [],
        atletaMeta: null,
        nutricionSettings: { metodoGrasaCorporal: 'durnin_siri' },
      };
    }
    const h = await clubHeaders(clubData);
    const res = await clubApi.get(`/performance/atleta/${atletaId}`, { headers: h });
    const meds = res.data?.mediciones;
    const informes = res.data?.informesPsicologia;
    const notasPsi = res.data?.notasPsicologia;
    return {
      mediciones: Array.isArray(meds) ? meds : [],
      informesPsicologia: Array.isArray(informes) ? informes : [],
      notasPsicologia: Array.isArray(notasPsi) ? notasPsi : [],
      atletaMeta: res.data?.atleta || null,
      nutricionSettings: res.data?.nutricion || { metodoGrasaCorporal: 'durnin_siri' },
    };
  }, [clubData, isTutor, memberId]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: metricsCacheKey,
    enabled: !!metricsCacheKey && (!isTutor || !!memberId),
    fetchData: fetchMetrics,
    onFetched: applyMetrics,
    onFetchError: () => {
      applyMetrics({
        mediciones: [],
        informesPsicologia: [],
        notasPsicologia: [],
        atletaMeta: null,
        nutricionSettings: { metodoGrasaCorporal: 'durnin_siri' },
      });
    },
  });

  const showInitialLoader =
    (memberLoading || loading) &&
    mediciones.length === 0 &&
    informesPsicologia.length === 0 &&
    notasPsicologia.length === 0;
  const hasAnyMetrics =
    mediciones.length > 0 || informesPsicologia.length > 0 || notasPsicologia.length > 0;

  const metricsTitle = isTutor ? 'Métricas' : 'Mis métricas';
  const metricsKicker = isTutor ? 'Seguimiento' : 'Tu evolución';
  const metricsSubtitle = isTutor
    ? 'Mediciones que el club compartió con vos como tutor'
    : 'Mediciones compartidas por el club';
  const emptyMetricsMsg = isTutor
    ? 'Todavía no hay mediciones ni notas visibles para este atleta.'
    : 'Todavía no hay mediciones ni notas visibles. Cuando nutrición, preparador, entrenador o psicología compartan datos, los vas a ver acá.';

  const renderPsychNotes = (rows) => {
    if (!rows.length) {
      return (
        <Text style={[styles.empty, { color: theme.textMuted }]}>
          No hay notas de psicología visibles por ahora.
        </Text>
      );
    }
    return rows.map((row) => {
      const n = row.data || row;
      const isSession = (row.kind || 'session') === 'session';
      const body = isSession
        ? n.informeSesion
        : String(n.contenidoRichText || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
      const title = isSession ? 'Nota de sesión' : n.titulo || 'Nota clínica';
      const subtitle = isSession
        ? `${n.categoria?.nombre || 'Psicología'}${
            n.horaInicio ? ` · ${n.horaInicio}${n.horaFin ? `–${n.horaFin}` : ''}` : ''
          }`
        : 'Nota libre';
      const dateVal = n.fecha ? formatJsDateToDisplay(new Date(n.fecha)) : '—';
      return (
        <DesignCard
          key={row.id || n._id}
          theme={theme}
          isDarkMode={isDarkMode}
          accent="#8b5cf6"
          contentStyle={styles.cardInner}
        >
          <View style={styles.cardTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.metricName, { color: theme.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{dateVal}</Text>
          </View>
          {body ? (
            <Text style={[styles.notas, { color: theme.text, marginTop: 4 }]}>{body}</Text>
          ) : null}
        </DesignCard>
      );
    });
  };

  const renderSearchBox = (value, onChangeText, placeholder) => (
    <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="search" size={20} color={theme.icon} />
      <TextInput
        style={[styles.searchInput, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={22} color={theme.icon} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderStaffChips = () => (
    <>
      <Text style={[styles.filterLbl, { color: theme.textMuted }]}>Profesional</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
      >
        {staffOptions.map((opt) => {
          const on = selectedStaffId === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.chip,
                {
                  borderColor: on ? colorMarca : theme.border,
                  backgroundColor: on ? colorMarca + '22' : theme.surface,
                },
              ]}
              onPress={() => setSelectedStaffId(opt.id)}
            >
              {opt.iconSet === 'MaterialCommunityIcons' ? (
                <MaterialCommunityIcons name={opt.icon} size={16} color={on ? colorMarca : theme.icon} />
              ) : (
                <Ionicons name={opt.icon} size={16} color={on ? colorMarca : theme.icon} />
              )}
              <Text style={[styles.chipTitle, { color: on ? colorMarca : theme.text }]} numberOfLines={1}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker={metricsKicker}
        title={metricsTitle}
        subtitle={metricsSubtitle}
        onBack={canGoBack ? () => navigation.goBack() : undefined}
      />

      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} /> : null}

      {isTutor && !memberLoading && !memberId ? (
        <Text style={[styles.empty, { color: theme.textMuted, marginTop: 24, paddingHorizontal: 16 }]}>
          No hay atletas vinculados a tu cuenta.
        </Text>
      ) : (
        <>
      <View style={[styles.tabRow, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        {TABS.map((t) => {
          const on = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, on && { borderBottomColor: colorMarca, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Ionicons name={t.icon} size={18} color={on ? colorMarca : theme.icon} />
              <Text style={[styles.tabLbl, { color: on ? colorMarca : theme.textMuted }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === 'grafico' && (
            <ScrollView
              contentContainerStyle={[styles.scroll, contentWrap]}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
              }
            >

              {!hasAnyMetrics ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMetricsMsg}</Text>
              ) : staffOptions.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>
                  Hay registros pero no se pudo agrupar por profesional. Contactá al club.
                </Text>
              ) : (
                <>
                  {renderStaffChips()}

                  {selectedStaff ? (
                    <Text style={[styles.staffHead, { color: theme.text }]}>{selectedStaff.label}</Text>
                  ) : null}

                  {isPsiStaff ? (
                    renderPsychNotes(psychTimelineRows)
                  ) : isNutriStaff ? (
                    <NutriBodyFatPanel
                      mediciones={staffMediciones}
                      defs={defs}
                      atleta={atletaMeta}
                      theme={theme}
                      isDarkMode={isDarkMode}
                      colorMarca={colorMarca}
                      metodoGrasaCorporal={nutricionSettings.metodoGrasaCorporal}
                    />
                  ) : null}

                  {isPsiStaff ? null : isNutriStaff ? (
                    <NutriStructuredChartsPanel
                      mediciones={staffMediciones}
                      defs={defs}
                      chartLayout={chartLayout}
                      theme={theme}
                      isDarkMode={isDarkMode}
                      colorMarca={colorMarca}
                      emptyMessage="La nutricionista todavía no tiene mediciones visibles para vos."
                    />
                  ) : isPrepFisico ? (
                    <MetricSingleBarChartPanel
                      defs={chartDefs}
                      mediciones={staffMediciones}
                      chartMetricId={chartMetricId}
                      onChangeChartMetricId={setChartMetricId}
                      chartLayout={chartLayout}
                      theme={theme}
                      isDarkMode={isDarkMode}
                      colorMarca={colorMarca}
                      emptyDefsMessage="El preparador físico todavía no tiene mediciones visibles para vos."
                    />
                  ) : otherStaffChartSeries.length === 0 ? (
                    <Text style={[styles.empty, { color: theme.textMuted }]}>
                      Este profesional todavía no tiene mediciones visibles para vos.
                    </Text>
                  ) : (
                    <NutriMetricsChart
                      series={otherStaffChartSeries}
                      theme={theme}
                      isDarkMode={isDarkMode}
                      colorMarca={colorMarca}
                      groupedNutriCharts
                      showLegend={false}
                      showCaption={false}
                    />
                  )}
                </>
              )}
            </ScrollView>
          )}

          {activeTab === 'historial' && (
            <ScrollView
              contentContainerStyle={[styles.scroll, contentWrap]}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
              }
            >
              {hasAnyMetrics && staffOptions.length > 0 ? renderStaffChips() : null}
              {renderSearchBox(
                searchHistorial,
                setSearchHistorial,
                isPsiStaff ? 'Buscar en notas…' : 'Buscar en el historial…',
              )}
              <Text style={[styles.countHint, { color: theme.textMuted }]}>
                {historialFiltered.length} registro{historialFiltered.length === 1 ? '' : 's'}
                {selectedStaff ? ` · ${selectedStaff.label}` : ''}
              </Text>
              {historialFiltered.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>
                  {!hasAnyMetrics
                    ? 'Sin registros visibles por ahora.'
                    : isPsiStaff
                      ? 'Ninguna nota coincide con ese filtro.'
                      : 'Ningún registro para este profesional con ese filtro.'}
                </Text>
              ) : isPsiStaff ? (
                renderPsychNotes(historialFiltered)
              ) : (
                historialFiltered.map((m) => (
                  <DesignCard
                    key={m._id}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    accent={colorMarca}
                    contentStyle={styles.cardInner}
                  >
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.metricName, { color: theme.text }]} numberOfLines={1}>
                          {m.metrica?.nombre || 'Métrica'} ({m.metrica?.unidad || '—'})
                        </Text>
                        {m.metrica?.area && AREA_LABELS[m.metrica.area] ? (
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {AREA_LABELS[m.metrica.area]}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                        {m.fechaMedicion ? formatJsDateToDisplay(new Date(m.fechaMedicion)) : '—'}
                      </Text>
                    </View>
                    <Text style={[styles.valor, { color: colorMarca }]}>{m.valor}</Text>
                    {m.notasExtra ? (
                      <Text style={[styles.notas, { color: theme.textMuted }]} numberOfLines={3}>
                        {m.notasExtra}
                      </Text>
                    ) : null}
                    {m.evaluador?.nombre ? (
                      <Text style={[styles.staff, { color: theme.textMuted }]}>
                        {m.evaluador.nombre} {m.evaluador.apellido || ''}
                      </Text>
                    ) : null}
                  </DesignCard>
                ))
              )}
            </ScrollView>
          )}
        </View>
      )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  tabLbl: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  filterLbl: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  chipsScroll: { marginBottom: 12 },
  chipsRow: { gap: 10, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipTitle: { fontSize: 13, fontWeight: '700' },
  staffHead: { fontSize: 16, fontWeight: '800', marginBottom: 8, lineHeight: 22 },
  chartTitle: { fontSize: 16, fontWeight: '800', marginTop: 4, marginBottom: 4 },
  dropdownWrap: { marginBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  avgBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
  },
  avgBannerLbl: { fontSize: 12, fontWeight: '600', width: '100%' },
  avgBannerVal: { fontSize: 26, fontWeight: '900' },
  avgBannerDate: { fontSize: 13, fontWeight: '600' },
  countHint: { fontSize: 12, marginBottom: 8 },
  cardInner: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  metricName: { fontSize: 16, fontWeight: '800' },
  valor: { fontSize: 28, fontWeight: '900' },
  notas: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  staff: { fontSize: 11, marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 15, lineHeight: 22, paddingHorizontal: 8 },
});
