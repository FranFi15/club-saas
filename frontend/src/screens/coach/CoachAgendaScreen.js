import React, { useContext, useCallback, useState, useMemo } from 'react';
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
import CoachScreenHeader, {
  CoachHeaderOverlayFab,
  CoachScreenHeaderWithFabs,
} from '../../components/CoachScreenHeader';
import FilterPillSheet from '../../components/FilterPillSheet';
import DesignCard from '../../components/DesignCard';
import { compareIsoCalendarDates, isoCalendarDateToDisplay, isoCalendarWeekday } from '../../utils/dateDisplay';
import { sessionDisplayName, sessionEsOpcional, isSessionPast, isSessionReadOnly, sessionTipoVisual } from '../../utils/sessionDisplay';
import { sortByNombre } from '../../utils/listSort';
import {
  categoriesGroupedByDisciplina,
  categoryPillLabel,
} from '../../utils/categoryFilterOptions';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const ESTADO_OPTIONS = [
  { label: 'Todos los estados', value: '' },
  { label: 'Programadas', value: 'programada' },
  { label: 'Completadas', value: 'completada' },
  { label: 'Canceladas', value: 'cancelada' },
];

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

function estadoLabel(item) {
  if (item.reubicacionPendiente) return 'Lugar pendiente';
  if (item.estado === 'completada') return 'Completada';
  if (item.estado === 'cancelada') return 'Cancelada';
  return 'Programada';
}

