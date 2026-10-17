import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  LayoutAnimation,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useBadgesOptional } from '../../context/BadgeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import BadgeDot from '../../components/BadgeDot';
import DesignCard from '../../components/DesignCard';
import FilterPillSheet from '../../components/FilterPillSheet';
import WellnessMetricsChart from '../../components/WellnessMetricsChart';
import { seriesFromHistorial, wellnessMetricAverages } from '../../utils/wellnessHistorial';
import { WELLNESS_METRICS, WELLNESS_CARD_LABELS } from '../../constants/wellnessMetrics';
import { sortByNombre, formatUserName } from '../../utils/listSort';
import { readScreenCache, writeScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { enableLayoutAnimationsIfNeeded } from '../../utils/layoutAnimation';

enableLayoutAnimationsIfNeeded();

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CHART_WIDTH = Math.min(SCREEN_W - 64, 360);
const WELLNESS_MODAL_HEIGHT = Math.round(SCREEN_H * 0.92);
const PAGE_SIZE = 20;

const ATHLETE_PANEL_ANIM = LayoutAnimation.create(
  260,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

function AthletePanelReveal({ children, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** Normalize /categories/mis-atletas rows for the Equipo list. */
function normalizeRosterRows(rows) {
  return (rows || []).map((row) => ({
    atleta: row.atleta,
    categorias: row.categorias || [],
    primaryCategoriaId: row.categorias?.[0]?._id,
  }));
}

function catIdForAthlete(row, selectedCatId) {
  if (selectedCatId && row.categorias.some((c) => String(c._id) === String(selectedCatId))) {
    return String(selectedCatId);
  }
  return String(row.primaryCategoriaId || row.categorias[0]?._id || '');
}

async function clubHeaders(urlIdentifier) {
  const token = await getToken('userToken');
  return {
    'x-club-identifier': urlIdentifier,
    Authorization: `Bearer ${token}`,
  };
}

export default function CoachCategoriesScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const badges = useBadgesOptional();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  // v2: roster from a single /mis-atletas call (no per-category N+1).
  const categoriesCacheKey = clubData?.urlIdentifier
    ? `coach-categories-v2:${clubData.urlIdentifier}`
    : '';

  const cached = categoriesCacheKey ? readScreenCache(categoriesCacheKey) : undefined;
  const [list, setList] = useState(() => cached?.list ?? []);
  const [athletes, setAthletes] = useState(() => cached?.athletes ?? []);
  const [wellnessByCat, setWellnessByCat] = useState(() => cached?.wellnessByCat ?? {});
  const [attendanceByCat, setAttendanceByCat] = useState(() => cached?.attendanceByCat ?? {});
  const [plantelPendientes, setPlantelPendientes] = useState(() => cached?.plantelPendientes ?? []);
  const [userRol, setUserRol] = useState(() => cached?.userRol ?? '');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [openFilter, setOpenFilter] = useState(null);

  // Restore category filter when returning from Docs / other Equipo shortcuts.
  useEffect(() => {
    const id = route?.params?.selectedCategoria;
    if (id == null || id === '') return;
    setSelectedCatId(String(id));
    navigation.setParams?.({ selectedCategoria: undefined });
  }, [route?.params?.selectedCategoria, navigation]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [activePanel, setActivePanel] = useState({});
  const [historyModal, setHistoryModal] = useState(null);
  const [docPendingCount, setDocPendingCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [metricsLoadingByCat, setMetricsLoadingByCat] = useState({});
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const wellnessRef = useRef(wellnessByCat);
  wellnessRef.current = wellnessByCat;
  const attendanceRef = useRef(attendanceByCat);
  attendanceRef.current = attendanceByCat;
  const metricsInflight = useRef(new Set());

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const applyShell = useCallback((data) => {
    setList(data.list);
    setAthletes(data.athletes || []);
    setPlantelPendientes(data.plantelPendientes);
    setUserRol(data.userRol);
    if (data.wellnessByCat) setWellnessByCat(data.wellnessByCat);
    if (data.attendanceByCat) setAttendanceByCat(data.attendanceByCat);
  }, []);

  const fetchShell = useCallback(async () => {
    const h = await clubHeaders(clubData.urlIdentifier);
    const rol = (await getToken('userRol')) || '';
    const [res, athRes, pendRes] = await Promise.all([
      clubApi.get('/categories/mis-categorias', { headers: h }),
      clubApi.get('/categories/mis-atletas', { headers: h }).catch(() => ({ data: [] })),
      rol === 'profe'
        ? clubApi.get('/categories/plantel-pendientes', { headers: h }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);
    const prev = readScreenCache(categoriesCacheKey) || {};
    return {
      userRol: rol,
      list: sortByNombre(res.data || []),
      athletes: normalizeRosterRows(athRes.data || []),
      plantelPendientes: rol === 'profe' ? pendRes.data || [] : [],
      wellnessByCat: prev.wellnessByCat || {},
      attendanceByCat: prev.attendanceByCat || {},
    };
  }, [clubData?.urlIdentifier, categoriesCacheKey]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: categoriesCacheKey,
    enabled: !!categoriesCacheKey,
    fetchData: fetchShell,
    onFetched: applyShell,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las categorías.');
    },
  });

  const persistRosterCache = useCallback(
    (patch) => {
      if (!categoriesCacheKey) return;
      const prev = readScreenCache(categoriesCacheKey) || {};
      writeScreenCache(categoriesCacheKey, { ...prev, ...patch });
    },
    [categoriesCacheKey],
  );

  useFocusEffect(
    useCallback(() => {
      badges?.refresh?.();
      if (categoriesCacheKey) reload({ background: true });
    }, [badges, categoriesCacheKey, reload]),
  );

  useEffect(() => {
    setActivePanel({});
    setVisibleCount(PAGE_SIZE);
  }, [selectedCatId, playerSearch]);

  const selectedCategory = useMemo(
    () => list.find((c) => String(c._id) === String(selectedCatId)) || null,
    [list, selectedCatId],
  );

  const categoryPills = useMemo(
    () => [
      {
        key: 'categoria',
        placeholder: 'Categoría',
        value: selectedCatId,
        options: [
          { value: '', label: 'Todas' },
          ...list.map((c) => ({ value: String(c._id), label: c.nombre })),
        ],
        displayLabel: selectedCategory?.nombre || 'Todas',
        onChange: (v) => setSelectedCatId(v == null ? '' : String(v)),
        searchable: list.length > 6,
      },
    ],
    [list, selectedCatId, selectedCategory],
  );

  const filteredAthletes = useMemo(() => {
    let rows = athletes;
    if (selectedCatId) {
      rows = rows.filter((r) => r.categorias.some((c) => String(c._id) === String(selectedCatId)));
    }
    const q = playerSearch.trim().toLowerCase();
    if (!q) return rows;
    const tokens = q.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const a = r.atleta || {};
      const hay = `${formatUserName(a)} ${a.dni || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [athletes, selectedCatId, playerSearch]);

  const visibleAthletes = useMemo(
    () => filteredAthletes.slice(0, visibleCount),
    [filteredAthletes, visibleCount],
  );

  const hasMoreVisible = visibleCount < filteredAthletes.length;

  const loadMoreAthletes = useCallback(() => {
    if (!hasMoreVisible) return;
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredAthletes.length));
  }, [hasMoreVisible, filteredAthletes.length]);

  const canCourt =
    userRol === 'profe' || userRol === 'preparador_fisico' || userRol === 'admin_club';

  const requireCategory = (actionLabel) => {
    if (selectedCategory) return selectedCategory;
    if (list.length === 1) return list[0];
    showAlert('Categoría', `Elegí una categoría en el filtro para ${actionLabel}.`);
    return null;
  };

  const goCategoryAction = (params) => {
    const cat = requireCategory(params.label);
    if (!cat) return;
    navigation.navigate('CoachCategoryDetail', {
      categoriaId: cat._id,
      nombre: cat.nombre,
      ...params.nav,
    });
  };

  const ensureCatMetrics = useCallback(
    async (catId) => {
      const id = String(catId || '');
      if (!id || !clubData?.urlIdentifier) return;
      const hasW = wellnessRef.current[id] != null;
      const hasA = attendanceRef.current[id] != null;
      if (hasW && hasA) return;
      if (metricsInflight.current.has(id)) return;
      metricsInflight.current.add(id);
      setMetricsLoadingByCat((prev) => ({ ...prev, [id]: true }));
      try {
        const h = await clubHeaders(clubData.urlIdentifier);
        const [hist, att] = await Promise.all([
          hasW
            ? Promise.resolve(null)
            : clubApi
                .get(`/wellness/categoria/${id}/historial?dias=30`, { headers: h })
                .catch(() => ({ data: { porAtleta: {} } })),
          hasA
            ? Promise.resolve(null)
            : clubApi
                .get(`/sessions/categoria/${id}/asistencia-resumen?dias=90`, { headers: h })
                .catch(() => ({ data: { porAtleta: {} } })),
        ]);
        if (hist) {
          setWellnessByCat((prev) => {
            const next = { ...prev, [id]: hist.data?.porAtleta || {} };
            persistRosterCache({ wellnessByCat: next });
            return next;
          });
        }
        if (att) {
          setAttendanceByCat((prev) => {
            const next = { ...prev, [id]: att.data?.porAtleta || {} };
            persistRosterCache({ attendanceByCat: next });
            return next;
          });
        }
      } finally {
        metricsInflight.current.delete(id);
        setMetricsLoadingByCat((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [clubData?.urlIdentifier, persistRosterCache],
  );

  const handleRefresh = useCallback(async () => {
    setWellnessByCat({});
    setAttendanceByCat({});
    setVisibleCount(PAGE_SIZE);
    setActivePanel({});
    persistRosterCache({
      wellnessByCat: {},
      attendanceByCat: {},
    });
    await onRefresh();
  }, [onRefresh, persistRosterCache]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const cat = selectedCategory || (list.length === 1 ? list[0] : null);
        if (!cat || !clubData?.urlIdentifier) {
          if (!cancelled) setDocPendingCount(0);
          return;
        }
        try {
          const h = await clubHeaders(clubData.urlIdentifier);
          const res = await clubApi.get('/requirements/submissions', {
            headers: h,
            params: { categoriaId: cat._id, estado: 'revision', page: 1, limit: 1 },
          });
          if (!cancelled) setDocPendingCount(Number(res.data?.total) || 0);
        } catch {
          if (!cancelled) setDocPendingCount(0);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedCategory, list, clubData?.urlIdentifier]),
  );

  const showInitialLoader =
    loading && list.length === 0 && athletes.length === 0 && plantelPendientes.length === 0;

  const athletePanels = useMemo(() => {
    const panels = [
      { key: 'wellness', label: 'Wellness', shortLabel: 'Well.', icon: 'pulse-outline' },
      { key: 'asistencias', label: 'Asistencias', shortLabel: 'Asist.', icon: 'checkbox-outline' },
    ];
    if (userRol !== 'psicologo') {
      panels.splice(1, 0, {
        key: 'mediciones',
        label: userRol === 'nutricionista' ? 'Mediciones' : 'Medición',
        shortLabel: 'Med.',
        icon: 'analytics-outline',
      });
    }
    return panels;
  }, [userRol]);

  const openAthleteMeasurement = useCallback(
    (atleta) => {
      navigation.navigate('CoachMeasurement', {
        atletaId: atleta._id,
        atletaNombre: formatUserName(atleta),
        initialTab: 'historial',
      });
    },
    [navigation],
  );

  const setAthletePanel = useCallback((aid, key) => {
    LayoutAnimation.configureNext(ATHLETE_PANEL_ANIM);
    setActivePanel((p) => {
      if (p[aid] === key) {
        const next = { ...p };
        delete next[aid];
        return next;
      }
      return { ...p, [aid]: key };
    });
  }, []);

  const openAthletePanel = useCallback(
    async (aid, key, catId) => {
      if (key === 'mediciones') return;
      setAthletePanel(aid, key);
      if (key === 'wellness' || key === 'asistencias') {
        await ensureCatMetrics(catId);
      }
    },
    [setAthletePanel, ensureCatMetrics],
  );

  const resolveAttendance = useCallback(
    (athleteId, catId) => {
      if (catId) {
        return (
          attendanceByCat[catId]?.[String(athleteId)] || {
            presente: 0,
            tarde: 0,
            ausente: 0,
            total: 0,
            asistenciaPct: null,
          }
        );
      }
      const merged = { presente: 0, tarde: 0, ausente: 0, total: 0 };
      Object.values(attendanceByCat).forEach((byAth) => {
        const st = byAth?.[String(athleteId)];
        if (!st) return;
        merged.presente += st.presente || 0;
        merged.tarde += st.tarde || 0;
        merged.ausente += st.ausente || 0;
        merged.total += st.total || 0;
      });
      merged.asistenciaPct =
        merged.total > 0 ? Math.round((merged.presente / merged.total) * 100) : null;
      return merged;
    },
    [attendanceByCat],
  );

  const renderAttendanceSummary = (athleteId, catId) => {
    const st = resolveAttendance(athleteId, catId);
    return (
      <View style={styles.attendanceRow}>
        <View style={styles.attendanceChip}>
          <Text style={[styles.attendanceLbl, { color: theme.textMuted }]}>Presente</Text>
          <Text style={[styles.attendanceVal, { color: '#22c55e' }]}>{st.presente}</Text>
        </View>
        <View style={styles.attendanceChip}>
          <Text style={[styles.attendanceLbl, { color: theme.textMuted }]}>Tarde</Text>
          <Text style={[styles.attendanceVal, { color: '#f59e0b' }]}>{st.tarde}</Text>
        </View>
        <View style={styles.attendanceChip}>
          <Text style={[styles.attendanceLbl, { color: theme.textMuted }]}>Ausente</Text>
          <Text style={[styles.attendanceVal, { color: '#ef4444' }]}>{st.ausente}</Text>
        </View>
        {st.total > 0 ? (
          <View style={styles.attendanceChip}>
            <Text style={[styles.attendanceLbl, { color: theme.textMuted }]}>% asist.</Text>
            <Text style={[styles.attendanceVal, { color: theme.text }]}>{st.asistenciaPct}%</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const listHeader = (
    <View>
      {plantelPendientes.length > 0 ? (
        <View style={[styles.pendienteBox, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b' }]}>
          <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 8 }}>
            Plantel pendiente del club ({plantelPendientes.length})
          </Text>
          {plantelPendientes.map((p) => (
            <TouchableOpacity
              key={p._id}
              style={[styles.pendienteRow, { borderColor: theme.border }]}
              onPress={() =>
                navigation.navigate('CoachCategoryDetail', {
                  categoriaId: p._id,
                  nombre: p.nombre,
                  openPlantel: true,
                })
              }
            >
              <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>{p.nombre}</Text>
              <BadgeDot count={1} />
              <Ionicons name="chevron-forward" size={18} color={theme.icon} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={[styles.filterLbl, { color: theme.textMuted }]}>Categoría</Text>
      <FilterPillSheet
        pills={categoryPills}
        openKey={openFilter}
        onOpen={setOpenFilter}
        onClose={() => setOpenFilter(null)}
        colorMarca={colorMarca}
        theme={theme}
      />

      <View style={styles.actionRow}>
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={colorMarca}
          onPress={() => goCategoryAction({ label: 'pedir el alta', nav: { openAlta: true } })}
          style={styles.actionTileWrap}
          contentStyle={styles.actionTileInner}
        >
          <View style={[styles.actionTileIcon, { backgroundColor: `${colorMarca}22` }]}>
            <Ionicons name="person-add-outline" size={22} color={colorMarca} />
          </View>
          <Text style={[styles.actionTileLbl, { color: theme.text }]}>Alta</Text>
        </DesignCard>

        {canCourt ? (
          <DesignCard
            theme={theme}
            isDarkMode={isDarkMode}
            accent="#f97316"
            onPress={() => navigation.navigate('CoachCourtMetrics')}
            style={styles.actionTileWrap}
            contentStyle={styles.actionTileInner}
          >
            <View style={[styles.actionTileIcon, { backgroundColor: '#f9731622' }]}>
              <Ionicons name="stats-chart-outline" size={22} color="#f97316" />
            </View>
            <Text style={[styles.actionTileLbl, { color: theme.text }]}>Individual</Text>
          </DesignCard>
        ) : null}

        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent="#01c3a8"
          onPress={() => {
            const cat = requireCategory('ver wellness');
            if (!cat) return;
            navigation.navigate('CoachTeamWellness', {
              categoriaId: String(cat._id),
              nombre: cat.nombre,
              returnToEquipo: true,
            });
          }}
          style={styles.actionTileWrap}
          contentStyle={styles.actionTileInner}
        >
          <View style={[styles.actionTileIcon, { backgroundColor: '#01c3a822' }]}>
            <Ionicons name="pulse-outline" size={22} color="#01c3a8" />
          </View>
          <Text style={[styles.actionTileLbl, { color: theme.text }]}>Wellness</Text>
        </DesignCard>

        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent="#ffb741"
          onPress={() => {
            const cat = requireCategory('revisar docs');
            if (!cat) return;
            navigation.navigate('CoachTeamDocuments', {
              categoriaId: String(cat._id),
              estado: 'revision',
              returnToEquipo: true,
            });
          }}
          style={styles.actionTileWrap}
          contentStyle={styles.actionTileInner}
        >
          <View style={[styles.actionTileIcon, { backgroundColor: '#ffb74122' }]}>
            <Ionicons name="document-attach-outline" size={22} color="#ffb741" />
            {docPendingCount > 0 ? (
              <View style={styles.tileBadge}>
                <Text style={styles.tileBadgeTxt}>{docPendingCount > 10 ? '+' : docPendingCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.actionTileLbl, { color: theme.text }]}>Docs</Text>
        </DesignCard>
      </View>

      <View style={[styles.searchWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Ionicons name="search-outline" size={20} color={theme.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Buscar atleta por nombre o DNI…"
          placeholderTextColor={theme.textMuted}
          value={playerSearch}
          onChangeText={setPlayerSearch}
          autoCapitalize="words"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {playerSearch.length > 0 ? (
          <TouchableOpacity onPress={() => setPlayerSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const listFooter = (
    <View style={styles.footerBox}>
      {hasMoreVisible ? (
        <ActivityIndicator color={colorMarca} style={{ marginVertical: 12 }} />
      ) : filteredAthletes.length > 0 ? (
        <Text style={[styles.footerDone, { color: theme.textMuted }]}>Fin del listado</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Equipo"
        title="Mi equipo"
        subtitle={clubData?.nombre || 'Tu club'}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={visibleAthletes}
          keyExtractor={(item) => String(item.atleta._id)}
          contentContainerStyle={styles.listPad}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colorMarca} />
          }
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          onEndReached={loadMoreAthletes}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {list.length === 0
                ? `Todavía no tenés categorías asignadas. Pedile al administrador que te asigne.`
                : playerSearch.trim()
                  ? 'No hay atletas que coincidan con la búsqueda.'
                  : selectedCatId
                    ? 'No hay atletas en esta categoría.'
                    : 'No hay atletas en tus categorías.'}
            </Text>
          }
          renderItem={({ item }) => {
            const a = item.atleta;
            if (!a) return null;
            const aid = String(a._id);
            const catId = catIdForAthlete(item, selectedCatId);
            const catsLabel = item.categorias.map((c) => c.nombre).join(' · ');
            const series = seriesFromHistorial(wellnessByCat[catId]?.[aid]);
            const wellnessAvgs = wellnessMetricAverages(series);
            const avgByKey = Object.fromEntries(wellnessAvgs.map((m) => [m.key, m]));
            const panel = activePanel[aid];
            const metricsLoading = !!metricsLoadingByCat[catId];
            const wellnessReady = wellnessByCat[catId] != null;
            const attendanceReady = attendanceByCat[catId] != null;

            return (
              <DesignCard theme={theme} isDarkMode={isDarkMode} accent={colorMarca} contentStyle={styles.cardInner}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.athName, { color: theme.text }]} numberOfLines={1}>
                      {formatUserName(a)}
                    </Text>
                    {!selectedCatId && catsLabel ? (
                      <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                        {catsLabel}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.tabRow}>
                    {athletePanels.map((tab) => {
                      const selected = panel === tab.key;
                      return (
                        <TouchableOpacity
                          key={tab.key}
                          style={[
                            styles.tabBtn,
                            {
                              borderColor: selected ? colorMarca : theme.border,
                              backgroundColor: selected ? `${colorMarca}18` : theme.background,
                            },
                          ]}
                          onPress={() => {
                            if (tab.key === 'mediciones') {
                              openAthleteMeasurement(a);
                              return;
                            }
                            openAthletePanel(aid, tab.key, catId);
                          }}
                          accessibilityLabel={tab.label}
                        >
                          <Ionicons name={tab.icon} size={14} color={selected ? colorMarca : theme.textMuted} />
                          <Text
                            style={[styles.tabBtnTxt, { color: selected ? colorMarca : theme.textMuted }]}
                            numberOfLines={1}
                          >
                            {tab.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {!panel ? (
                  <Text style={[styles.panelHint, { color: theme.textMuted, marginBottom: 0 }]}>
                    Elegí Wellness, Medición o Asistencias para ver el detalle.
                  </Text>
                ) : null}

                {panel === 'wellness' ? (
                  <AthletePanelReveal style={styles.panelBlock}>
                    {metricsLoading && !wellnessReady ? (
                      <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.sparkWrap}
                          onPress={() =>
                            setHistoryModal({
                              atletaId: a._id,
                              nombre: formatUserName(a),
                              series,
                            })
                          }
                        >
                          <Text style={[styles.sparkLabel, { color: theme.textMuted }]}>
                            Promedios wellness (30 días) · tocar para gráfico
                          </Text>
                          <View style={styles.wellnessAvgRow}>
                            {WELLNESS_METRICS.map((def) => {
                              const m = avgByKey[def.key];
                              const hasData = !!m;
                              return (
                                <View
                                  key={def.key}
                                  style={[
                                    styles.wellnessAvgChip,
                                    {
                                      backgroundColor: theme.background,
                                      borderColor: theme.border,
                                      borderTopColor: def.color,
                                      borderTopWidth: 2,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[styles.wellnessAvgLbl, { color: theme.textMuted }]}
                                    numberOfLines={1}
                                  >
                                    {WELLNESS_CARD_LABELS[def.key] || def.label}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.wellnessAvgVal,
                                      { color: hasData ? theme.text : theme.textMuted },
                                    ]}
                                  >
                                    {hasData ? m.display : '—'}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.panelActionBtn, { borderColor: colorMarca }]}
                          onPress={() =>
                            navigation.navigate('CoachWellness', {
                              atletaId: a._id,
                              atletaNombre: formatUserName(a),
                              categoriaId: catId,
                              returnToEquipo: true,
                            })
                          }
                        >
                          <Text style={{ color: colorMarca, fontWeight: '700' }}>Abrir wellness</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </AthletePanelReveal>
                ) : null}

                {panel === 'asistencias' ? (
                  <AthletePanelReveal style={styles.panelBlock}>
                    {metricsLoading && !attendanceReady ? (
                      <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} />
                    ) : (
                      <>
                        {renderAttendanceSummary(a._id, catId)}
                        <Text style={[styles.panelHint, { color: theme.textMuted }]}>
                          Resumen de los últimos 90 días. Se actualiza al guardar asistencia en cada sesión.
                        </Text>
                      </>
                    )}
                  </AthletePanelReveal>
                ) : null}
              </DesignCard>
            );
          }}
        />
      )}

      <Modal visible={!!historyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                {historyModal?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setHistoryModal(null)}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalHint, { color: theme.textMuted }]}>
              Historial wellness — últimos 30 días (cada línea es una métrica)
            </Text>
            <ScrollView style={{ maxHeight: WELLNESS_MODAL_HEIGHT * 0.55 }} showsVerticalScrollIndicator={false}>
              <WellnessMetricsChart
                series={historyModal?.series || []}
                width={CHART_WIDTH}
                height={220}
                colorMarca={colorMarca}
                theme={theme}
                showLegend
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  listPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  filterLbl: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  pendienteBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  pendienteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionTileWrap: {
    flex: 1,
    marginBottom: 0,
  },
  actionTileInner: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  actionTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tileBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  actionTileLbl: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 14,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  footerBox: { paddingBottom: 8, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  footerDone: { fontSize: 12, fontWeight: '600', marginVertical: 10 },
  cardInner: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  athName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  tabRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4, flexShrink: 0 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  tabBtnTxt: { fontSize: 10, fontWeight: '700' },
  panelBlock: { paddingTop: 0 },
  panelHint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  panelActionBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  attendanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  attendanceChip: {
    minWidth: 68,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.08)',
    alignItems: 'center',
  },
  attendanceLbl: { fontSize: 10, fontWeight: '600' },
  attendanceVal: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  sparkWrap: { marginTop: 4 },
  sparkLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  wellnessAvgRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    marginTop: 8,
  },
  wellnessAvgChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  wellnessAvgLbl: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
  wellnessAvgVal: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 20, fontSize: 15, lineHeight: 22 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 8 },
  modalHint: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
});
