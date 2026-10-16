import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Modal,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import DesignCard from '../../components/DesignCard';
import UserAvatar from '../../components/UserAvatar';
import WellnessMetricsChart from '../../components/WellnessMetricsChart';
import { seriesFromHistorial, wellnessRecordValue } from '../../utils/wellnessHistorial';
import { WELLNESS_PRE_FIELDS } from '../../constants/wellnessMetrics';
import { sortEnrollmentsByAtleta, formatUserName } from '../../utils/listSort';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SPARK_W = SCREEN_W - 56;
const PICKER_HEIGHT = Math.round(SCREEN_H * 0.72);

export default function CoachTeamWellnessScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const categoriaId = route?.params?.categoriaId ? String(route.params.categoriaId) : '';
  const nombre = route?.params?.nombre || 'Categoría';
  const returnToEquipo = Boolean(route?.params?.returnToEquipo);

  const cacheKey =
    clubData?.urlIdentifier && categoriaId
      ? `coach-team-wellness:${clubData.urlIdentifier}:${categoriaId}`
      : '';

  const [list, setList] = useState([]);
  const [historial, setHistorial] = useState({});
  const [athletes, setAthletes] = useState([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchData = useCallback(async () => {
    if (!categoriaId) return { list: [], historial: {}, athletes: [] };
    const h = await headers();
    const [equipoRes, histRes, enrRes] = await Promise.all([
      clubApi.get(`/wellness/equipo/${categoriaId}`, { headers: h }),
      clubApi
        .get(`/wellness/categoria/${categoriaId}/historial?dias=30`, { headers: h })
        .catch(() => ({ data: { porAtleta: {} } })),
      clubApi.get(`/enrollments/categoria/${categoriaId}`, { headers: h }).catch(() => ({ data: [] })),
    ]);
    const roster = sortEnrollmentsByAtleta(enrRes.data || [])
      .map((e) => e.atleta)
      .filter((a) => a && a._id);
    return {
      list: equipoRes.data || [],
      historial: histRes.data?.porAtleta || {},
      athletes: roster,
    };
  }, [categoriaId, headers]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData,
    onFetched: (data) => {
      setList(data?.list || []);
      setHistorial(data?.historial || {});
      setAthletes(data?.athletes || []);
    },
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el wellness del equipo.');
    },
  });

  const seriesFor = useCallback(
    (atletaId) => seriesFromHistorial(historial[String(atletaId)]),
    [historial],
  );

  const preDoneIds = useMemo(() => {
    const set = new Set();
    list.forEach((w) => {
      if (w.tipo !== 'pre') return;
      const id = w.atleta?._id || w.atleta;
      if (id) set.add(String(id));
    });
    return set;
  }, [list]);

  const pendingAthletes = useMemo(
    () => athletes.filter((a) => !preDoneIds.has(String(a._id))),
    [athletes, preDoneIds],
  );

  const openAddWellness = (athlete) => {
    if (!athlete?._id) return;
    setPendingOpen(false);
    navigation.navigate('CoachWellness', {
      atletaId: athlete._id,
      atletaNombre: formatUserName(athlete),
      categoriaId,
    });
  };

  const openPendingList = () => {
    if (!athletes.length) {
      showAlert('Plantel', 'No hay atletas en esta categoría para cargar wellness.');
      return;
    }
    setPendingOpen(true);
  };

  const handleBack = () => {
    if (returnToEquipo) {
      navigation.navigate({
        name: 'CoachCategories',
        params: {
          selectedCategoria: categoriaId || undefined,
        },
        merge: true,
      });
      return;
    }
    navigation.goBack();
  };

  const showInitialLoader = loading && list.length === 0 && athletes.length === 0;

  const countLabel = useMemo(
    () => `${list.length} registro${list.length === 1 ? '' : 's'} hoy`,
    [list.length],
  );

  const renderReport = (w) => {
    const aid = w.atleta?._id;
    const hist = aid ? seriesFor(aid) : [];
    const isPost = w.tipo === 'post';
    return (
      <DesignCard
        key={w._id}
        theme={theme}
        isDarkMode={isDarkMode}
        accent={isPost ? '#f59e0b' : colorMarca}
        style={styles.cardWrap}
        contentStyle={styles.cardInner}
      >
        <View style={styles.cardHead}>
          <Text style={[styles.athName, { color: theme.text }]}>
            {formatUserName(w.atleta)}
          </Text>
          <View
            style={[
              styles.tipoPill,
              { backgroundColor: isPost ? '#f59e0b22' : colorMarca + '22' },
            ]}
          >
            <Text
              style={{
                color: isPost ? '#d97706' : colorMarca,
                fontWeight: '800',
                fontSize: 11,
                textTransform: 'uppercase',
              }}
            >
              {isPost ? 'Post' : 'Pre'}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          {isPost ? (
            <View style={[styles.metric, { backgroundColor: theme.background }]}>
              <Text style={[styles.metricLbl, { color: theme.textMuted }]}>RPE</Text>
              <Text style={[styles.metricVal, { color: theme.text }]}>{w.rpe ?? '—'}</Text>
            </View>
          ) : (
            WELLNESS_PRE_FIELDS.map((f) => {
              const val = wellnessRecordValue(w, f.key);
              return (
                <View key={f.key} style={[styles.metric, { backgroundColor: theme.background }]}>
                  <Text style={[styles.metricLbl, { color: theme.textMuted }]}>{f.label}</Text>
                  <Text style={[styles.metricVal, { color: theme.text }]}>{val ?? '—'}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.chartBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Text style={[styles.chartLbl, { color: theme.textMuted }]}>Tendencia 30 días por métrica</Text>
          <WellnessMetricsChart
            series={hist}
            width={SPARK_W}
            height={120}
            theme={theme}
            colorMarca={colorMarca}
            compact
            showLegend
          />
        </View>
      </DesignCard>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Equipo"
        title="Wellness del equipo"
        subtitle={`${nombre} · ${countLabel}`}
        onBack={handleBack}
      />

      {showInitialLoader ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colorMarca} size="large" />
          <Text style={[styles.loadingTxt, { color: theme.textMuted }]}>Cargando reportes…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.addCta, { backgroundColor: colorMarca }]}
            onPress={openPendingList}
            activeOpacity={0.88}
          >
            <Ionicons name="fitness-outline" size={20} color="#fff" />
            <Text style={styles.addCtaTxt}>Cargar wellness</Text>
            {pendingAthletes.length > 0 ? (
              <View style={styles.ctaBadge}>
                <Text style={styles.ctaBadgeTxt}>{pendingAthletes.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>Reportes de hoy</Text>
          {list.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="fitness-outline" size={48} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin reportes hoy</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                Tocá Cargar wellness para ver los pendientes de hoy.
              </Text>
            </View>
          ) : (
            list.map(renderReport)
          )}
        </ScrollView>
      )}

      <Modal
        visible={pendingOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPendingOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setPendingOpen(false)}
          />
          <View style={[styles.pickerSheet, { backgroundColor: theme.background, height: PICKER_HEIGHT }]}>
            <View style={[styles.pickerHero, { backgroundColor: colorMarca }]}>
              <View style={styles.pickerHeroTop}>
                <Text style={styles.pickerTitle}>Pendientes de hoy</Text>
                <TouchableOpacity
                  style={styles.pickerClose}
                  onPress={() => setPendingOpen(false)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.pickerSub}>
                {nombre} · {pendingAthletes.length} sin wellness pre
              </Text>
            </View>
            <FlatList
              data={pendingAthletes}
              keyExtractor={(a) => String(a._id)}
              contentContainerStyle={styles.pickerList}
              ListEmptyComponent={
                <View style={styles.pickerEmptyBox}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={theme.textMuted} />
                  <Text style={[styles.pickerEmpty, { color: theme.textMuted }]}>
                    Todos los atletas ya tienen wellness pre hoy.
                  </Text>
                </View>
              }
              renderItem={({ item: a }) => (
                <TouchableOpacity
                  style={[styles.pickerRow, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={() => openAddWellness(a)}
                  activeOpacity={0.85}
                >
                  <UserAvatar user={a} size={40} colorMarca={colorMarca} />
                  <View style={styles.pendingMeta}>
                    <Text style={[styles.athName, { color: theme.text }]} numberOfLines={1}>
                      {formatUserName(a)}
                    </Text>
                    <Text style={[styles.pendingHint, { color: theme.textMuted }]}>Sin wellness pre hoy</Text>
                  </View>
                  <View
                    style={[styles.wellnessBtn, { borderColor: colorMarca, backgroundColor: colorMarca + '18' }]}
                  >
                    <Ionicons name="fitness-outline" size={20} color={colorMarca} />
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  loadingTxt: { marginTop: 12, fontSize: 15 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  addCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 20,
  },
  addCtaTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ctaBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  empty: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  cardWrap: { marginBottom: 12 },
  cardInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  pendingMeta: { flex: 1, minWidth: 0 },
  pendingHint: { fontSize: 12, marginTop: 2 },
  wellnessBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  athName: { fontSize: 16, fontWeight: '800', flex: 1, marginRight: 10 },
  tipoPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metric: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricLbl: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  metricVal: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  chartBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  chartLbl: { fontSize: 11, fontWeight: '700', marginBottom: 8 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  pickerHero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  pickerHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  pickerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 6 },
  pickerList: { padding: 16, paddingBottom: 28 },
  pickerEmptyBox: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, gap: 12 },
  pickerEmpty: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
});
