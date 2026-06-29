import React, { useContext, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachCategoryFilter from '../../components/CoachCategoryFilter';
import CoachScreenHeader, {
  CoachHeaderOverlayFab,
  CoachScreenHeaderWithFabs,
} from '../../components/CoachScreenHeader';
import { compareIsoCalendarDates, isoCalendarDateToDisplay, isoCalendarWeekday } from '../../utils/dateDisplay';
import { sessionDisplayName, sessionEsOpcional } from '../../utils/sessionDisplay';
import { sortByNombre } from '../../utils/listSort';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function sessionLabel(s) {
  const weekday = isoCalendarWeekday(s.fecha, { style: 'long' });
  const cal = isoCalendarDateToDisplay(s.fecha);
  if (!cal) return '';
  return `${weekday} ${cal}`.trim();
}

function sessionAttendancePct(s) {
  const rows = s.asistencia || [];
  if (!rows.length) return null;
  const ok = rows.filter((a) => a.estado === 'presente' || a.estado === 'tarde').length;
  return Math.round((ok / rows.length) * 100);
}

export default function CoachAgendaScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const agendaCacheKey = clubData?.urlIdentifier
    ? `coach-agenda:${clubData.urlIdentifier}:${selectedCategoryId || 'all'}`
    : '';

  const [categories, setCategories] = useState(() => readScreenCache(agendaCacheKey)?.categories ?? []);
  const [list, setList] = useState(() => readScreenCache(agendaCacheKey)?.list ?? []);
  const [pendingRelocations, setPendingRelocations] = useState(0);
  const [restorableCount, setRestorableCount] = useState(0);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: false,
      isDanger: false,
      confirmText: 'Aceptar',
      cancelText: 'Cancelar',
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const applyAgenda = useCallback((data) => {
    setCategories(data.categories);
    setList(data.list);
    setPendingRelocations(data.pendingRelocations ?? 0);
    setRestorableCount(data.restorableCount ?? 0);
  }, []);

  const fetchAgenda = useCallback(async () => {
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const qs = selectedCategoryId ? `?categoriaId=${selectedCategoryId}` : '';
    const [res, pendingRes, restoreRes] = await Promise.all([
      clubApi.get(`/sessions/profe/agenda${qs}`, { headers: h }),
      clubApi.get('/sessions/reubicacion-pendiente', { headers: h }).catch(() => ({ data: { sesiones: [] } })),
      clubApi.get('/sessions/restauracion-disponible', { headers: h }).catch(() => ({ data: { sesiones: [] } })),
    ]);
    const sesiones = (res.data.sesiones || []).filter((x) => x.estado !== 'cancelada');
    sesiones.sort(
      (a, b) =>
        compareIsoCalendarDates(a.fecha, b.fecha) ||
        String(a.horaInicio).localeCompare(String(b.horaInicio)),
    );
    return {
      categories: sortByNombre(res.data.categorias || []),
      list: sesiones,
      pendingRelocations: (pendingRes.data?.sesiones || []).length,
      restorableCount: (restoreRes.data?.sesiones || []).length,
    };
  }, [clubData?.urlIdentifier, selectedCategoryId]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: agendaCacheKey,
    enabled: !!agendaCacheKey,
    fetchData: fetchAgenda,
    onFetched: applyAgenda,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la agenda.');
    },
  });

  const showInitialLoader = loading && list.length === 0;

  const onCategoryChange = (id) => {
    setSelectedCategoryId(id);
  };

  const renderItem = ({ item }) => {
    const isProgramada = item.estado !== 'completada';
    const asistPct = item.estado === 'completada' ? sessionAttendancePct(item) : null;

    return (
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => navigation.navigate('CoachSessionDetail', { sessionId: item._id })}
        >
          <View style={[styles.dot, { backgroundColor: item.estado === 'completada' ? '#22c55e' : colorMarca }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{sessionLabel(item)}</Text>
            <Text style={[styles.rowSub, { color: theme.textMuted }]}>
              {item.horaInicio}–{item.horaFin} · {item.categoria?.nombre}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
              {(item.lugarExterno || '').trim() || item.espacio?.nombre || 'Sin lugar'} ·{' '}
              {sessionDisplayName(item)}
              {sessionEsOpcional(item) ? ' · Opcional' : ''} ·{' '}
              {item.reubicacionPendiente ? 'Lugar pendiente' : item.estado === 'completada' ? 'Completada' : 'Programada'}
              {asistPct != null ? ` · Asist. ${asistPct}%` : ''}
            </Text>
            {item.reubicacionPendiente ? (
              <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                Definí el nuevo lugar de entrenamiento
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        {item.estado === 'completada' ? (
          <TouchableOpacity
            style={styles.statsBtn}
            onPress={() => navigation.navigate('CoachSessionStats', { sessionId: item._id })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="stats-chart-outline" size={22} color={colorMarca} />
          </TouchableOpacity>
        ) : null}
        {isProgramada ? (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() =>
              navigation.navigate('CoachCancelSession', { sessionId: item._id, session: item })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle-outline" size={26} color="#ef4444" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const listHeader = (
    <>
      {pendingRelocations > 0 ? (
        <TouchableOpacity
          style={[styles.relocBanner, { backgroundColor: '#f59e0b22', borderColor: '#f59e0b' }]}
          onPress={() => navigation.navigate('CoachRelocateSessions')}
          activeOpacity={0.85}
        >
          <Ionicons name="swap-horizontal" size={22} color="#f59e0b" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>
              {pendingRelocations} sesión{pendingRelocations === 1 ? '' : 'es'} sin lugar
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>
              Tocá para asignar espacio o sede externa a cada una
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>
      ) : null}
      {restorableCount > 0 ? (
        <TouchableOpacity
          style={[styles.relocBanner, { backgroundColor: '#22c55e22', borderColor: '#22c55e' }]}
          onPress={() => navigation.navigate('CoachRelocateSessions')}
          activeOpacity={0.85}
        >
          <Ionicons name="home-outline" size={22} color="#22c55e" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>
              {restorableCount} sesión{restorableCount === 1 ? '' : 'es'} pueden volver a su espacio
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>
              El espacio original ya está disponible — tocá para restaurar
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>
      ) : null}
      <CoachCategoryFilter
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={onCategoryChange}
        colorMarca={colorMarca}
        theme={theme}
      />
    </>
  );

  const emptyMessage = selectedCategoryId
    ? 'No hay sesiones para esta categoría en el rango visible.'
    : 'No hay sesiones en el rango visible. Creá una nueva con el botón +.';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />

      <CoachScreenHeaderWithFabs
        fabChildren={
          <>
            <CoachHeaderOverlayFab
              colorMarca={colorMarca}
              icon="stats-chart"
              accessibilityLabel="Estadísticas de sesiones"
              onPress={() =>
                navigation.navigate('CoachSessionStats', {
                  categoriaId: selectedCategoryId || undefined,
                })
              }
            />
            <CoachHeaderOverlayFab
              colorMarca={colorMarca}
              icon="add"
              accessibilityLabel="Nueva sesión"
              onPress={() => navigation.navigate('CoachNewSession')}
            />
          </>
        }
      >
        <CoachScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          kicker="Sesiones"
          title="Mis sesiones"
          subtitle={clubData?.nombre || 'Tu club'}
          reserveOverlaySpace
        />
      </CoachScreenHeaderWithFabs>

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  listPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  relocBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  rowSub: { fontSize: 14, marginTop: 4 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 },
  cancelBtn: { marginRight: 4, padding: 4 },
  statsBtn: { marginRight: 4, padding: 4 },
});
