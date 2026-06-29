import React, { useContext, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import WellnessMetricsChart from '../../components/WellnessMetricsChart';
import { seriesFromHistorial, wellnessMetricAverages, wellnessRecordValue } from '../../utils/wellnessHistorial';
import { WELLNESS_METRICS, WELLNESS_CARD_LABELS, WELLNESS_PRE_FIELDS } from '../../constants/wellnessMetrics';
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import { detectMediaKind, mediaKindIcon, downloadMediaFile, openMediaViewer } from '../../utils/mediaUtils';
import { platformCardShadow } from '../../utils/platformShadow';
import { sortEnrollmentsByAtleta, sortUsersByName } from '../../utils/listSort';
import CategoryRosterModal from '../../components/CategoryRosterModal';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CHART_WIDTH = Math.min(SCREEN_W - 64, 360);
const WELLNESS_MODAL_HEIGHT = Math.round(SCREEN_H * 0.92);
const WELLNESS_SPARK_W = SCREEN_W - 56;

const DOC_ESTADO_FILTERS = [
  { value: 'revision', label: 'En revisión' },
  { value: '', label: 'Todos' },
  { value: 'aprobado', label: 'Aprobados' },
  { value: 'rechazado', label: 'Rechazados' },
];

function docEstadoStyle(estado) {
  if (estado === 'aprobado') return { label: 'Aprobado', color: '#22c55e' };
  if (estado === 'rechazado') return { label: 'Rechazado', color: '#ef4444' };
  if (estado === 'revision') return { label: 'En revisión', color: '#3b82f6' };
  return { label: 'Pendiente', color: '#f59e0b' };
}

function formatDocDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function ageRangeHint(cat) {
  if (!cat) return '';
  const min = cat.edadMinima;
  const max = cat.edadMaxima;
  if (min == null && max == null) return 'Sin límite de edad en la categoría.';
  if (min != null && max != null) return `Solo atletas de ${min} a ${max} años.`;
  if (max != null) return `Solo atletas de hasta ${max} años.`;
  return `Solo atletas de ${min} años o más.`;
}

function matchesRosterSearch(enrollment, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const a = enrollment?.atleta;
  if (!a) return false;
  const full = `${a.nombre || ''} ${a.apellido || ''}`.toLowerCase();
  const dni = String(a.dni || '').toLowerCase();
  return full.includes(q) || dni.includes(q);
}

export default function CoachCategoryDetailScreen({ navigation, route }) {
  const { categoriaId, nombre, openPlantel } = route.params || {};
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const rosterCacheKey =
    clubData?.urlIdentifier && categoriaId
      ? `coach-category-detail:${clubData.urlIdentifier}:${categoriaId}`
      : '';

  const [enrollments, setEnrollments] = useState(() => readScreenCache(rosterCacheKey)?.enrollments ?? []);
  const [rosterSearch, setRosterSearch] = useState('');
  const [wellnessHistorial, setWellnessHistorial] = useState(
    () => readScreenCache(rosterCacheKey)?.wellnessHistorial ?? {},
  );
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [wellnessList, setWellnessList] = useState([]);
  const [wellnessLoading, setWellnessLoading] = useState(false);
  const [userRol, setUserRol] = useState(() => readScreenCache(rosterCacheKey)?.userRol ?? '');

  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [availableAthletes, setAvailableAthletes] = useState([]);
  const [pickerCategory, setPickerCategory] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [addLoading, setAddLoading] = useState(false);
  const [addSearching, setAddSearching] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [historyModal, setHistoryModal] = useState(null);

  const [docOpen, setDocOpen] = useState(false);
  const [docList, setDocList] = useState([]);
  const [docLoading, setDocLoading] = useState(false);
  const [docEstadoFilter, setDocEstadoFilter] = useState('revision');
  const [docPendingCount, setDocPendingCount] = useState(
    () => readScreenCache(rosterCacheKey)?.docPendingCount ?? 0,
  );
  const [userId, setUserId] = useState(() => readScreenCache(rosterCacheKey)?.userId ?? '');
  const [reviewingId, setReviewingId] = useState(null);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ visible: false, item: null, motivo: '' });
  const reopenDocAfterViewerRef = useRef(false);

  const [plantelModalOpen, setPlantelModalOpen] = useState(false);
  const [plantelEdicionEstado, setPlantelEdicionEstado] = useState(
    () => readScreenCache(rosterCacheKey)?.plantelEdicionEstado ?? null,
  );

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const isAdmin = userRol === 'admin_club' || userRol === 'administrativo';

  const showAlert = (title, message, onConfirm, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      onConfirm: onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
      onCancel: options.onCancel || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });
  };

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchRoster = useCallback(async () => {
    if (!categoriaId) return {};
    const h = await headers();
    const [enrRes, histRes, docPendingRes, plantelRes, rol, id] = await Promise.all([
      clubApi.get(`/enrollments/categoria/${categoriaId}`, { headers: h }),
      clubApi.get(`/wellness/categoria/${categoriaId}/historial?dias=30`, { headers: h }),
      clubApi.get('/requirements/submissions', {
        headers: h,
        params: { categoriaId, estado: 'revision' },
      }).catch(() => ({ data: [] })),
      clubApi.get(`/categories/${categoriaId}/plantel`, { headers: h }).catch(() => ({ data: {} })),
      getToken('userRol'),
      getToken('userId'),
    ]);
    return {
      enrollments: sortEnrollmentsByAtleta(enrRes.data || []),
      plantelEdicionEstado: plantelRes.data?.plantelEdicion?.estado || null,
      wellnessHistorial: histRes.data?.porAtleta || {},
      docPendingCount: (docPendingRes.data || []).length,
      userRol: rol || '',
      userId: id || '',
    };
  }, [categoriaId, clubData?.urlIdentifier]);

  const applyRoster = useCallback((data) => {
    setEnrollments(data.enrollments);
    setPlantelEdicionEstado(data.plantelEdicionEstado);
    setWellnessHistorial(data.wellnessHistorial);
    setDocPendingCount(data.docPendingCount);
    setUserRol(data.userRol);
    setUserId(data.userId);
  }, []);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: rosterCacheKey,
    enabled: !!rosterCacheKey,
    fetchData: fetchRoster,
    onFetched: applyRoster,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el plantel.');
    },
  });

  const showInitialLoader = loading && enrollments.length === 0;

  useEffect(() => {
    if (openPlantel && plantelEdicionEstado === 'delegado_coach') {
      setPlantelModalOpen(true);
    }
  }, [openPlantel, plantelEdicionEstado]);

  const canCoachDefinePlantel =
    (userRol === 'profe' || userRol === 'preparador_fisico') && plantelEdicionEstado === 'delegado_coach';

  const onCoachPlantelSaved = (data, errorMsg) => {
    if (errorMsg) {
      showAlert('Error', errorMsg);
      return;
    }
    showAlert('Listo', data?.message || 'Plantel de la categoría actualizado.');
    reload({ background: true });
  };

  const searchDebounce = useRef(null);

  const searchAvailable = useCallback(
    async (q) => {
      if (!categoriaId) return;
      setAddSearching(true);
      try {
        const h = await headers();
        const qs = q.trim().length >= 2 ? `?search=${encodeURIComponent(q.trim())}` : '';
        const res = await clubApi.get(
          `/enrollment-requests/categoria/${categoriaId}/disponibles${qs}`,
          { headers: h },
        );
        const data = res.data || {};
        setPickerCategory(data.categoria || null);
        setAvailableAthletes(sortUsersByName(data.atletas || []));
      } catch (e) {
        setPickerCategory(null);
        setAvailableAthletes([]);
      } finally {
        setAddSearching(false);
      }
    },
    [categoriaId, clubData?.urlIdentifier],
  );

  useEffect(() => {
    if (!addOpen) return undefined;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchAvailable(addSearch), 400);
    return () => clearTimeout(searchDebounce.current);
  }, [addSearch, addOpen, searchAvailable]);

  const openAddModal = () => {
    setAddOpen(true);
    setAddSearch('');
    setSelectedIds(new Set());
    setAddLoading(true);
    searchAvailable('').finally(() => setAddLoading(false));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAddRequest = async () => {
    if (selectedIds.size === 0) {
      showAlert('Atletas', 'Seleccioná al menos un atleta.');
      return;
    }
    setSubmittingRequest(true);
    try {
      const h = await headers();
      await clubApi.post(
        '/enrollment-requests',
        { categoriaId, atletaIds: [...selectedIds] },
        { headers: h },
      );
      setAddOpen(false);
      showAlert(
        'Solicitud enviada',
        'Administración revisará el pedido. Cuando la aprueben, los atletas aparecerán en el plantel.',
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo enviar la solicitud.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const loadDocSubmissions = useCallback(
    async (estado = docEstadoFilter) => {
      if (!categoriaId) return;
      setDocLoading(true);
      try {
        const h = await headers();
        const params = { categoriaId };
        if (estado) params.estado = estado;
        const res = await clubApi.get('/requirements/submissions', { headers: h, params });
        setDocList(res.data || []);
        if (estado === 'revision') {
          setDocPendingCount((res.data || []).length);
        }
      } catch (e) {
        showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las entregas.');
        setDocList([]);
      } finally {
        setDocLoading(false);
      }
    },
    [categoriaId, docEstadoFilter, clubData?.urlIdentifier],
  );

  useFocusEffect(
    useCallback(() => {
      if (!reopenDocAfterViewerRef.current) return;
      reopenDocAfterViewerRef.current = false;
      setDocOpen(true);
      loadDocSubmissions(docEstadoFilter);
    }, [docEstadoFilter, loadDocSubmissions]),
  );

  const openDocModal = () => {
    setDocEstadoFilter('revision');
    setDocOpen(true);
    loadDocSubmissions('revision');
  };

  const canReviewDoc = useCallback(
    (item) => {
      if (isAdmin) return true;
      const creadoPor = item.requerimiento?.creadoPor;
      if (!creadoPor) return true;
      return String(creadoPor) === String(userId);
    },
    [isAdmin, userId],
  );

  const openDocFile = async (item) => {
    if (!item.fileUrl) {
      showAlert('Archivo', 'Esta entrega no tiene archivo adjunto.');
      return;
    }
    const titulo = item.requerimiento?.titulo || 'Documento';
    const atleta = item.atleta ? `${item.atleta.nombre} ${item.atleta.apellido}` : '';
    const title = atleta ? `${titulo} · ${atleta}` : titulo;
    const fileKind = detectMediaKind(item.fileUrl);

    if (fileKind === 'pdf') {
      setDownloadingDocId(item._id);
      try {
        await downloadMediaFile(item.fileUrl, title);
      } catch (e) {
        showAlert('Error', e.message || 'No se pudo descargar el PDF.');
      } finally {
        setDownloadingDocId(null);
      }
      return;
    }

    try {
      reopenDocAfterViewerRef.current = true;
      closeRejectModal();
      setAlertConfig((p) => ({ ...p, visible: false }));
      setDocOpen(false);
      await openMediaViewer(navigation, {
        url: item.fileUrl,
        title,
        viewerRoute: 'CoachMediaViewer',
      });
    } catch (e) {
      reopenDocAfterViewerRef.current = false;
      setDocOpen(true);
      showAlert('Error', e.message || 'No se pudo abrir el recurso.');
    }
  };

  const submitDocReview = async (item, estado, motivoRechazo = '') => {
    setReviewingId(item._id);
    try {
      const h = await headers();
      const res = await clubApi.patch(
        `/requirements/submissions/${item._id}/review`,
        { estado, motivoRechazo },
        { headers: h },
      );
      const updated = res.data;
      setDocList((prev) => {
        if (docEstadoFilter === 'revision') {
          return prev.filter((s) => String(s._id) !== String(item._id));
        }
        return prev.map((s) => (String(s._id) === String(item._id) ? updated : s));
      });
      if (item.estado === 'revision') {
        setDocPendingCount((c) => Math.max(0, c - 1));
      }
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo actualizar la entrega.');
    } finally {
      setReviewingId(null);
    }
  };

  const confirmApproveDoc = (item) => {
    const nombre = `${item.atleta?.nombre || ''} ${item.atleta?.apellido || ''}`.trim() || 'el atleta';
    showAlert(
      'Aprobar documento',
      `¿Confirmás la documentación de ${nombre}?`,
      async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        await submitDocReview(item, 'aprobado');
      },
      { showCancel: true },
    );
  };

  const confirmRejectDoc = async () => {
    const motivo = rejectModal.motivo.trim();
    if (!motivo) {
      showAlert('Motivo', 'Escribí por qué se rechaza el documento.');
      return;
    }
    const item = rejectModal.item;
    setRejectModal({ visible: false, item: null, motivo: '' });
    await submitDocReview(item, 'rechazado', motivo);
  };

  const closeRejectModal = () => setRejectModal({ visible: false, item: null, motivo: '' });

  const closeDocModal = () => {
    closeRejectModal();
    setAlertConfig((p) => ({ ...p, visible: false }));
    setDocOpen(false);
  };

  const renderRejectOverlay = () => {
    if (!rejectModal.visible) return null;
    return (
      <View style={styles.embeddedRejectHost}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeRejectModal} />
          <View style={[styles.rejectModalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Rechazar documento</Text>
            <Text style={[styles.modalHint, { color: theme.textMuted }]}>
              El atleta verá este motivo y podrá volver a subir el archivo.
            </Text>
            <TextInput
              style={[
                styles.rejectInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Motivo del rechazo..."
              placeholderTextColor={theme.textMuted}
              value={rejectModal.motivo}
              onChangeText={(t) => setRejectModal((p) => ({ ...p, motivo: t }))}
              multiline
              maxLength={400}
            />
            <View style={styles.rejectModalActions}>
              <TouchableOpacity
                style={[styles.rejectModalBtn, { borderColor: theme.border }]}
                onPress={closeRejectModal}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rejectModalBtn, { backgroundColor: '#ef4444' }]} onPress={confirmRejectDoc}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  };

  const docPendingInList = useMemo(() => docList.filter((s) => s.estado === 'revision').length, [docList]);

  const openTeamWellness = async () => {
    setWellnessOpen(true);
    setWellnessLoading(true);
    try {
      const h = await headers();
      const res = await clubApi.get(`/wellness/equipo/${categoriaId}`, { headers: h });
      setWellnessList(res.data || []);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el wellness del día.');
    } finally {
      setWellnessLoading(false);
    }
  };

  const seriesFor = (atletaId) => seriesFromHistorial(wellnessHistorial[String(atletaId)]);

  const filteredEnrollments = useMemo(
    () => enrollments.filter((e) => matchesRosterSearch(e, rosterSearch)),
    [enrollments, rosterSearch],
  );

  const renderAthlete = ({ item }) => {
    const a = item.atleta;
    if (!a) return null;
    const series = seriesFor(a._id);
    const wellnessAvgs = wellnessMetricAverages(series);
    const avgByKey = Object.fromEntries(wellnessAvgs.map((m) => [m.key, m]));

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.athName, { color: theme.text }]}>
          {a.nombre} {a.apellido}
        </Text>
        <TouchableOpacity
          style={styles.sparkWrap}
          onPress={() =>
            setHistoryModal({
              atletaId: a._id,
              nombre: `${a.nombre} ${a.apellido}`,
              series,
            })
          }
        >
          <Text style={[styles.sparkLabel, { color: theme.textMuted }]}>
            Promedios wellness (30 días) · tocar para ver gráfico
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
                  <Text style={[styles.wellnessAvgLbl, { color: theme.textMuted }]} numberOfLines={1}>
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
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.miniBtn, { borderColor: colorMarca }]}
            onPress={() =>
              navigation.navigate('CoachWellness', {
                atletaId: a._id,
                atletaNombre: `${a.nombre} ${a.apellido}`,
                categoriaId,
              })
            }
          >
            <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>Wellness</Text>
          </TouchableOpacity>
          {userRol !== 'psicologo' ? (
            <TouchableOpacity
              style={[styles.miniBtn, { borderColor: theme.border }]}
              onPress={() =>
                navigation.navigate('CoachMeasurement', {
                  atletaId: a._id,
                  atletaNombre: `${a.nombre} ${a.apellido}`,
                })
              }
            >
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                {userRol === 'nutricionista' ? 'Mediciones' : 'Medición'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const activeAlertLayer = rejectModal.visible
    ? 'reject'
    : docOpen
      ? 'doc'
      : wellnessOpen
        ? 'wellness'
        : addOpen
          ? 'add'
          : historyModal
            ? 'history'
            : 'root';

  const renderEmbeddedAlert = () => (
    <CustomAlert
      embedded
      visible={alertConfig.visible}
      title={alertConfig.title}
      message={alertConfig.message}
      showCancel={alertConfig.showCancel}
      onConfirm={alertConfig.onConfirm}
      onCancel={alertConfig.onCancel}
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CategoryRosterModal
        visible={plantelModalOpen}
        onClose={() => setPlantelModalOpen(false)}
        categoryId={categoriaId}
        getHeaders={headers}
        theme={theme}
        colorMarca={colorMarca}
        canDelegateToCoach={false}
        coachOnly
        onSaved={onCoachPlantelSaved}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Categoría"
        title={nombre || 'Plantel'}
        subtitle={
          enrollments.length
            ? `${enrollments.length} atleta${enrollments.length === 1 ? '' : 's'} · ${clubData?.nombre || ''}`
            : clubData?.nombre || 'Tu club'
        }
        onBack={() => navigation.goBack()}
      />

      {canCoachDefinePlantel ? (
        <TouchableOpacity
          style={[styles.plantelBanner, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b' }]}
          onPress={() => setPlantelModalOpen(true)}
        >
          <Ionicons name="alert-circle-outline" size={22} color="#f59e0b" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>Actualizá el plantel de la categoría</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
              El administrador te pidió elegir quiénes integran esta categoría.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
        </TouchableOpacity>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionTile, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={openAddModal}
        >
          <View style={[styles.actionTileIcon, { backgroundColor: colorMarca + '18' }]}>
            <Ionicons name="person-add-outline" size={22} color={colorMarca} />
          </View>
          <Text style={[styles.actionTileLbl, { color: theme.text }]} numberOfLines={2}>
            Alta atletas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionTile, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={openTeamWellness}
        >
          <View style={[styles.actionTileIcon, { backgroundColor: colorMarca + '18' }]}>
            <Ionicons name="pulse-outline" size={22} color={colorMarca} />
          </View>
          <Text style={[styles.actionTileLbl, { color: theme.text }]} numberOfLines={2}>
            Wellness hoy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionTile, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={openDocModal}
        >
          <View style={[styles.actionTileIcon, { backgroundColor: colorMarca + '18' }]}>
            <Ionicons name="document-attach-outline" size={22} color={colorMarca} />
            {docPendingCount > 0 ? (
              <View style={styles.tileBadge}>
                <Text style={styles.tileBadgeTxt}>{docPendingCount > 9 ? '9+' : docPendingCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.actionTileLbl, { color: theme.text }]} numberOfLines={2}>
            Revisar docs
          </Text>
        </TouchableOpacity>
      </View>

      {!showInitialLoader ? (
        <View style={[styles.rosterSearchWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Ionicons name="search-outline" size={20} color={theme.textMuted} style={styles.rosterSearchIcon} />
          <TextInput
            style={[styles.rosterSearchInput, { color: theme.text }]}
            placeholder="Buscar atleta por nombre o DNI…"
            placeholderTextColor={theme.textMuted}
            value={rosterSearch}
            onChangeText={setRosterSearch}
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {rosterSearch.length > 0 ? (
            <TouchableOpacity
              onPress={() => setRosterSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredEnrollments}
          keyExtractor={(item) => item._id}
          renderItem={renderAthlete}
          contentContainerStyle={styles.listPad}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {rosterSearch.trim()
                ? 'No hay atletas que coincidan con la búsqueda.'
                : 'No hay atletas activos. Pedí el alta a administración con el botón de arriba.'}
            </Text>
          }
        />
      )}

      <Modal visible={addOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Solicitar atletas</Text>
              <TouchableOpacity onPress={() => setAddOpen(false)}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalHint, { color: theme.textMuted }]}>
              Elegí atletas que no están en la categoría. Administración debe aprobar la solicitud.
            </Text>
            <Text style={[styles.ageHint, { color: colorMarca }]}>
              {ageRangeHint(pickerCategory)}
            </Text>
            <TextInput
              style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder="Buscar por nombre, DNI o email…"
              placeholderTextColor={theme.textMuted}
              value={addSearch}
              onChangeText={setAddSearch}
            />
            {addLoading || addSearching ? (
              <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 280 }}>
                {availableAthletes.length === 0 ? (
                  <Text style={{ color: theme.textMuted, padding: 12 }}>
                    {addSearch.trim().length >= 2
                      ? 'Sin resultados para esta búsqueda.'
                      : pickerCategory?.edadMinima != null || pickerCategory?.edadMaxima != null
                        ? 'No hay atletas en el rango de edad de la categoría (o falta fecha de nacimiento).'
                        : 'No hay atletas disponibles para agregar.'}
                  </Text>
                ) : (
                  availableAthletes.map((u) => {
                    const sel = selectedIds.has(u._id);
                    const nac = isoCalendarDateToDisplay(u.fechaNacimiento);
                    const edadTxt = u.edad != null ? `${u.edad} años` : null;
                    return (
                      <TouchableOpacity
                        key={u._id}
                        style={[styles.pickRow, { borderColor: theme.border, backgroundColor: sel ? colorMarca + '15' : 'transparent' }]}
                        onPress={() => toggleSelect(u._id)}
                      >
                        <Ionicons
                          name={sel ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={sel ? colorMarca : theme.textMuted}
                        />
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: '700' }}>
                            {u.nombre} {u.apellido}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {[nac ? `Nac. ${nac}` : null, edadTxt, u.dni ? `DNI ${u.dni}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.submitReq, { backgroundColor: colorMarca, opacity: submittingRequest ? 0.7 : 1 }]}
              disabled={submittingRequest}
              onPress={submitAddRequest}
            >
              {submittingRequest ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitReqTxt}>
                  Enviar solicitud ({selectedIds.size})
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {activeAlertLayer === 'add' ? renderEmbeddedAlert() : null}
        </View>
      </Modal>

      <Modal visible={wellnessOpen} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.wellnessOverlay}>
          <TouchableOpacity
            style={styles.wellnessBackdrop}
            activeOpacity={1}
            onPress={() => setWellnessOpen(false)}
          />
          <View
            style={[
              styles.wellnessSheet,
              { backgroundColor: theme.background, height: WELLNESS_MODAL_HEIGHT },
            ]}
          >
            <View style={[styles.wellnessHero, { backgroundColor: colorMarca }]}>
              <View style={styles.wellnessHeroTop}>
                <View style={styles.wellnessHeroIcon}>
                  <Ionicons name="pulse" size={28} color="#fff" />
                </View>
                <TouchableOpacity
                  style={styles.wellnessCloseBtn}
                  onPress={() => setWellnessOpen(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.wellnessHeroTitle}>Wellness del equipo</Text>
              <Text style={styles.wellnessHeroSub}>
                {nombre || 'Categoría'} · reportes de hoy
              </Text>
              {!wellnessLoading ? (
                <View style={styles.wellnessHeroBadge}>
                  <Text style={styles.wellnessHeroBadgeTxt}>
                    {wellnessList.length} registro{wellnessList.length === 1 ? '' : 's'}
                  </Text>
                </View>
              ) : null}
            </View>

            {wellnessLoading ? (
              <View style={styles.wellnessLoadingBox}>
                <ActivityIndicator color={colorMarca} size="large" />
                <Text style={[styles.wellnessLoadingTxt, { color: theme.textMuted }]}>
                  Cargando reportes…
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.wellnessScroll}
                contentContainerStyle={styles.wellnessScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {wellnessList.length === 0 ? (
                  <View style={[styles.wellnessEmpty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Ionicons name="fitness-outline" size={48} color={theme.textMuted} />
                    <Text style={[styles.wellnessEmptyTitle, { color: theme.text }]}>Sin reportes hoy</Text>
                    <Text style={[styles.wellnessEmptySub, { color: theme.textMuted }]}>
                      Cuando el plantel cargue wellness pre o post, vas a verlo acá con su historial.
                    </Text>
                  </View>
                ) : (
                  wellnessList.map((w) => {
                    const aid = w.atleta?._id;
                    const hist = aid ? seriesFor(aid) : [];
                    const isPost = w.tipo === 'post';
                    return (
                      <View
                        key={w._id}
                        style={[styles.wellnessCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      >
                        <View style={styles.wellnessCardHead}>
                          <Text style={[styles.wellnessAthName, { color: theme.text }]}>
                            {w.atleta?.nombre} {w.atleta?.apellido}
                          </Text>
                          <View
                            style={[
                              styles.wellnessTipoPill,
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

                        <View style={styles.wellnessMetricsRow}>
                          {isPost ? (
                            <View style={[styles.wellnessMetric, { backgroundColor: theme.background }]}>
                              <Text style={[styles.wellnessMetricLbl, { color: theme.textMuted }]}>RPE</Text>
                              <Text style={[styles.wellnessMetricVal, { color: theme.text }]}>
                                {w.rpe ?? '—'}
                              </Text>
                            </View>
                          ) : (
                            WELLNESS_PRE_FIELDS.map((f) => {
                              const val = wellnessRecordValue(w, f.key);
                              return (
                                <View
                                  key={f.key}
                                  style={[styles.wellnessMetric, { backgroundColor: theme.background }]}
                                >
                                  <Text style={[styles.wellnessMetricLbl, { color: theme.textMuted }]}>{f.label}</Text>
                                  <Text style={[styles.wellnessMetricVal, { color: theme.text }]}>
                                    {val ?? '—'}
                                  </Text>
                                </View>
                              );
                            })
                          )}
                        </View>

                        <View style={[styles.wellnessChartBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <Text style={[styles.wellnessChartLbl, { color: theme.textMuted }]}>
                            Tendencia 30 días por métrica
                          </Text>
                          <WellnessMetricsChart
                            series={hist}
                            width={WELLNESS_SPARK_W}
                            height={120}
                            theme={theme}
                            colorMarca={colorMarca}
                            compact
                            showLegend
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
        {activeAlertLayer === 'wellness' ? renderEmbeddedAlert() : null}
      </Modal>

      <Modal visible={docOpen} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.wellnessOverlay}>
          <TouchableOpacity style={styles.wellnessBackdrop} activeOpacity={1} onPress={closeDocModal} />
          <View
            style={[
              styles.wellnessSheet,
              { backgroundColor: theme.background, height: WELLNESS_MODAL_HEIGHT },
            ]}
          >
            <View style={[styles.wellnessHero, { backgroundColor: colorMarca }]}>
              <View style={styles.wellnessHeroTop}>
                <View style={styles.wellnessHeroIcon}>
                  <Ionicons name="document-attach" size={28} color="#fff" />
                </View>
                <TouchableOpacity
                  style={styles.wellnessCloseBtn}
                  onPress={closeDocModal}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.wellnessHeroTitle}>Documentación enviada</Text>
              <Text style={styles.wellnessHeroSub}>
                {nombre || 'Categoría'} · aprobá o rechazá lo que subieron los atletas
              </Text>
              {!docLoading ? (
                <View style={styles.wellnessHeroBadge}>
                  <Text style={styles.wellnessHeroBadgeTxt}>
                    {docPendingInList} pendiente{docPendingInList === 1 ? '' : 's'} de revisión
                  </Text>
                </View>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.docFilterScroll}
              contentContainerStyle={styles.docFilterContent}
            >
              {DOC_ESTADO_FILTERS.map((f) => {
                const active = docEstadoFilter === f.value;
                return (
                  <TouchableOpacity
                    key={f.value || 'all'}
                    style={[
                      styles.docFilterChip,
                      {
                        borderColor: active ? colorMarca : theme.border,
                        backgroundColor: active ? colorMarca + '18' : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      setDocEstadoFilter(f.value);
                      loadDocSubmissions(f.value);
                    }}
                  >
                    <Text
                      style={{
                        color: active ? colorMarca : theme.text,
                        fontWeight: '700',
                        fontSize: 13,
                        lineHeight: 18,
                      }}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {docLoading ? (
              <View style={styles.wellnessLoadingBox}>
                <ActivityIndicator color={colorMarca} size="large" />
              </View>
            ) : (
              <ScrollView
                style={styles.wellnessScroll}
                contentContainerStyle={styles.wellnessScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {docList.length === 0 ? (
                  <View style={[styles.wellnessEmpty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Ionicons name="documents-outline" size={48} color={theme.textMuted} />
                    <Text style={[styles.wellnessEmptyTitle, { color: theme.text }]}>Sin entregas</Text>
                    <Text style={[styles.wellnessEmptySub, { color: theme.textMuted }]}>
                      No hay documentos con este filtro para esta categoría.
                    </Text>
                  </View>
                ) : (
                  docList.map((item) => {
                    const st = docEstadoStyle(item.estado);
                    const kind = detectMediaKind(item.fileUrl);
                    const busy = reviewingId === item._id;
                    const fileBusy = downloadingDocId === item._id;
                    const isPdf = kind === 'pdf';
                    const canReview = canReviewDoc(item) && item.estado === 'revision';
                    const DocMain = isPdf ? View : TouchableOpacity;
                    const docMainProps = isPdf
                      ? { style: styles.docReviewMain }
                      : { style: styles.docReviewMain, onPress: () => openDocFile(item), activeOpacity: 0.85 };
                    return (
                      <View
                        key={item._id}
                        style={[
                          styles.docReviewCard,
                          { backgroundColor: theme.surface, borderColor: theme.border },
                          platformCardShadow(3),
                        ]}
                      >
                        <DocMain {...docMainProps}>
                          <View style={[styles.docReviewIcon, { backgroundColor: colorMarca + '18' }]}>
                            <Ionicons name={mediaKindIcon(kind)} size={22} color={colorMarca} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.docReviewTitle, { color: theme.text }]} numberOfLines={2}>
                              {item.requerimiento?.titulo || 'Documento'}
                            </Text>
                            <Text style={[styles.docReviewSub, { color: theme.textMuted }]}>
                              {item.atleta?.nombre} {item.atleta?.apellido}
                            </Text>
                            <Text style={[styles.docReviewMeta, { color: theme.textMuted }]}>
                              {formatDocDate(item.updatedAt || item.createdAt)}
                            </Text>
                            {item.estado === 'rechazado' && item.motivoRechazo ? (
                              <Text style={styles.docRejectReason} numberOfLines={2}>
                                {item.motivoRechazo}
                              </Text>
                            ) : null}
                          </View>
                          <View style={[styles.docEstadoBadge, { backgroundColor: st.color + '22' }]}>
                            <Text style={{ color: st.color, fontWeight: '800', fontSize: 11 }}>{st.label}</Text>
                          </View>
                        </DocMain>
                        <View style={styles.docReviewActions}>
                          <TouchableOpacity
                            style={[styles.docViewBtn, { borderColor: theme.border, opacity: fileBusy ? 0.65 : 1 }]}
                            onPress={() => openDocFile(item)}
                            disabled={fileBusy}
                          >
                            {fileBusy ? (
                              <ActivityIndicator size="small" color={theme.text} />
                            ) : (
                              <>
                                <Ionicons
                                  name={isPdf ? 'download-outline' : 'eye-outline'}
                                  size={16}
                                  color={theme.text}
                                />
                                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 12, marginLeft: 4 }}>
                                  {isPdf ? 'Descargar' : 'Ver'}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                          {canReview ? (
                            <>
                              <TouchableOpacity
                                style={[styles.docApproveBtn, { opacity: busy ? 0.6 : 1 }]}
                                onPress={() => confirmApproveDoc(item)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                  <>
                                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                                    <Text style={styles.docActionTxt}>Aprobar</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.docRejectBtn, { opacity: busy ? 0.6 : 1 }]}
                                onPress={() => setRejectModal({ visible: true, item, motivo: '' })}
                                disabled={busy}
                              >
                                <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
                                <Text style={[styles.docActionTxt, { color: '#ef4444' }]}>Rechazar</Text>
                              </TouchableOpacity>
                            </>
                          ) : item.estado === 'revision' && !canReviewDoc(item) ? (
                            <Text style={[styles.docReadOnly, { color: theme.textMuted }]}>
                              Solo quien lo solicitó puede revisar
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
        {renderRejectOverlay()}
        {activeAlertLayer === 'doc' || activeAlertLayer === 'reject' ? renderEmbeddedAlert() : null}
      </Modal>

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
          {activeAlertLayer === 'history' ? renderEmbeddedAlert() : null}
        </View>
      </Modal>

      {activeAlertLayer === 'root' ? renderEmbeddedAlert() : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  plantelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
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
  docFilterScroll: { maxHeight: 62, flexGrow: 0 },
  docFilterContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  docFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 38,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docReviewCard: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  docReviewMain: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  docReviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docReviewTitle: { fontSize: 15, fontWeight: '800' },
  docReviewSub: { fontSize: 13, marginTop: 4 },
  docReviewMeta: { fontSize: 11, marginTop: 4 },
  docRejectReason: { fontSize: 12, color: '#ef4444', marginTop: 6, fontStyle: 'italic' },
  docEstadoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  docReviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  docViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  docApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#22c55e',
  },
  docRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  docActionTxt: { color: '#fff', fontWeight: '700', fontSize: 12, marginLeft: 2 },
  docReadOnly: { fontSize: 11, flex: 1, fontStyle: 'italic' },
  embeddedRejectHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    elevation: 500,
  },
  rejectModalCard: {
    marginHorizontal: 20,
    marginBottom: 40,
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  rejectInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    marginTop: 8,
    marginBottom: 16,
  },
  rejectModalActions: { flexDirection: 'row', gap: 10 },
  rejectModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rosterSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  rosterSearchIcon: { marginRight: 4 },
  rosterSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  listPad: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  athName: { fontSize: 16, fontWeight: '700' },
  sparkWrap: { marginTop: 10 },
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
  actions: { flexDirection: 'row', marginTop: 12, gap: 10 },
  miniBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  empty: { textAlign: 'center', marginTop: 32, paddingHorizontal: 20 },
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
  ageHint: { fontSize: 12, fontWeight: '700', marginBottom: 10, lineHeight: 16 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  submitReq: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitReqTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  wellnessOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wellnessBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  wellnessSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 16,
  },
  wellnessHero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  wellnessHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  wellnessHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wellnessCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wellnessHeroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  wellnessHeroSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  wellnessHeroBadge: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  wellnessHeroBadgeTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  wellnessLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
  },
  wellnessLoadingTxt: { marginTop: 12, fontSize: 15 },
  wellnessScroll: { flex: 1 },
  wellnessScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  wellnessEmpty: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 24,
  },
  wellnessEmptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  wellnessEmptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  wellnessCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  wellnessCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  wellnessAthName: { fontSize: 17, fontWeight: '800', flex: 1, marginRight: 10 },
  wellnessTipoPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  wellnessMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  wellnessMetric: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  wellnessMetricLbl: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  wellnessMetricVal: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  wellnessChartBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  wellnessChartLbl: { fontSize: 11, fontWeight: '700', marginBottom: 8 },
});
