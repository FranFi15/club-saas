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
  TextInput,
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
import SearchableDropdown from '../../components/SearchableDropdown';
import { sortByNombre } from '../../utils/listSort';
import { detectMediaKind, mediaKindIcon, downloadMediaFile, openMediaViewer } from '../../utils/mediaUtils';
import { platformCardShadow } from '../../utils/platformShadow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { pickPaginatedRows } from '../../utils/paginatedApi';

const ESTADO_FILTERS = [
  { value: '', label: 'Todos los estados' },
  { value: 'revision', label: 'En revisión' },
  { value: 'aprobado', label: 'Aprobados' },
  { value: 'rechazado', label: 'Rechazados' },
];

function categoryDisciplinaId(category) {
  const d = category?.disciplina;
  if (!d) return '';
  return String(d._id || d);
}

function FiltersPanel({
  theme,
  colorMarca,
  estadoFilter,
  disciplinaFilter,
  categoriaFilter,
  estadoOptions,
  disciplinaOptions,
  categoryOptions,
  onEstadoChange,
  onDisciplinaChange,
  onCategoriaChange,
  showScopeFilters,
}) {
  const dropdownProps = { theme, colorMarca, compact: true };

  return (
    <View style={[styles.filtersPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.filtersRow}>
        <View style={styles.filterCell}>
          <Text style={[styles.filtersLabel, { color: theme.textMuted }]} numberOfLines={1}>
            Estado
          </Text>
          <SearchableDropdown
            {...dropdownProps}
            data={estadoOptions}
            value={estadoFilter}
            onChange={onEstadoChange}
            placeholder="Estado"
          />
        </View>

        {showScopeFilters ? (
          <>
            <View style={styles.filterCell}>
              <Text style={[styles.filtersLabel, { color: theme.textMuted }]} numberOfLines={1}>
                Disciplina
              </Text>
              <SearchableDropdown
                {...dropdownProps}
                data={disciplinaOptions}
                value={disciplinaFilter}
                onChange={onDisciplinaChange}
                placeholder="Disciplina"
              />
            </View>

            <View style={styles.filterCell}>
              <Text style={[styles.filtersLabel, { color: theme.textMuted }]} numberOfLines={1}>
                Categoría
              </Text>
              <SearchableDropdown
                {...dropdownProps}
                data={categoryOptions}
                value={categoriaFilter}
                onChange={onCategoriaChange}
                placeholder="Categoría"
              />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function estadoStyle(estado) {
  if (estado === 'aprobado') return { label: 'Aprobado', color: '#22c55e' };
  if (estado === 'rechazado') return { label: 'Rechazado', color: '#ef4444' };
  if (estado === 'revision') return { label: 'En revisión', color: '#3b82f6' };
  return { label: 'Pendiente', color: '#f59e0b' };
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function CoachTeamDocumentsScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const isAdminVariant = route?.params?.variant === 'admin';
  const [estadoFilter, setEstadoFilter] = useState('');
  const [disciplinaFilter, setDisciplinaFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('');
  const filterMetaCacheKey = clubData?.urlIdentifier
    ? `${isAdminVariant ? 'admin' : 'coach'}-doc-filters:${clubData.urlIdentifier}`
    : '';
  const docsCacheKey = clubData?.urlIdentifier
    ? `${isAdminVariant ? 'admin' : 'team'}-docs:${clubData.urlIdentifier}:${estadoFilter}:${disciplinaFilter}:${categoriaFilter}`
    : '';

  const cachedFilterMeta = readScreenCache(filterMetaCacheKey);
  const [list, setList] = useState(() => readScreenCache(docsCacheKey) ?? []);
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsHasMore, setSubmissionsHasMore] = useState(false);
  const [loadingMoreSubmissions, setLoadingMoreSubmissions] = useState(false);
  const [categories, setCategories] = useState(() => cachedFilterMeta?.categories ?? []);
  const [disciplines, setDisciplines] = useState(() => cachedFilterMeta?.disciplines ?? []);
  const [userId, setUserId] = useState('');
  const [userRol, setUserRol] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ visible: false, item: null, motivo: '' });
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

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchFilterMeta = useCallback(async () => {
    const h = await headers();
    if (isAdminVariant) {
      const [catRes, discRes] = await Promise.all([
        clubApi.get('/categories', { headers: h }),
        clubApi.get('/disciplines', { headers: h }),
      ]);
      return {
        categories: sortByNombre(catRes.data || []),
        disciplines: sortByNombre(discRes.data || []),
      };
    }
    const catRes = await clubApi.get('/categories/mis-categorias', { headers: h });
    return {
      categories: sortByNombre(catRes.data || []),
      disciplines: [],
    };
  }, [headers, isAdminVariant]);

  const fetchSubmissions = useCallback(async () => {
    const h = await headers();
    const params = { page: 1, limit: 30 };
    if (estadoFilter) params.estado = estadoFilter;
    if (disciplinaFilter) params.disciplinaId = disciplinaFilter;
    if (categoriaFilter) params.categoriaId = categoriaFilter;
    const res = await clubApi.get('/requirements/submissions', { headers: h, params });
    const rows = pickPaginatedRows(res.data, 'submissions');
    setSubmissionsPage(res.data?.page ?? 1);
    setSubmissionsHasMore(Boolean(res.data?.hasMore));
    return rows;
  }, [headers, estadoFilter, disciplinaFilter, categoriaFilter]);

  const loadMoreSubmissions = useCallback(async () => {
    if (loadingMoreSubmissions || !submissionsHasMore) return;
    setLoadingMoreSubmissions(true);
    try {
      const h = await headers();
      const params = { page: submissionsPage + 1, limit: 30 };
      if (estadoFilter) params.estado = estadoFilter;
      if (disciplinaFilter) params.disciplinaId = disciplinaFilter;
      if (categoriaFilter) params.categoriaId = categoriaFilter;
      const res = await clubApi.get('/requirements/submissions', { headers: h, params });
      const rows = pickPaginatedRows(res.data, 'submissions');
      setList((prev) => [...prev, ...rows]);
      setSubmissionsPage(res.data?.page ?? submissionsPage + 1);
      setSubmissionsHasMore(Boolean(res.data?.hasMore));
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar más entregas.');
    } finally {
      setLoadingMoreSubmissions(false);
    }
  }, [
    loadingMoreSubmissions,
    submissionsHasMore,
    submissionsPage,
    headers,
    estadoFilter,
    disciplinaFilter,
    categoriaFilter,
  ]);

  useCachedFocusLoad({
    cacheKey: filterMetaCacheKey,
    enabled: !!filterMetaCacheKey,
    fetchData: fetchFilterMeta,
    onFetched: (data) => {
      setCategories(data?.categories ?? []);
      setDisciplines(data?.disciplines ?? []);
    },
    onFetchError: () => {
      setCategories([]);
      setDisciplines([]);
    },
  });

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: docsCacheKey,
    enabled: !!docsCacheKey,
    fetchData: fetchSubmissions,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las entregas.');
    },
  });

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [id, rol] = await Promise.all([getToken('userId'), getToken('userRol')]);
        setUserId(id || '');
        setUserRol(rol || '');
      })();

      return () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        setRejectModal({ visible: false, item: null, motivo: '' });
      };
    }, []),
  );

  const showInitialLoader = loading && list.length === 0;

  const canReviewItem = useCallback(
    (item) => {
      if (isAdmin) return true;
      const creadoPor = item.requerimiento?.creadoPor;
      if (!creadoPor) return true;
      return String(creadoPor) === String(userId);
    },
    [isAdmin, userId],
  );

  const dismissOverlays = useCallback(() => {
    setAlertConfig((p) => ({ ...p, visible: false }));
    setRejectModal({ visible: false, item: null, motivo: '' });
  }, []);

  const openFile = async (item) => {
    if (!item.fileUrl) {
      showAlert('Archivo', 'Esta entrega no tiene archivo adjunto.');
      return;
    }
    dismissOverlays();
    const titulo = item.requerimiento?.titulo || 'Documento';
    const atleta = item.atleta ? `${item.atleta.nombre} ${item.atleta.apellido}` : '';
    const title = atleta ? `${titulo} · ${atleta}` : titulo;
    const kind = detectMediaKind(item.fileUrl);

    if (kind === 'pdf') {
      setDownloadingFileId(item._id);
      try {
        await downloadMediaFile(item.fileUrl, title);
      } catch (e) {
        showAlert('Error', e.message || 'No se pudo descargar el PDF.');
      } finally {
        setDownloadingFileId(null);
      }
      return;
    }

    try {
      await openMediaViewer(navigation, {
        url: item.fileUrl,
        title,
        viewerRoute: 'CoachMediaViewer',
      });
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo abrir el recurso.');
    }
  };

  const submitReview = async (item, estado, motivoRechazo = '') => {
    setReviewingId(item._id);
    try {
      const h = await headers();
      const res = await clubApi.patch(
        `/requirements/submissions/${item._id}/review`,
        { estado, motivoRechazo },
        { headers: h },
      );
      setList((prev) => prev.map((s) => (String(s._id) === String(item._id) ? res.data : s)));
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo actualizar la entrega.');
    } finally {
      setReviewingId(null);
    }
  };

  const confirmApprove = (item) => {
    const nombre = `${item.atleta?.nombre || ''} ${item.atleta?.apellido || ''}`.trim() || 'el atleta';
    setRejectModal({ visible: false, item: null, motivo: '' });
    showAlert('Aprobar documento', `¿Confirmás la documentación de ${nombre}?`, async () => {
      setAlertConfig((p) => ({ ...p, visible: false }));
      await submitReview(item, 'aprobado');
    }, { showCancel: true });
  };

  const openReject = (item) => {
    setAlertConfig((p) => ({ ...p, visible: false }));
    setRejectModal({ visible: true, item, motivo: '' });
  };

  const confirmReject = async () => {
    const motivo = rejectModal.motivo.trim();
    if (!motivo) {
      showAlert('Motivo', 'Escribí por qué se rechaza el documento.');
      return;
    }
    const item = rejectModal.item;
    setRejectModal({ visible: false, item: null, motivo: '' });
    await submitReview(item, 'rechazado', motivo);
  };

  const pendingCount = useMemo(() => list.filter((s) => s.estado === 'revision').length, [list]);

  const estadoOptions = useMemo(
    () => ESTADO_FILTERS.map((f) => ({ label: f.label, value: f.value })),
    [],
  );

  const disciplinaOptions = useMemo(() => {
    if (isAdminVariant) {
      return [
        { label: 'Todas las disciplinas', value: '' },
        ...disciplines.map((d) => ({ label: d.nombre, value: d._id })),
      ];
    }
    const seen = new Map();
    categories.forEach((c) => {
      const id = categoryDisciplinaId(c);
      if (!id || seen.has(id)) return;
      seen.set(id, c.disciplina?.nombre || 'Disciplina');
    });
    return [
      { label: 'Todas las disciplinas', value: '' },
      ...sortByNombre([...seen.entries()].map(([value, label]) => ({ value, label }))),
    ];
  }, [isAdminVariant, disciplines, categories]);

  const categoryOptions = useMemo(() => {
    const filtered = disciplinaFilter
      ? categories.filter((c) => categoryDisciplinaId(c) === String(disciplinaFilter))
      : categories;
    return [
      { label: 'Todas las categorías', value: '' },
      ...filtered.map((c) => ({ label: c.nombre, value: c._id })),
    ];
  }, [categories, disciplinaFilter]);

  const handleDisciplinaChange = useCallback(
    (value) => {
      setDisciplinaFilter(value);
      if (value && categoriaFilter) {
        const cat = categories.find((c) => String(c._id) === String(categoriaFilter));
        if (cat && categoryDisciplinaId(cat) !== String(value)) {
          setCategoriaFilter('');
        }
      }
    },
    [categories, categoriaFilter],
  );

  const showScopeFilters = categories.length > 0;

  const renderItem = ({ item }) => {
    const st = estadoStyle(item.estado);
    const kind = detectMediaKind(item.fileUrl);
    const atleta = item.atleta;
    const req = item.requerimiento;
    const busy = reviewingId === item._id;
    const fileBusy = downloadingFileId === item._id;
    const isPdf = kind === 'pdf';
    const canReview = canReviewItem(item) && item.estado === 'revision';
    const RowMain = isPdf ? View : TouchableOpacity;
    const rowMainProps = isPdf
      ? { style: styles.rowMain }
      : { style: styles.rowMain, onPress: () => openFile(item), activeOpacity: 0.85 };

    return (
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }, platformCardShadow(3)]}>
        <RowMain {...rowMainProps}>
          <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
            <Ionicons name={mediaKindIcon(kind)} size={22} color={colorMarca} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
              {req?.titulo || 'Requerimiento'}
            </Text>
            <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
              {atleta ? `${atleta.nombre} ${atleta.apellido}` : 'Atleta'}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{formatDate(item.updatedAt || item.createdAt)}</Text>
            {item.estado === 'rechazado' && item.motivoRechazo ? (
              <Text style={styles.rejectReason} numberOfLines={2}>
                {item.motivoRechazo}
              </Text>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: st.color + '22' }]}>
            <Text style={[styles.badgeTxt, { color: st.color }]}>{st.label}</Text>
          </View>
        </RowMain>

        <View style={styles.rowActions}>
          <TouchableOpacity
            style={[styles.viewBtn, { borderColor: theme.border, opacity: fileBusy ? 0.65 : 1 }]}
            onPress={() => openFile(item)}
            disabled={fileBusy}
          >
            {fileBusy ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <>
                <Ionicons name={isPdf ? 'download-outline' : 'eye-outline'} size={16} color={theme.text} />
                <Text style={[styles.viewBtnTxt, { color: theme.text }]}>{isPdf ? 'Descargar' : 'Ver archivo'}</Text>
              </>
            )}
          </TouchableOpacity>

          {canReview ? (
            <>
              <TouchableOpacity
                style={[styles.approveBtn, { backgroundColor: '#22c55e', opacity: busy ? 0.6 : 1 }]}
                onPress={() => confirmApprove(item)}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnTxt}>Aprobar</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectBtn, { borderColor: '#ef4444', opacity: busy ? 0.6 : 1 }]}
                onPress={() => openReject(item)}
                disabled={busy}
              >
                <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
                <Text style={[styles.actionBtnTxt, { color: '#ef4444' }]}>Rechazar</Text>
              </TouchableOpacity>
            </>
          ) : item.estado === 'revision' && !canReviewItem(item) ? (
            <Text style={[styles.readOnlyHint, { color: theme.textMuted }]}>
              Solo quien lo solicitó o un admin puede revisarlo
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const listHeader = (
    <FiltersPanel
      theme={theme}
      colorMarca={colorMarca}
      estadoFilter={estadoFilter}
      disciplinaFilter={disciplinaFilter}
      categoriaFilter={categoriaFilter}
      estadoOptions={estadoOptions}
      disciplinaOptions={disciplinaOptions}
      categoryOptions={categoryOptions}
      onEstadoChange={setEstadoFilter}
      onDisciplinaChange={handleDisciplinaChange}
      onCategoriaChange={setCategoriaFilter}
      showScopeFilters={showScopeFilters}
    />
  );

  const activeAlertLayer = rejectModal.visible ? 'reject' : 'root';

  const renderEmbeddedAlert = () => (
    <CustomAlert
      embedded
      visible={alertConfig.visible}
      title={alertConfig.title}
      message={alertConfig.message}
      onConfirm={alertConfig.onConfirm}
      onCancel={alertConfig.onCancel}
      showCancel={alertConfig.showCancel}
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker={isAdminVariant ? 'Gestión' : 'Equipo'}
        title={isAdminVariant ? 'Revisar documentación' : 'Documentación enviada'}
        subtitle={
          pendingCount > 0
            ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} de revisión`
            : isAdminVariant
              ? 'Revisá todas las entregas del club'
              : 'Revisá y aprobá lo que subieron tus atletas'
        }
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={list}
        keyExtractor={(item) => String(item._id)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.listPad, list.length === 0 && styles.listPadEmpty]}
        onEndReached={loadMoreSubmissions}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMoreSubmissions ? <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} /> : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
        ListEmptyComponent={
          showInitialLoader ? (
            <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
          ) : (
            <Text style={[styles.empty, { color: theme.textMuted }]}>No hay entregas con estos filtros.</Text>
          )
        }
      />

      {rejectModal.visible ? (
        <View style={styles.modalHost}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setRejectModal({ visible: false, item: null, motivo: '' })}
            />
            <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Rechazar documento</Text>
              <Text style={[styles.modalHint, { color: theme.textMuted }]}>
                El atleta verá este motivo y podrá volver a subir el archivo.
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                ]}
                placeholder="Motivo del rechazo..."
                placeholderTextColor={theme.textMuted}
                value={rejectModal.motivo}
                onChangeText={(t) => setRejectModal((p) => ({ ...p, motivo: t }))}
                multiline
                maxLength={400}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { borderColor: theme.border }]}
                  onPress={() => setRejectModal({ visible: false, item: null, motivo: '' })}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ef4444' }]} onPress={confirmReject}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
          {renderEmbeddedAlert()}
        </View>
      ) : (
        activeAlertLayer === 'root' ? renderEmbeddedAlert() : null
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  modalHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    elevation: 500,
  },
  filtersPanel: {
    marginHorizontal: 8,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  filterCell: {
    flex: 1,
    minWidth: 0,
  },
  filtersLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  listPad: { paddingBottom: 40 },
  listPadEmpty: { flexGrow: 1, paddingHorizontal: 16 },
  row: { borderRadius: 12, borderWidth: 1, marginBottom: 12, marginHorizontal: 16, overflow: 'hidden' },
  rowMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowSub: { fontSize: 14, marginTop: 4 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  rejectReason: { fontSize: 12, color: '#ef4444', marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, maxWidth: 96 },
  badgeTxt: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
    paddingTop: 10,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewBtnTxt: { fontSize: 13, fontWeight: '600' },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  readOnlyHint: { flex: 1, fontSize: 12, lineHeight: 16 },
  empty: { textAlign: 'center', marginTop: 24, marginHorizontal: 16, paddingHorizontal: 12, fontSize: 15, lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 28 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalHint: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  modalInput: {
    marginTop: 14,
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
