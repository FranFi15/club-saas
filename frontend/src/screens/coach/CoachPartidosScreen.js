import React, { useCallback, useContext, useMemo, useState } from 'react';
import { FlatList, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import ListTopFade from '../../components/ListTopFade';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import DesignCard from '../../components/DesignCard';
import FilterPillSheet from '../../components/FilterPillSheet';
import CalendarDateField from '../../components/CalendarDateField';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { displayDateToIsoCalendar, isoCalendarDateToDisplay, isoCalendarWeekday, isoCalendarYmd } from '../../utils/dateDisplay';
import { sessionDisplayName, sessionSinEstadisticas } from '../../utils/sessionDisplay';
import { categoriesGroupedByDisciplina, categoryPillLabel } from '../../utils/categoryFilterOptions';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function whenLabel(session) {
  const weekday = isoCalendarWeekday(session.fecha, { style: 'short' });
  const cal = isoCalendarDateToDisplay(session.fecha);
  return [weekday, cal].filter(Boolean).join(' ');
}

function estadoLabel(item) {
  if (item.estado === 'completada') return 'Completada';
  if (item.estado === 'cancelada') return 'Cancelada';
  return 'Programada';
}

export default function CoachPartidosScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [openFilter, setOpenFilter] = useState(null);
  const [error, setError] = useState('');

  const fetchPartidos = useCallback(async () => {
    const token = await getToken('userToken');
    const { data } = await clubApi.get('/sessions/profe/agenda?tipo=partido&todos=1', {
      headers: {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      },
    });
    return { list: data.sesiones || [], categories: data.categorias || [] };
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: clubData?.urlIdentifier ? `coach-partidos:${clubData.urlIdentifier}` : '',
    enabled: !!clubData?.urlIdentifier,
    fetchData: fetchPartidos,
    onFetched: (data) => {
      setError('');
      setList(data.list || []);
      setCategories(data.categories || []);
    },
    onFetchError: (e) => setError(e.response?.data?.message || 'No se pudieron cargar los partidos.'),
  });

  const visible = useMemo(() => {
    const from = displayDateToIsoCalendar(desde);
    const to = displayDateToIsoCalendar(hasta);
    return list.filter((item) => {
      const cat = String(item.categoria?._id || item.categoria || '');
      if (categoryId && cat !== String(categoryId)) return false;
      const ymd = isoCalendarYmd(item.fecha);
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
      return true;
    });
  }, [list, categoryId, desde, hasta]);

  const filterPills = useMemo(
    () => [
      {
        key: 'category',
        placeholder: 'Categoría',
        value: categoryId,
        sections: categoriesGroupedByDisciplina(categories, {
          includeAll: true,
          allLabel: 'Todas las categorías',
        }),
        displayLabel: categoryId ? categoryPillLabel(categories, categoryId) : null,
        onChange: setCategoryId,
        searchable: true,
      },
    ],
    [categories, categoryId],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Sesiones"
        title="Partidos"
        subtitle="Todos los partidos de tus categorías"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.filters}>
        <FilterPillSheet
          pills={filterPills}
          openKey={openFilter}
          onOpen={setOpenFilter}
          onClose={() => setOpenFilter(null)}
          colorMarca={colorMarca}
          theme={theme}
        />
        <View style={styles.dates}>
          <View style={{ flex: 1 }}>
            <CalendarDateField
              theme={theme}
              colorMarca={colorMarca}
              value={desde}
              onChange={setDesde}
              placeholder="Desde"
              allowClear
            />
          </View>
          <View style={{ flex: 1 }}>
            <CalendarDateField
              theme={theme}
              colorMarca={colorMarca}
              value={hasta}
              onChange={setHasta}
              placeholder="Hasta"
              allowClear
              minYmd={displayDateToIsoCalendar(desde) || undefined}
            />
          </View>
        </View>
      </View>
      {loading && !list.length ? <ClubSpinLoader size={56} style={{ marginTop: 32 }} /> : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={visible}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.list}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                {error || (list.length ? 'No hay partidos con ese filtro.' : 'Todavía no hay partidos.')}
              </Text>
            }
            renderItem={({ item }) => {
              const sinEstadisticas = sessionSinEstadisticas(item);
              const muted = item.estado === 'cancelada' || sinEstadisticas;
              return (
                <DesignCard
                  theme={theme}
                  isDarkMode={isDarkMode}
                  accent={muted ? '#9ca3af' : '#f59e0b'}
                  muted={muted}
                  onPress={
                    sinEstadisticas
                      ? undefined
                      : () =>
                          navigation.navigate(
                            item.estado === 'completada' ? 'CoachSessionStats' : 'CoachSessionDetail',
                            { sessionId: item._id },
                          )
                  }
                  contentStyle={styles.card}
                >
                  <Text style={{ color: muted ? theme.textMuted : theme.text, fontWeight: '800', fontSize: 16 }}>
                    {sessionDisplayName(item)}
                  </Text>
                  <Text style={{ color: theme.textMuted, marginTop: 4 }}>
                    {whenLabel(item)} · {item.horaInicio}–{item.horaFin}
                  </Text>
                  <Text style={{ color: theme.textMuted, marginTop: 2 }}>
                    {item.categoria?.nombre || 'Sin categoría'} · {(item.lugarExterno || '').trim() || item.espacio?.nombre || 'Sin lugar'} · {sinEstadisticas ? 'Sin estadísticas' : estadoLabel(item)}
                  </Text>
                </DesignCard>
              );
            }}
          />
          <ListTopFade color={theme.background} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  dates: { flexDirection: 'row', gap: 10 },
  list: { padding: 16, paddingBottom: 40 },
  card: { paddingHorizontal: 14, paddingVertical: 14 },
  empty: { textAlign: 'center', marginTop: 28, fontSize: 15, lineHeight: 22 },
});
