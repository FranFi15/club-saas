import React, { useContext, useCallback, useState, useMemo, useEffect } from 'react';
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
  Modal,
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
import { sortByNombre, formatUserName } from '../../utils/listSort';
import { detectMediaKind, mediaKindIcon, downloadMediaFile, openMediaViewer } from '../../utils/mediaUtils';
import { platformCardShadow } from '../../utils/platformShadow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { pickPaginatedRows } from '../../utils/paginatedApi';

const UNFILED_KEY = 'unfiled';

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
  requerimientoFilter,
  estadoOptions,
  disciplinaOptions,
  categoryOptions,
  requerimientoOptions,
  onEstadoChange,
  onDisciplinaChange,
  onCategoriaChange,
  onRequerimientoChange,
  showScopeFilters,
  showPedidoFilter,
}) {
  const dropdownProps = { theme, colorMarca, compact: true };

  return (
    <View style={[styles.filtersPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {showPedidoFilter ? (
        <View style={styles.filterCellFull}>
          <Text style={[styles.filtersLabel, { color: theme.textMuted }]} numberOfLines={1}>
            Pedido / documentación
          </Text>
          <SearchableDropdown
            {...dropdownProps}
            data={requerimientoOptions}
            value={requerimientoFilter}
            onChange={onRequerimientoChange}
            placeholder="Todos los pedidos"
          />
        </View>
      ) : null}

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

function formatShortDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

export default function CoachTeamDocumentsScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const isAdminVariant = route?.params?.variant === 'admin';
  const returnToEquipo = Boolean(route?.params?.returnToEquipo);

  const [browseLevel, setBrowseLevel] = useState(() =>
    route?.params?.requerimientoId ? 'deliveries' : 'folders',
  );
  const [selectedFolderKey, setSelectedFolderKey] = useState(null);
  const [folders, setFolders] = useState([]);
  const [sinCarpetaCount, setSinCarpetaCount] = useState(0);
  const [folderPedidos, setFolderPedidos] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [refreshingFolders, setRefreshingFolders] = useState(false);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [refreshingPedidos, setRefreshingPedidos] = useState(false);

  const [estadoFilter, setEstadoFilter] = useState(() =>
    route?.params?.estado != null && route.params.estado !== ''
      ? String(route.params.estado)
      : '',
  );
  const [disciplinaFilter, setDisciplinaFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState(() =>
    route?.params?.categoriaId ? String(route.params.categoriaId) : '',
  );
  const [requerimientoFilter, setRequerimientoFilter] = useState(() =>
    route?.params?.requerimientoId ? String(route.params.requerimientoId) : '',
  );

  const [folderModal, setFolderModal] = useState({
    visible: false,
    mode: 'create',
    id: null,
    nombre: '',
  });
  const [moveModal, setMoveModal] = useState({ visible: false, pedido: null, carpeta: '' });
  const [folderSaving, setFolderSaving] = useState(false);

  useEffect(() => {
    if (route?.params?.categoriaId) {
      setCategoriaFilter(String(route.params.categoriaId));
    }
    if (route?.params?.estado != null && route.params.estado !== '') {
      setEstadoFilter(String(route.params.estado));
    }
    if (route?.params?.requerimientoId) {
      setRequerimientoFilter(String(route.params.requerimientoId));
      setBrowseLevel('deliveries');
    }
  }, [route?.params?.categoriaId, route?.params?.estado, route?.params?.requerimientoId]);

  const filterMetaCacheKey = clubData?.urlIdentifier
    ? `${isAdminVariant ? 'admin' : 'coach'}-doc-filters-v2:${clubData.urlIdentifier}`
    : '';
  const docsCacheKey = clubData?.urlIdentifier
    ? `${isAdminVariant ? 'admin' : 'team'}-docs:${clubData.urlIdentifier}:${selectedFolderKey || ''}:${estadoFilter}:${disciplinaFilter}:${categoriaFilter}:${requerimientoFilter}`
    : '';

  const cachedFilterMeta = readScreenCache(filterMetaCacheKey);
  const [list, setList] = useState(() => readScreenCache(docsCacheKey) ?? []);
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsHasMore, setSubmissionsHasMore] = useState(false);
  const [loadingMoreSubmissions, setLoadingMoreSubmissions] = useState(false);
  const [categories, setCategories] = useState(() => cachedFilterMeta?.categories ?? []);
  const [disciplines, setDisciplines] = useState(() => cachedFilterMeta?.disciplines ?? []);
  const [requirements, setRequirements] = useState(() => cachedFilterMeta?.requirements ?? []);
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
    isDanger: false,
    confirmText: 'Entendido',
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
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Entendido',
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

  const applyCarpetaParams = useCallback(
    (params) => {
      if (requerimientoFilter) {
        params.requerimientoId = requerimientoFilter;
        return;
      }
      if (selectedFolderKey === UNFILED_KEY) {
        params.sinCarpeta = 1;
      } else if (selectedFolderKey) {
        params.carpetaId = selectedFolderKey;
      }
    },
    [requerimientoFilter, selectedFolderKey],
  );

  const fetchFolders = useCallback(async () => {
    const h = await headers();
    const res = await clubApi.get('/requirements/folders', { headers: h });
    setFolders(res.data?.folders || []);
    setSinCarpetaCount(res.data?.sinCarpetaCount ?? 0);
  }, [headers]);

  const fetchFolderPedidos = useCallback(async () => {
    if (!selectedFolderKey) return;
    const h = await headers();
    const params =
      selectedFolderKey === UNFILED_KEY ? { sinCarpeta: 1 } : { carpetaId: selectedFolderKey };
    const res = await clubApi.get('/requirements/pedidos', { headers: h, params });
    setFolderPedidos(res.data?.requirements || []);
  }, [headers, selectedFolderKey]);

  const fetchFilterMeta = useCallback(async () => {
    const h = await headers();
    const pedidosReq = clubApi.get('/requirements/pedidos', { headers: h }).catch(() => ({ data: { requirements: [] } }));
    if (isAdminVariant) {
      const [catRes, discRes, pedRes] = await Promise.all([
        clubApi.get('/categories', { headers: h }),
        clubApi.get('/disciplines', { headers: h }),
        pedidosReq,
      ]);
      return {
        categories: sortByNombre(catRes.data || []),
        disciplines: sortByNombre(discRes.data || []),
        requirements: pedRes.data?.requirements || [],
      };
    }
    const [catRes, pedRes] = await Promise.all([
      clubApi.get('/categories/mis-categorias', { headers: h }),
      pedidosReq,
    ]);
    return {
      categories: sortByNombre(catRes.data || []),
      disciplines: [],
      requirements: pedRes.data?.requirements || [],
    };
  }, [headers, isAdminVariant]);

  const fetchSubmissions = useCallback(async () => {
    const h = await headers();
    const params = { page: 1, limit: 30 };
    if (estadoFilter) params.estado = estadoFilter;
    if (disciplinaFilter) params.disciplinaId = disciplinaFilter;
    if (categoriaFilter) params.categoriaId = categoriaFilter;
    applyCarpetaParams(params);
    const res = await clubApi.get('/requirements/submissions', { headers: h, params });
    const rows = pickPaginatedRows(res.data, 'submissions');
    setSubmissionsPage(res.data?.page ?? 1);
    setSubmissionsHasMore(Boolean(res.data?.hasMore));
    return rows;
  }, [headers, estadoFilter, disciplinaFilter, categoriaFilter, applyCarpetaParams]);

  const loadMoreSubmissions = useCallback(async () => {
    if (loadingMoreSubmissions || !submissionsHasMore || browseLevel !== 'deliveries') return;
    setLoadingMoreSubmissions(true);
    try {
      const h = await headers();
      const params = { page: submissionsPage + 1, limit: 30 };
      if (estadoFilter) params.estado = estadoFilter;
      if (disciplinaFilter) params.disciplinaId = disciplinaFilter;
      if (categoriaFilter) params.categoriaId = categoriaFilter;
      applyCarpetaParams(params);
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
    applyCarpetaParams,
    browseLevel,
  ]);

  useCachedFocusLoad({
    cacheKey: filterMetaCacheKey,
    enabled: !!filterMetaCacheKey,
    fetchData: fetchFilterMeta,
    onFetched: (data) => {
      setCategories(data?.categories ?? []);
      setDisciplines(data?.disciplines ?? []);
      setRequirements(data?.requirements ?? []);
    },
    onFetchError: () => {
      setCategories([]);
      setDisciplines([]);
      setRequirements([]);
    },
  });

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: docsCacheKey,
    enabled: !!docsCacheKey && browseLevel === 'deliveries',
    fetchData: fetchSubmissions,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las entregas.');
    },
  });

  const reloadFolders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingFolders(true);
    else setLoadingFolders(true);
    try {
      await fetchFolders();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las carpetas.');
    } finally {
      setLoadingFolders(false);
      setRefreshingFolders(false);
    }
  }, [fetchFolders]);

  const reloadPedidos = useCallback(async (isRefresh = false) => {
    if (!selectedFolderKey) return;
    if (isRefresh) setRefreshingPedidos(true);
    else setLoadingPedidos(true);
    try {
      await fetchFolderPedidos();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los pedidos.');
    } finally {
      setLoadingPedidos(false);
      setRefreshingPedidos(false);
    }
  }, [fetchFolderPedidos, selectedFolderKey]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [id, rol] = await Promise.all([getToken('userId'), getToken('userRol')]);
        setUserId(id || '');
        setUserRol(rol || '');
      })();

      if (browseLevel === 'folders') {
        reloadFolders();
      } else if (browseLevel === 'pedidos') {
        reloadPedidos();
      }

      return () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        setRejectModal({ visible: false, item: null, motivo: '' });
      };
    }, [browseLevel, reloadFolders, reloadPedidos]),
  );

  useEffect(() => {
    if (browseLevel === 'pedidos' && selectedFolderKey) {
      reloadPedidos();
    }
  }, [browseLevel, selectedFolderKey, reloadPedidos]);

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

  const canManagePedido = useCallback(
    (pedido) => {
      if (isAdmin) return true;
      return String(pedido?.creadoPor) === String(userId);
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
    const atleta = item.atleta ? formatUserName(item.atleta) : '';
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
    const nombre = formatUserName(item.atleta) || 'el atleta';
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

  const scopedRequirements = useMemo(() => {
    if (browseLevel === 'deliveries' && selectedFolderKey) {
      return folderPedidos.length ? folderPedidos : requirements.filter((r) => {
        const carpetaId = r.carpeta?._id || r.carpeta || null;
        if (selectedFolderKey === UNFILED_KEY) return !carpetaId;
        return String(carpetaId) === String(selectedFolderKey);
      });
    }
    return requirements;
  }, [browseLevel, selectedFolderKey, folderPedidos, requirements]);

  const requerimientoOptions = useMemo(
    () => [
      { label: 'Todos los pedidos', value: '' },
      ...scopedRequirements.map((r) => {
        const when = r.createdAt ? formatShortDate(r.createdAt) : '';
        const label = when ? `${r.titulo || 'Pedido'} · ${when}` : r.titulo || 'Pedido';
        return { label, value: String(r._id) };
      }),
    ],
    [scopedRequirements],
  );

  const folderMoveOptions = useMemo(
    () => [
      { label: 'Sin carpeta', value: '' },
      ...folders.map((f) => ({ label: f.nombre, value: String(f._id) })),
    ],
    [folders],
  );

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

  const selectedFolderName = useMemo(() => {
    if (selectedFolderKey === UNFILED_KEY) return 'Sin carpeta';
    const f = folders.find((x) => String(x._id) === String(selectedFolderKey));
    return f?.nombre || 'Carpeta';
  }, [selectedFolderKey, folders]);

  const headerTitle = useMemo(() => {
    if (browseLevel === 'folders') {
      return isAdminVariant ? 'Revisar documentación' : 'Documentación enviada';
    }
    if (browseLevel === 'pedidos') return selectedFolderName;
    if (requerimientoFilter) {
      const ped = scopedRequirements.find((r) => String(r._id) === String(requerimientoFilter));
      return ped?.titulo || 'Entregas';
    }
    return selectedFolderKey ? `Entregas · ${selectedFolderName}` : 'Entregas';
  }, [
    browseLevel,
    isAdminVariant,
    selectedFolderName,
    requerimientoFilter,
    scopedRequirements,
    selectedFolderKey,
  ]);

  const headerKicker = useMemo(() => {
    if (browseLevel === 'folders') return isAdminVariant ? 'Gestión' : 'Equipo';
    if (browseLevel === 'pedidos') return 'Pedidos';
    return 'Entregas';
  }, [browseLevel, isAdminVariant]);

  const exitToEquipoOrBack = () => {
    if (returnToEquipo) {
      navigation.navigate({
        name: 'CoachCategories',
        params: {
          selectedCategoria: route?.params?.categoriaId || categoriaFilter || undefined,
        },
        merge: true,
      });
      return;
    }
    navigation.goBack();
  };

  const handleBack = () => {
    if (browseLevel === 'deliveries') {
      if (selectedFolderKey) {
        setBrowseLevel('pedidos');
        setRequerimientoFilter('');
        setList([]);
        return;
      }
      setBrowseLevel('folders');
      setRequerimientoFilter('');
      setList([]);
      return;
    }
    if (browseLevel === 'pedidos') {
      setBrowseLevel('folders');
      setSelectedFolderKey(null);
      setFolderPedidos([]);
      return;
    }
    exitToEquipoOrBack();
  };

  const openFolder = (key) => {
    setSelectedFolderKey(key);
    setRequerimientoFilter('');
    setBrowseLevel('pedidos');
  };

  const openPedidoDeliveries = (pedidoId) => {
    setRequerimientoFilter(String(pedidoId));
    setBrowseLevel('deliveries');
  };

  const openAllFolderDeliveries = () => {
    setRequerimientoFilter('');
    setBrowseLevel('deliveries');
  };

  const openCreateFolder = () => {
    setFolderModal({ visible: true, mode: 'create', id: null, nombre: '' });
  };

  const openRenameFolder = (folder) => {
    setFolderModal({
      visible: true,
      mode: 'rename',
      id: folder._id,
      nombre: folder.nombre || '',
    });
  };

  const saveFolderModal = async () => {
    const nombre = folderModal.nombre.trim();
    if (!nombre) {
      showAlert('Carpeta', 'Indicá un nombre.');
      return;
    }
    setFolderSaving(true);
    try {
      const h = await headers();
      if (folderModal.mode === 'create') {
        await clubApi.post('/requirements/folders', { nombre }, { headers: h });
      } else {
        await clubApi.patch(`/requirements/folders/${folderModal.id}`, { nombre }, { headers: h });
      }
      setFolderModal({ visible: false, mode: 'create', id: null, nombre: '' });
      await fetchFolders();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar la carpeta.');
    } finally {
      setFolderSaving(false);
    }
  };

  const confirmDeleteFolder = (folder) => {
    showAlert(
      'Eliminar carpeta',
      `Se eliminará permanentemente la carpeta "${folder.nombre}", todos sus pedidos y todas las entregas asociadas. Esta acción no se puede deshacer.`,
      async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        try {
          const h = await headers();
          await clubApi.delete(`/requirements/folders/${folder._id}`, { headers: h });
          await fetchFolders();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar la carpeta.');
        }
      },
      { showCancel: true, isDanger: true, confirmText: 'Eliminar' },
    );
  };

  const confirmDeletePedido = (pedido) => {
    showAlert(
      'Eliminar pedido',
      `Se eliminará permanentemente el pedido "${pedido.titulo || 'sin título'}" y todas sus entregas. Esta acción no se puede deshacer.`,
      async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        try {
          const h = await headers();
          await clubApi.delete(`/requirements/${pedido._id}`, { headers: h });
          await reloadPedidos(true);
          await fetchFolders();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar el pedido.');
        }
      },
      { showCancel: true, isDanger: true, confirmText: 'Eliminar' },
    );
  };

  const openMovePedido = (pedido) => {
    const current = pedido.carpeta?._id || pedido.carpeta || '';
    setMoveModal({
      visible: true,
      pedido,
      carpeta: current ? String(current) : '',
    });
  };

  const saveMovePedido = async () => {
    const pedido = moveModal.pedido;
    if (!pedido) return;
    setFolderSaving(true);
    try {
      const h = await headers();
      await clubApi.patch(
        `/requirements/${pedido._id}`,
        { carpeta: moveModal.carpeta || null },
        { headers: h },
      );
      setMoveModal({ visible: false, pedido: null, carpeta: '' });
      await reloadPedidos(true);
      await fetchFolders();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo mover el pedido.');
    } finally {
      setFolderSaving(false);
    }
  };

  const folderListData = useMemo(() => {
    const rows = [
      {
        key: UNFILED_KEY,
        nombre: 'Sin carpeta',
        pedidosCount: sinCarpetaCount,
        isUnfiled: true,
      },
      ...folders.map((f) => ({
        key: String(f._id),
        nombre: f.nombre,
        pedidosCount: f.pedidosCount || 0,
        folder: f,
        isUnfiled: false,
      })),
    ];
    return rows;
  }, [folders, sinCarpetaCount]);

  const renderFolderItem = ({ item }) => (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }, platformCardShadow(3)]}>
      <TouchableOpacity style={styles.rowMain} onPress={() => openFolder(item.key)} activeOpacity={0.85}>
        <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
          <Ionicons
            name={item.isUnfiled ? 'folder-open-outline' : 'folder-outline'}
            size={22}
            color={colorMarca}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
            {item.nombre}
          </Text>
          <Text style={[styles.rowSub, { color: theme.textMuted }]}>
            {item.pedidosCount} {item.pedidosCount === 1 ? 'pedido' : 'pedidos'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </TouchableOpacity>
      {!item.isUnfiled && item.folder ? (
        <View style={styles.rowActions}>
          <TouchableOpacity
            style={[styles.viewBtn, { borderColor: theme.border }]}
            onPress={() => openRenameFolder(item.folder)}
          >
            <Ionicons name="pencil-outline" size={16} color={theme.text} />
            <Text style={[styles.viewBtnTxt, { color: theme.text }]}>Renombrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, { borderColor: '#ef4444' }]}
            onPress={() => confirmDeleteFolder(item.folder)}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={[styles.actionBtnTxt, { color: '#ef4444' }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const renderPedidoItem = ({ item }) => {
    const when = item.createdAt ? formatShortDate(item.createdAt) : '';
    const manageable = canManagePedido(item);
    return (
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }, platformCardShadow(3)]}>
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => openPedidoDeliveries(item._id)}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
            <Ionicons name="document-text-outline" size={22} color={colorMarca} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
              {item.titulo || 'Pedido'}
            </Text>
            <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
              {when || 'Sin fecha'}
              {item.alcance ? ` · ${item.alcance}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>
        {manageable ? (
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={[styles.viewBtn, { borderColor: theme.border }]}
              onPress={() => openMovePedido(item)}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color={theme.text} />
              <Text style={[styles.viewBtnTxt, { color: theme.text }]}>Mover</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, { borderColor: '#ef4444' }]}
              onPress={() => confirmDeletePedido(item)}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={[styles.actionBtnTxt, { color: '#ef4444' }]}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const renderDeliveryItem = ({ item }) => {
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
              {atleta ? formatUserName(atleta) : 'Atleta'}
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

  const foldersHeader = (
    <View style={styles.levelHeader}>
      <TouchableOpacity
        style={[styles.primaryAction, { backgroundColor: colorMarca }]}
        onPress={openCreateFolder}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.primaryActionTxt}>Nueva carpeta</Text>
      </TouchableOpacity>
    </View>
  );

  const pedidosHeader = (
    <View style={styles.levelHeader}>
      <TouchableOpacity
        style={[styles.secondaryAction, { borderColor: theme.border, backgroundColor: theme.surface }]}
        onPress={openAllFolderDeliveries}
      >
        <Ionicons name="layers-outline" size={18} color={colorMarca} />
        <Text style={[styles.secondaryActionTxt, { color: theme.text }]}>Ver todas las entregas</Text>
      </TouchableOpacity>
    </View>
  );

  const deliveriesHeader = (
    <FiltersPanel
      theme={theme}
      colorMarca={colorMarca}
      estadoFilter={estadoFilter}
      disciplinaFilter={disciplinaFilter}
      categoriaFilter={categoriaFilter}
      requerimientoFilter={requerimientoFilter}
      estadoOptions={estadoOptions}
      disciplinaOptions={disciplinaOptions}
      categoryOptions={categoryOptions}
      requerimientoOptions={requerimientoOptions}
      onEstadoChange={setEstadoFilter}
      onDisciplinaChange={handleDisciplinaChange}
      onCategoriaChange={setCategoriaFilter}
      onRequerimientoChange={setRequerimientoFilter}
      showScopeFilters={showScopeFilters}
      showPedidoFilter={!requerimientoFilter || scopedRequirements.length > 1}
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker={headerKicker}
        title={headerTitle}
        subtitle={clubData?.nombre || 'Tu club'}
        onBack={handleBack}
      />

      {browseLevel === 'folders' ? (
        <FlatList
          data={folderListData}
          keyExtractor={(item) => item.key}
          renderItem={renderFolderItem}
          ListHeaderComponent={foldersHeader}
          contentContainerStyle={[styles.listPad, folderListData.length === 0 && styles.listPadEmpty]}
          refreshControl={
            <RefreshControl
              refreshing={refreshingFolders}
              onRefresh={() => reloadFolders(true)}
              tintColor={colorMarca}
            />
          }
          ListEmptyComponent={
            loadingFolders ? (
              <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
            ) : (
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                Todavía no hay carpetas. Creá una para organizar tus pedidos.
              </Text>
            )
          }
        />
      ) : null}

      {browseLevel === 'pedidos' ? (
        <FlatList
          data={folderPedidos}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderPedidoItem}
          ListHeaderComponent={pedidosHeader}
          contentContainerStyle={[styles.listPad, folderPedidos.length === 0 && styles.listPadEmpty]}
          refreshControl={
            <RefreshControl
              refreshing={refreshingPedidos}
              onRefresh={() => reloadPedidos(true)}
              tintColor={colorMarca}
            />
          }
          ListEmptyComponent={
            loadingPedidos ? (
              <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
            ) : (
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                No hay pedidos en esta carpeta.
              </Text>
            )
          }
        />
      ) : null}

      {browseLevel === 'deliveries' ? (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderDeliveryItem}
          ListHeaderComponent={deliveriesHeader}
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
      ) : null}

      <Modal
        visible={rejectModal.visible}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setRejectModal({ visible: false, item: null, motivo: '' })}
      >
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
      </Modal>

      <Modal
        visible={folderModal.visible}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setFolderModal({ visible: false, mode: 'create', id: null, nombre: '' })}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setFolderModal({ visible: false, mode: 'create', id: null, nombre: '' })}
          />
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {folderModal.mode === 'create' ? 'Nueva carpeta' : 'Renombrar carpeta'}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, minHeight: 48 },
              ]}
              placeholder="Nombre de la carpeta"
              placeholderTextColor={theme.textMuted}
              value={folderModal.nombre}
              onChangeText={(t) => setFolderModal((p) => ({ ...p, nombre: t }))}
              maxLength={80}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border }]}
                onPress={() => setFolderModal({ visible: false, mode: 'create', id: null, nombre: '' })}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colorMarca, opacity: folderSaving ? 0.7 : 1 }]}
                onPress={saveFolderModal}
                disabled={folderSaving}
              >
                {folderSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={moveModal.visible}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setMoveModal({ visible: false, pedido: null, carpeta: '' })}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setMoveModal({ visible: false, pedido: null, carpeta: '' })}
          />
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Mover pedido</Text>
            <Text style={[styles.modalHint, { color: theme.textMuted }]}>
              {moveModal.pedido?.titulo || 'Elegí una carpeta de destino.'}
            </Text>
            <View style={{ marginTop: 14 }}>
              <SearchableDropdown
                theme={theme}
                colorMarca={colorMarca}
                data={folderMoveOptions}
                value={moveModal.carpeta}
                onChange={(v) => setMoveModal((p) => ({ ...p, carpeta: v }))}
                placeholder="Sin carpeta"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border }]}
                onPress={() => setMoveModal({ visible: false, pedido: null, carpeta: '' })}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colorMarca, opacity: folderSaving ? 0.7 : 1 }]}
                onPress={saveMovePedido}
                disabled={folderSaving}
              >
                {folderSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Mover</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  filterCellFull: {
    width: '100%',
    marginBottom: 10,
  },
  filtersLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  levelHeader: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryActionTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryActionTxt: { fontWeight: '700', fontSize: 14 },
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
