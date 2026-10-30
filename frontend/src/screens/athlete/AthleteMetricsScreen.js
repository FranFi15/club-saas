import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  RefreshControl,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import ListTopFade from '../../components/ListTopFade';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { displayDateToIsoCalendar, formatJsDateToDisplay, isoCalendarYmd } from '../../utils/dateDisplay';
import CalendarDateField from '../../components/CalendarDateField';
import { averagePlayerMatchStats } from '../../utils/matchDerive';
import Foldable, { FoldableChevron } from '../../components/Foldable';
import FilterPillSheet from '../../components/FilterPillSheet';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import NutriBodyFatPanel from '../../components/NutriBodyFatPanel';
import NutriStructuredChartsPanel from '../../components/NutriStructuredChartsPanel';
import MetricSingleBarChartPanel from '../../components/MetricSingleBarChartPanel';
import DesignCard from '../../components/DesignCard';
import SearchableDropdown from '../../components/SearchableDropdown';
import { metricDropdownOptions, pickDefaultMetricId } from '../../utils/metricChartSeries';
import { NUTRI_AREA_LABELS, sortDefsByNutritionProtocol } from '../../constants/nutritionMetrics';
import {
  ATHLETE_METRICS_STAFF_FILTERS,
  filterMedicionesByStaff,
  staffFiltersWithData,
} from '../../constants/athleteMetricsStaff';
import { chartContentWrapStyle, useChartLayout } from '../../utils/chartLayout';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { clubHeaders } from './athleteApi';
import { tipoMedicionLabel } from '../../constants/courtMetrics';
import { formatUserName } from '../../utils/listSort';

const TABS = [
  { key: 'historial', label: 'Historial', icon: 'analytics-outline' },
  { key: 'cancha', label: 'Individual', icon: 'stats-chart-outline' },
  { key: 'partidos', label: 'Partidos', icon: 'trophy-outline' },
];

