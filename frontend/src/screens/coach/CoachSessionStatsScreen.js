import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { sortByNombre } from '../../utils/listSort';
import CoachCategoryFilter from '../../components/CoachCategoryFilter';
import CoachStatsBarChart from '../../components/CoachStatsBarChart';
import EnfoqueBarChart from '../../components/EnfoqueBarChart';
import {
  formatSessionCalendarWhen,
  isoCalendarDateToDisplay,
} from '../../utils/dateDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const PERIOD_KEYS = ['semana', 'mes', 'historico'];
const PERIOD_SHORT = { semana: '7 días', mes: 'Mes', historico: 'Hist.' };

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value}%`;
}

export default function CoachSessionStatsScreen({ navigation, route }) {
  const sessionId = route.params?.sessionId;
  const isSingleSession = Boolean(sessionId);
  const initialCategoryId = route.params?.categoriaId ?? null;

  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const chartWidth = Math.min(Dimensions.get('window').width - 32, 400);

  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);

  const statsCacheKey = clubData?.urlIdentifier
    ? isSingleSession
      ? `coach-session-stats:${clubData.urlIdentifier}:session:${sessionId}`
      : `coach-session-stats:${clubData.urlIdentifier}:cat:${selectedCategoryId || 'all'}`
    : '';

  const cachedStats = readScreenCache(statsCacheKey);
  const [categories, setCategories] = useState(() => cachedStats?.categories ?? []);
  const [periodos, setPeriodos] = useState(() => cachedStats?.periodos ?? null);
  const [singleStats, setSingleStats] = useState(() => cachedStats?.singleStats ?? null);
  const [period, setPeriod] = useState('semana');

  const fetchStats = useCallback(async () => {
    const h = await clubHeaders(clubData);
    if (isSingleSession) {
      const res = await clubApi.get(`/sessions/${sessionId}/stats`, { headers: h });
      return { singleStats: res.data, periodos: null, categories: [] };
    }
    const qs = selectedCategoryId ? `?categoriaId=${selectedCategoryId}` : '';
    const res = await clubApi.get(`/sessions/profe/stats${qs}`, { headers: h });
    return {
      categories: sortByNombre(res.data.categorias || []),
      periodos: res.data.periodos || null,
      singleStats: null,
    };
  }, [clubData, isSingleSession, sessionId, selectedCategoryId]);

  const applyStats = useCallback((data) => {
    setCategories(data.categories ?? []);
    setPeriodos(data.periodos ?? null);
    setSingleStats(data.singleStats ?? null);
  }, []);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: statsCacheKey,
    enabled: !!statsCacheKey,
    fetchData: fetchStats,
    onFetched: applyStats,
  });

  const onCategoryChange = (id) => {
    setSelectedCategoryId(id);
  };

  const showInitialLoader = loading && !periodos && !singleStats;

  const current = isSingleSession ? singleStats : periodos?.[period];

  const sessionSubtitle = useMemo(() => {
    if (!isSingleSession || !singleStats?.sesion) return '';
    const s = singleStats.sesion;
    return formatSessionCalendarWhen(s.fecha, s.horaInicio, s.horaFin, { weekdayStyle: 'long' });
  }, [isSingleSession, singleStats]);

  const asistenciaItems = useMemo(() => {
    if (isSingleSession && singleStats?.asistenciaDetalle) {
      const d = singleStats.asistenciaDetalle;
      return [
        { label: 'Presente', value: d.presente, color: '#22c55e' },
        { label: 'Tarde', value: d.tarde, color: '#f59e0b' },
        { label: 'Ausente', value: d.ausente, color: '#ef4444' },
      ].filter((it) => it.value > 0);
    }
    const v = current?.promedioAsistenciaPct;
    if (v == null) return [];
    return [{ label: 'Promedio', value: v, color: colorMarca }];
  }, [isSingleSession, singleStats, current, colorMarca]);

  const maxAsistencia = isSingleSession
    ? Math.max(...asistenciaItems.map((i) => i.value), 1)
    : 100;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Sesiones"
        title={isSingleSession ? 'Estadísticas de la sesión' : 'Estadísticas generales'}
        subtitle={
          isSingleSession
            ? `${singleStats?.sesion?.categoria?.nombre || ''}${sessionSubtitle ? ` · ${sessionSubtitle}` : ''}`.trim() ||
              'Sesión'
            : selectedCategoryId
              ? categories.find((c) => String(c._id) === String(selectedCategoryId))?.nombre ||
                'Categoría seleccionada'
              : 'Todas las categorías · semana, mes e histórico'
        }
        onBack={() => navigation.goBack()}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
        >
          <Text style={[styles.intro, { color: theme.textMuted }]}>
            {isSingleSession
              ? 'Datos de esta sesión: asistencia registrada y minutos por enfoque táctico (bloques ejecutados o plan).'
              : 'Filtrá por categoría y período para ver asistencia y distribución por enfoque.'}
          </Text>

          {!isSingleSession && categories.length > 0 ? (
            <CoachCategoryFilter
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={onCategoryChange}
              colorMarca={colorMarca}
              theme={theme}
            />
          ) : null}

          {!isSingleSession ? (
            <View style={[styles.tabs, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {PERIOD_KEYS.map((key) => {
                const on = period === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tab, on && { backgroundColor: colorMarca }]}
                    onPress={() => setPeriod(key)}
                  >
                    <Text style={[styles.tabTxt, { color: on ? '#fff' : theme.text }]}>
                      {PERIOD_SHORT[key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {current ? (
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {isSingleSession
                ? `${isoCalendarDateToDisplay(singleStats?.sesion?.fecha)} · ${singleStats?.sesion?.estado || ''}`
                : `${current.totalSesiones} sesiones · ${current.completadas} completadas${
                    current.totalMinutosEnfoque > 0 ? ` · ${current.totalMinutosEnfoque} min por enfoque` : ''
                  }`}
            </Text>
          ) : null}

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardHead}>
              <Ionicons name="people-outline" size={20} color={colorMarca} />
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                {isSingleSession ? 'Asistencia' : `${current?.etiqueta || 'Período'} — Asistencia`}
              </Text>
            </View>
            <Text style={[styles.kpi, { color: colorMarca }]}>
              {formatPct(current?.promedioAsistenciaPct)}
            </Text>
            {!isSingleSession ? (
              <Text style={[styles.kpiHint, { color: theme.textMuted }]}>
                Tasa completadas: {formatPct(current?.tasaCompletadasPct)} · Prom. duración real:{' '}
                {current?.promedioMinutosReales != null ? `${current.promedioMinutosReales} min` : '—'}
              </Text>
            ) : (
              <Text style={[styles.kpiHint, { color: theme.textMuted }]}>
                Duración real total:{' '}
                {current?.promedioMinutosReales != null ? `${current.promedioMinutosReales} min` : '—'}
              </Text>
            )}
            <CoachStatsBarChart
              items={asistenciaItems}
              width={chartWidth}
              height={isSingleSession ? 180 : 140}
              theme={theme}
              valueSuffix={isSingleSession ? '' : '%'}
              maxValue={maxAsistencia}
            />
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardHead}>
              <Ionicons name="football-outline" size={20} color={colorMarca} />
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                {isSingleSession ? 'Enfoque (minutos)' : `${current?.etiqueta || 'Período'} — Enfoque`}
              </Text>
            </View>
            {current?.enfoqueDominante ? (
              <Text style={[styles.kpiHint, { color: theme.textMuted, marginBottom: 8 }]}>
                Predominante: {current.enfoqueDominante.label} ({current.enfoqueDominante.porcentaje}% ·{' '}
                {current.enfoqueDominante.minutos} min)
              </Text>
            ) : null}
            <EnfoqueBarChart
              items={current?.enfoqueChart || []}
              width={chartWidth}
              theme={theme}
              colorMarca={colorMarca}
            />
          </View>

          {!current && !showInitialLoader ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>No se pudieron cargar las estadísticas.</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 10,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabTxt: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  meta: { fontSize: 12, marginBottom: 14 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  kpi: { fontSize: 32, fontWeight: '800', marginBottom: 4 },
  kpiHint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 15 },
});