export default function CoachAgendaScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [openFilter, setOpenFilter] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);

  const agendaCacheKey = clubData?.urlIdentifier
    ? `coach-agenda:v2:${clubData.urlIdentifier}:${selectedCategoryId || 'all'}:${selectedEstado || 'all'}`
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

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
      onCancel: options.onCancel || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });
  };

  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

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
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set('categoriaId', selectedCategoryId);
    if (selectedEstado) params.set('estado', selectedEstado);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const [res, pendingRes, restoreRes] = await Promise.all([
      clubApi.get(`/sessions/profe/agenda${qs}`, { headers: h }),
      clubApi.get('/sessions/reubicacion-pendiente', { headers: h }).catch(() => ({ data: { sesiones: [] } })),
      clubApi.get('/sessions/restauracion-disponible', { headers: h }).catch(() => ({ data: { sesiones: [] } })),
    ]);
    const sesiones = [...(res.data.sesiones || [])];
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
  }, [clubData?.urlIdentifier, selectedCategoryId, selectedEstado]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: agendaCacheKey,
    enabled: !!agendaCacheKey,
    fetchData: fetchAgenda,
    onFetched: applyAgenda,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la agenda.');
    },
  });

  const showInitialLoader = loading && list.length === 0;

  const filterPillDefs = useMemo(
    () => [
      {
        key: 'category',
        placeholder: 'Categoría',
        value: selectedCategoryId,
        sections: categoriesGroupedByDisciplina(categories, {
          includeAll: true,
          allLabel: 'Todas las categorías',
        }),
        displayLabel: selectedCategoryId
          ? categoryPillLabel(categories, selectedCategoryId)
          : null,
        onChange: setSelectedCategoryId,
        searchable: true,
      },
      {
        key: 'estado',
        placeholder: 'Estado',
        value: selectedEstado,
        options: ESTADO_OPTIONS,
        onChange: setSelectedEstado,
        searchable: false,
      },
    ],
    [categories, selectedCategoryId, selectedEstado],
  );

  const reactivateSession = async (item) => {
    if (reactivatingId) return;
    setReactivatingId(item._id);
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      await clubApi.patch(`/sessions/${item._id}/uncancel`, {}, { headers: h });
      if (typeof reload === 'function') await reload();
      else await onRefresh();
      showAlert('Listo', 'La sesión volvió a programada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo reactivar la sesión.');
    } finally {
      setReactivatingId(null);
    }
  };

  const confirmReactivate = (item) => {
    showAlert('Reactivar sesión', '¿Querés volver a programar esta sesión cancelada?', {
      showCancel: true,
      confirmText: 'Reactivar',
      onConfirm: () => {
        closeAlert();
        reactivateSession(item);
      },
      onCancel: closeAlert,
    });
  };

  const renderItem = ({ item }) => {
    const isCancelada = item.estado === 'cancelada';
    const isCompletada = item.estado === 'completada';
    const isProgramada = item.estado === 'programada';
    const past = isSessionPast(item);
    const readOnly = isSessionReadOnly(item);
    const asistPct = isCompletada ? sessionAttendancePct(item) : null;
    const muted = isCancelada || past;
    const visual = sessionTipoVisual(item, { colorMarca });
    const titleColor = muted ? theme.textMuted : theme.text;
    const dotColor = isCancelada
      ? '#9ca3af'
      : isCompletada
        ? '#22c55e'
        : past
          ? '#9ca3af'
          : visual.accent;
    const accent = muted ? '#9ca3af' : visual.accent;

    const actions = (
      <View style={styles.rowActions}>
        {(isCompletada || past) && !isCancelada ? (
          <TouchableOpacity
            style={styles.statsBtn}
            onPress={() => navigation.navigate('CoachSessionStats', { sessionId: item._id })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="stats-chart-outline" size={22} color={colorMarca} />
          </TouchableOpacity>
        ) : null}
        {isProgramada && !past ? (
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
        {isCancelada && !past ? (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => confirmReactivate(item)}
            disabled={reactivatingId === item._id}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {reactivatingId === item._id ? (
              <ActivityIndicator size="small" color="#22c55e" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={26} color="#22c55e" />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );

    const hasActions =
      ((isCompletada || past) && !isCancelada) ||
      (isProgramada && !past) ||
      (isCancelada && !past);

    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={accent}
        muted={muted}
        onPress={() => navigation.navigate('CoachSessionDetail', { sessionId: item._id })}
        contentStyle={styles.rowMain}
        footer={
          <View style={styles.footerRow}>
            <Text style={[styles.rowMeta, { color: theme.textMuted, marginTop: 0, flex: 1 }]} numberOfLines={2}>
              {(item.lugarExterno || '').trim() || item.espacio?.nombre || 'Sin lugar'} ·{' '}
              {sessionDisplayName(item)}
              {sessionEsOpcional(item) ? ' · Opcional' : ''} · {estadoLabel(item)}
              {past && isProgramada ? ' · Finalizada' : ''}
              {asistPct != null ? ` · Asist. ${asistPct}%` : ''}
            </Text>
            {hasActions ? actions : <Ionicons name="chevron-forward" size={18} color={theme.icon} />}
          </View>
        }
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          {!muted ? (
            <View style={styles.tipoChipRow}>
              <View style={[styles.tipoChip, { backgroundColor: `${visual.accent}22`, borderColor: visual.accent }]}>
                <Text style={[styles.tipoChipTxt, { color: visual.accent }]}>{visual.shortLabel}</Text>
              </View>
            </View>
          ) : null}
          <Text style={[styles.rowTitle, { color: titleColor }]}>{sessionLabel(item)}</Text>
          <Text style={[styles.rowSub, { color: theme.textMuted }]}>
            {item.horaInicio}–{item.horaFin} · {item.categoria?.nombre}
          </Text>
          {item.reubicacionPendiente && !readOnly ? (
            <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              Definí el nuevo lugar de entrenamiento
            </Text>
          ) : null}
          {isCancelada && item.motivoCancelacion ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
              {item.motivoCancelacion}
            </Text>
          ) : null}
        </View>
      </DesignCard>
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
    </>
  );

  const emptyMessage =
    selectedCategoryId || selectedEstado
      ? 'No hay sesiones para este filtro en el rango visible.'
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
        <>
          <View style={styles.filtersWrap}>
            <FilterPillSheet
              pills={filterPillDefs}
              openKey={openFilter}
              onOpen={setOpenFilter}
              onClose={() => setOpenFilter(null)}
              colorMarca={colorMarca}
              theme={theme}
            />
          </View>
          <FlatList
            data={list}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listPad}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  filtersWrap: { paddingHorizontal: 16, paddingTop: 12 },
  listPad: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  relocBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  footerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tipoChipRow: { flexDirection: 'row', marginBottom: 4 },
  tipoChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tipoChipTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  rowTitle: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  rowSub: { fontSize: 14, marginTop: 4 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 },
  cancelBtn: { marginRight: 4, padding: 4 },
  statsBtn: { marginRight: 4, padding: 4 },
});