function formatPartidoAvg(value) {
  const n = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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

  const [activeTab, setActiveTab] = useState('historial');
  const [mediciones, setMediciones] = useState(() => readScreenCache(metricsCacheKey)?.mediciones ?? []);
  const [informesPsicologia, setInformesPsicologia] = useState(
    () => readScreenCache(metricsCacheKey)?.informesPsicologia ?? [],
  );
  const [notasPsicologia, setNotasPsicologia] = useState(
    () => readScreenCache(metricsCacheKey)?.notasPsicologia ?? [],
  );
  const [searchHistorial, setSearchHistorial] = useState('');
  const [metricFilterId, setMetricFilterId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [atletaMeta, setAtletaMeta] = useState(() => readScreenCache(metricsCacheKey)?.atletaMeta ?? null);
  const [nutricionSettings, setNutricionSettings] = useState(
    () => readScreenCache(metricsCacheKey)?.nutricionSettings ?? { metodoGrasaCorporal: 'durnin_siri' },
  );
  const [courtMetrics, setCourtMetrics] = useState(
    () => readScreenCache(metricsCacheKey)?.courtMetrics ?? [],
  );
  const [partidos, setPartidos] = useState([]);
  const [partidosLoading, setPartidosLoading] = useState(false);
  const [partidosAtletaId, setPartidosAtletaId] = useState('');
  const [partidoDesde, setPartidoDesde] = useState('');
  const [partidoHasta, setPartidoHasta] = useState('');
  const [partidoCategoriaId, setPartidoCategoriaId] = useState(null);
  const [partidoFilterOpen, setPartidoFilterOpen] = useState(null);
  const [promedio, setPromedio] = useState(null);
  const [promedioLoading, setPromedioLoading] = useState(false);
  const [promedioOpen, setPromedioOpen] = useState(false);

  const isNutriStaff = selectedStaffId === 'nutricionista';
  const isPsiStaff = selectedStaffId === 'psicologo';
  const singleMetricStaff = !isNutriStaff && !isPsiStaff;

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

  const metricOptions = useMemo(() => {
    const options = metricDropdownOptions(defs, { nutriLabels: isNutriStaff });
    if (isNutriStaff) return [{ value: '', label: 'Todas las métricas' }, ...options];
    return options;
  }, [defs, isNutriStaff]);

  const physicalMetricId = singleMetricStaff
    ? defs.some((d) => String(d._id) === String(metricFilterId))
      ? metricFilterId
      : defs[0]?._id || ''
    : '';
  const activeMetricId = singleMetricStaff ? physicalMetricId : metricFilterId;

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
    if (isNutriStaff || isPsiStaff) {
      setMetricFilterId('');
      return;
    }
    setMetricFilterId((prev) => pickDefaultMetricId(defs, prev));
  }, [selectedStaffId, isNutriStaff, isPsiStaff, defs]);

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

  const scopedMediciones = useMemo(() => {
    if (!activeMetricId) return staffMediciones;
    return staffMediciones.filter((m) => String(m.metrica?._id) === String(activeMetricId));
  }, [staffMediciones, activeMetricId]);

  const scopedDefs = useMemo(() => {
    if (!activeMetricId) return defs;
    return defs.filter((d) => String(d._id) === String(activeMetricId));
  }, [defs, activeMetricId]);

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
    let rows = scopedMediciones;
    if (!q) return rows;
    return rows.filter((m) => {
      const areaLbl = AREA_LABELS[m.metrica?.area] || '';
      const label = `${m.metrica?.nombre || ''} ${m.metrica?.unidad || ''} ${areaLbl}`.toLowerCase();
      return label.includes(q);
    });
  }, [scopedMediciones, searchHistorial, isPsiStaff, psychTimelineRows]);

  const loadPartidos = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    const id = isTutor ? memberId : await getToken('userId');
    if (!id) {
      setPartidos([]);
      setPartidosAtletaId('');
      return;
    }
    setPartidosAtletaId((prev) => {
      if (String(prev) !== String(id)) setPartidoCategoriaId(null);
      return String(id);
    });
    setPartidosLoading(true);
    try {
      const h = await clubHeaders(clubData);
      const { data } = await clubApi.get('/sessions/mis-partidos', {
        headers: h,
        params: isTutor ? { atletaId: id } : undefined,
      });
      setPartidos(data || []);
    } catch {
      setPartidos([]);
    } finally {
      setPartidosLoading(false);
    }
  }, [clubData, isTutor, memberId]);

  useEffect(() => {
    if (activeTab === 'partidos') loadPartidos();
  }, [activeTab, loadPartidos]);

  const partidoCategories = useMemo(() => {
    const byId = new Map();
    for (const item of partidos) {
      const id = item.categoria?._id ? String(item.categoria._id) : '';
      if (!id || byId.has(id)) continue;
      byId.set(id, item.categoria.nombre || 'Categoría');
    }
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [partidos]);

  useEffect(() => {
    if (partidoCategoriaId !== null || !partidoCategories.length) return;
    if (partidoCategories.length === 1) {
      setPartidoCategoriaId(partidoCategories[0].value);
      return;
    }
    const newest = partidos[0]?.categoria?._id ? String(partidos[0].categoria._id) : '';
    setPartidoCategoriaId(newest || partidoCategories[0].value);
  }, [partidoCategoriaId, partidoCategories, partidos]);

  const desdeYmd = displayDateToIsoCalendar(partidoDesde) || '';
  const hastaYmd = displayDateToIsoCalendar(partidoHasta) || '';
  const mixedSheets = !partidoCategoriaId && partidoCategories.length > 1;
  const visiblePartidos = useMemo(() => {
    return partidos.filter((item) => {
      const cat = item.categoria?._id ? String(item.categoria._id) : '';
      if (partidoCategoriaId && cat !== String(partidoCategoriaId)) return false;
      const ymd = isoCalendarYmd(item.fecha);
      if (!ymd) return !desdeYmd && !hastaYmd;
      if (desdeYmd && ymd < desdeYmd) return false;
      if (hastaYmd && ymd > hastaYmd) return false;
      return true;
    });
  }, [partidos, partidoCategoriaId, desdeYmd, hastaYmd]);

  const partidoFilterPills = useMemo(
    () => [
      {
        key: 'category',
        placeholder: 'Categoría',
        value: partidoCategoriaId === null ? '' : partidoCategoriaId || 'all',
        options: [{ value: 'all', label: 'Todas las categorías' }, ...partidoCategories],
        displayLabel: partidoCategoriaId
          ? partidoCategories.find((item) => item.value === partidoCategoriaId)?.label || null
          : partidoCategoriaId === ''
            ? 'Todas las categorías'
            : null,
        onChange: (value) => setPartidoCategoriaId(value === 'all' ? '' : value),
        searchable: partidoCategories.length > 6,
      },
    ],
    [partidoCategoriaId, partidoCategories],
  );

  const visiblePartidoIds = visiblePartidos.map((item) => item._id).join(',');

  useEffect(() => {
    if (activeTab !== 'partidos' || !partidosAtletaId || !visiblePartidoIds || mixedSheets) {
      setPromedio(null);
      setPromedioLoading(false);
      return undefined;
    }
    let cancelled = false;
    const ids = visiblePartidoIds.split(',');
    setPromedioLoading(true);
    (async () => {
      try {
        const h = await clubHeaders(clubData);
        const vistas = await Promise.all(
          ids.map((sessionId) =>
            clubApi
              .get(`/sessions/${sessionId}/partido-vista`, {
                headers: h,
                params: isTutor ? { atletaId: partidosAtletaId } : undefined,
              })
              .then((res) => res.data)
              .catch(() => null),
          ),
        );
        if (!cancelled) setPromedio(averagePlayerMatchStats(vistas, partidosAtletaId));
      } catch {
        if (!cancelled) setPromedio(null);
      } finally {
        if (!cancelled) setPromedioLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, clubData, isTutor, mixedSheets, partidosAtletaId, visiblePartidoIds]);

  const applyMetrics = useCallback((data) => {
    setMediciones(data.mediciones);
    setInformesPsicologia(data.informesPsicologia || []);
    setNotasPsicologia(data.notasPsicologia || []);
    setAtletaMeta(data.atletaMeta);
    setNutricionSettings(data.nutricionSettings);
    setCourtMetrics(data.courtMetrics || []);
  }, []);

  const fetchMetrics = useCallback(async () => {
    if (!clubData?.urlIdentifier) {
      return {
        mediciones: [],
        informesPsicologia: [],
        notasPsicologia: [],
        atletaMeta: null,
        nutricionSettings: { metodoGrasaCorporal: 'durnin_siri' },
        courtMetrics: [],
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
        courtMetrics: [],
      };
    }
    const h = await clubHeaders(clubData);
    const [res, courtRes] = await Promise.all([
      clubApi.get(`/performance/atleta/${atletaId}`, { headers: h }),
      clubApi
        .get('/court-metrics/me', {
          headers: h,
          params: isTutor ? { atletaId } : undefined,
        })
        .catch(() => ({ data: { metrics: [] } })),
    ]);
    const meds = res.data?.mediciones;
    const informes = res.data?.informesPsicologia;
    const notasPsi = res.data?.notasPsicologia;
    return {
      mediciones: Array.isArray(meds) ? meds : [],
      informesPsicologia: Array.isArray(informes) ? informes : [],
      notasPsicologia: Array.isArray(notasPsi) ? notasPsi : [],
      atletaMeta: res.data?.atleta || null,
      nutricionSettings: res.data?.nutricion || { metodoGrasaCorporal: 'durnin_siri' },
      courtMetrics: (() => {
        const rows = courtRes.data?.metrics || [];
        const seen = new Set();
        return rows.filter((m) => {
          const id = String(m?._id || '');
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      })(),
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
        courtMetrics: [],
      });
    },
  });

  const showInitialLoader =
    (memberLoading || loading) &&
    mediciones.length === 0 &&
    informesPsicologia.length === 0 &&
    notasPsicologia.length === 0 &&
    courtMetrics.length === 0;
  const hasAnyMetrics =
    mediciones.length > 0 ||
    informesPsicologia.length > 0 ||
    notasPsicologia.length > 0 ||
    courtMetrics.length > 0;

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

  const renderMetricFilter = () => {
    if (isPsiStaff || metricOptions.length < 2) return null;
    return (
      <View style={styles.metricFilter}>
        <Text style={[styles.filterLbl, { color: theme.textMuted }]}>Métrica</Text>
        <SearchableDropdown
          data={metricOptions}
          value={activeMetricId}
          onChange={setMetricFilterId}
          placeholder={singleMetricStaff ? 'Elegí una métrica' : 'Todas las métricas'}
          theme={theme}
          colorMarca={colorMarca}
        />
      </View>
    );
  };

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
              <Text style={[styles.tabLbl, { color: on ? colorMarca : theme.textMuted }]} numberOfLines={1}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showInitialLoader ? (
        <ClubSpinLoader size={56} style={{ marginTop: 32 }} />
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === 'historial' && (
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
                  {renderMetricFilter()}

                  {selectedStaff ? (
                    <Text style={[styles.staffHead, { color: theme.text }]}>{selectedStaff.label}</Text>
                  ) : null}

                  {isPsiStaff ? null : activeMetricId && (!isNutriStaff || metricFilterId) ? (
                    <MetricSingleBarChartPanel
                      defs={scopedDefs}
                      mediciones={scopedMediciones}
                      chartMetricId={activeMetricId}
                      onChangeChartMetricId={setMetricFilterId}
                      showPicker={false}
                      chartLayout={chartLayout}
                      theme={theme}
                      isDarkMode={isDarkMode}
                      colorMarca={colorMarca}
                      nutriLabels={isNutriStaff}
                      emptyDefsMessage="Esta métrica todavía no tiene mediciones visibles para vos."
                    />
                  ) : isNutriStaff ? (
                    <>
                      <NutriBodyFatPanel
                        mediciones={staffMediciones}
                        defs={defs}
                        atleta={atletaMeta}
                        theme={theme}
                        isDarkMode={isDarkMode}
                        colorMarca={colorMarca}
                        metodoGrasaCorporal={nutricionSettings.metodoGrasaCorporal}
                      />
                      <NutriStructuredChartsPanel
                        mediciones={staffMediciones}
                        defs={defs}
                        chartLayout={chartLayout}
                        theme={theme}
                        isDarkMode={isDarkMode}
                        colorMarca={colorMarca}
                        emptyMessage="La nutricionista todavía no tiene mediciones visibles para vos."
                      />
                    </>
                  ) : (
                    <Text style={[styles.empty, { color: theme.textMuted }]}>
                      Este profesional todavía no tiene mediciones visibles para vos.
                    </Text>
                  )}

                  {(isPsiStaff || metricFilterId || searchHistorial.trim() !== '' || historialFiltered.length !== 0) ? (
                  <View style={styles.historyBlock}>
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
                        {isPsiStaff && !searchHistorial.trim()
                          ? 'No hay notas de psicología visibles por ahora.'
                          : isPsiStaff
                            ? 'Ninguna nota coincide con ese filtro.'
                            : metricFilterId
                              ? 'Ningún registro para esta métrica.'
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
                              {formatUserName(m.evaluador)}
                            </Text>
                          ) : null}
                        </DesignCard>
                      ))
                    )}
                  </View>
                  ) : null}
                </>
              )}
            </ScrollView>
          )}

          {activeTab === 'cancha' && (
            <ScrollView
              contentContainerStyle={[styles.scroll, contentWrap]}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
              }
            >
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Shoot-arounds y métricas individuales que te asignó el cuerpo técnico. Podés registrarlas
                cuando quieras.
              </Text>
              {!courtMetrics.length ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>
                  Todavía no tenés métricas individuales asignadas.
                </Text>
              ) : (
                courtMetrics.map((m) => (
                  <DesignCard
                    key={String(m._id)}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    accent={colorMarca}
                    onPress={() =>
                      navigation.navigate('AthleteCourtMetricDetail', {
                        metricId: m._id,
                        tipoMedicion: m.tipoMedicion,
                      })
                    }
                    contentStyle={styles.cardInner}
                  >
                    <Text style={[styles.metricName, { color: theme.text }]}>{m.titulo}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>
                      {tipoMedicionLabel(m.tipoMedicion)} · {(m.pines || []).length} punto(s) · tocá
                      para registrar
                    </Text>
                  </DesignCard>
                ))
              )}
            </ScrollView>
          )}

          {activeTab === 'partidos' && (
            <ScrollView
              contentContainerStyle={[styles.scroll, contentWrap]}
              refreshControl={
                <RefreshControl refreshing={partidosLoading} onRefresh={loadPartidos} tintColor={colorMarca} />
              }
            >
              {partidoCategories.length > 1 ? (
                <FilterPillSheet
                  pills={partidoFilterPills}
                  openKey={partidoFilterOpen}
                  onOpen={setPartidoFilterOpen}
                  onClose={() => setPartidoFilterOpen(null)}
                  colorMarca={colorMarca}
                  theme={theme}
                />
              ) : null}
              <View style={styles.dates}>
                <View style={{ flex: 1 }}>
                  <CalendarDateField
                    theme={theme}
                    colorMarca={colorMarca}
                    value={partidoDesde}
                    onChange={setPartidoDesde}
                    placeholder="Desde"
                    allowClear
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CalendarDateField
                    theme={theme}
                    colorMarca={colorMarca}
                    value={partidoHasta}
                    onChange={setPartidoHasta}
                    placeholder="Hasta"
                    allowClear
                    minYmd={desdeYmd || undefined}
                  />
                </View>
              </View>

              {visiblePartidos.length ? (
                <View style={[styles.avgCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <TouchableOpacity
                    style={styles.avgHead}
                    onPress={() => setPromedioOpen((open) => !open)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: promedioOpen }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.avgTitle, { color: theme.text }]}>Tu promedio</Text>
                      <Text style={[styles.avgHint, { color: theme.textMuted }]}>
                        {promedio?.partidos || visiblePartidos.length} partido{(promedio?.partidos || visiblePartidos.length) === 1 ? '' : 's'}
                        {desdeYmd || hastaYmd ? ' en estas fechas' : ''}
                      </Text>
                    </View>
                    <FoldableChevron open={promedioOpen} color={theme.textMuted} size={20} />
                  </TouchableOpacity>
                  <Foldable open={promedioOpen}>
                    {mixedSheets ? (
                      <Text style={[styles.avgHint, { color: theme.textMuted }]}>
                        Elegí una categoría. Cada cuerpo técnico usa su propia planilla, así que el promedio es de una sola.
                      </Text>
                    ) : promedioLoading && !promedio ? (
                      <ClubSpinLoader size={32} style={{ marginTop: 8 }} />
                    ) : (
                      <>
                        <View style={styles.avgRow}>
                          <Text style={[styles.avgLbl, { color: theme.text }]}>Puntos</Text>
                          <Text style={[styles.avgVal, { color: colorMarca }]}>
                            {formatPartidoAvg(promedio?.puntosPorPartido)} por partido
                          </Text>
                        </View>
                        {(promedio?.rows || []).map((row) => (
                          <View key={`${row.tipo}-${row.etiqueta}`} style={styles.avgRow}>
                            <Text style={[styles.avgLbl, { color: theme.text }]}>{row.etiqueta}</Text>
                            <Text style={[styles.avgVal, { color: colorMarca }]}>
                              {row.tipo === 'porcentaje' || row.erro > 0
                                ? `${formatPartidoAvg(row.porPartido)}/${formatPartidoAvg(row.intentosPorPartido)}${row.porcentaje == null ? '' : ` · ${row.porcentaje}%`}`
                                : `${formatPartidoAvg(row.porPartido)} por partido`}
                            </Text>
                          </View>
                        ))}
                        {!promedioLoading && promedio && !promedio.rows.length && !promedio.puntosPorPartido ? (
                          <Text style={[styles.avgHint, { color: theme.textMuted }]}>
                            En estos partidos no hay estadísticas tuyas.
                          </Text>
                        ) : null}
                      </>
                    )}
                  </Foldable>
                </View>
              ) : null}

              {partidosLoading && !partidos.length ? <ClubSpinLoader size={40} style={{ marginTop: 24 }} /> : null}
              {!partidosLoading && !partidos.length ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>Todavía no te enviaron partidos.</Text>
              ) : null}
              {!partidosLoading && partidos.length > 0 && !visiblePartidos.length ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>
                  No hay partidos para esa categoría en esas fechas.
                </Text>
              ) : null}
              {visiblePartidos.map((item) => (
                <TouchableOpacity
                  key={item._id}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('PartidoStats', {
                    sessionId: item._id,
                    vistaJugador: true,
                    ...(isTutor ? { atletaId: memberId } : {}),
                  })}
                  style={[styles.partidoRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{item.nombreSesion || 'Partido'}</Text>
                    <Text style={{ color: theme.textMuted, marginTop: 4 }}>
                      {item.categoria?.nombre ? `${item.categoria.nombre} · ` : ''}
                      {item.fecha ? formatJsDateToDisplay(new Date(item.fecha)) : ''}{item.horaInicio ? ` · ${item.horaInicio}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <ListTopFade color={theme.background} />
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
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  tabLbl: { fontSize: 12, fontWeight: '700' },
  dates: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  avgCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  avgHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avgTitle: { fontSize: 16, fontWeight: '800' },
  avgHint: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  avgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  avgLbl: { flex: 1, fontSize: 14, fontWeight: '700' },
  avgVal: { fontSize: 14, fontWeight: '800' },
  partidoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  filterLbl: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  metricFilter: { marginBottom: 12 },
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
  historyBlock: { marginTop: 16 },
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
