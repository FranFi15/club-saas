import React, { useContext, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { uploadFileToClub, pickWebFile, imageFromPickerAsset, iosCompatiblePhotoOptions } from '../../utils/uploadMedia';
import { normalizeYouTubeWatchUrl } from '../../utils/youtubeUrl';
import { detectMediaKind, mediaKindIcon, downloadMediaFile, openExternalLink, openYouTubeExternal } from '../../utils/mediaUtils';
import { pickPaginatedRows } from '../../utils/paginatedApi';
import { formatJsDateToDisplay } from '../../utils/dateDisplay';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import DesignCard from '../../components/DesignCard';
import FormSheet from '../../components/FormSheet';
import { sortByNombre, formatUserName } from '../../utils/listSort';
import {
  categoriesAsSectionedOptions,
  categoryPillLabel,
} from '../../utils/categoryFilterOptions';

function normalizeExternalLink(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const yt = normalizeYouTubeWatchUrl(trimmed);
  if (yt) return yt;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const TIPO_CHIPS_COACH = [
  { value: 'tactico', label: 'Táctico' },
  { value: 'stats', label: 'Stats' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'rutina', label: 'Rutina' },
  { value: 'otro', label: 'Otro' },
];

const TIPO_CHIPS_NUTRI = [
  { value: 'nutricion', label: 'Nutrición' },
  { value: 'otro', label: 'Otro' },
];

const TIPO_CHIPS_PSI = [
  { value: 'estudio_medico', label: 'Estudio / informe' },
  { value: 'otro', label: 'Otro' },
];

const TIPO_LABELS = {
  rutina: 'Rutina',
  nutricion: 'Nutrición',
  estudio_medico: 'Estudio médico',
  tactico: 'Táctico',
  stats: 'Stats',
  highlights: 'Highlights',
  playbook: 'Playbook',
  otro: 'Otro',
};

const ALCANCE_OPTIONS = [
  { value: 'categoria', label: 'Categoría' },
  { value: 'usuario', label: 'Atletas' },
];

function destinoLabel(item) {
  if (item.alcance === 'categoria') {
    const cat = item.targetCategoria;
    const name = typeof cat === 'object' ? cat?.nombre : null;
    return name ? `Categoría · ${name}` : 'Categoría';
  }
  const u = item.targetUsuario;
  if (u && typeof u === 'object') {
    const name = formatUserName(u);
    return name ? `Atleta · ${name}` : 'Atleta';
  }
  return 'Atleta';
}

export default function CoachResourceSendScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [composerOpen, setComposerOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [alcance, setAlcance] = useState('categoria');
  const [targetCategoria, setTargetCategoria] = useState('');
  const [targetUsuarioIds, setTargetUsuarioIds] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('tactico');
  const [userRol, setUserRol] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [pickedLabel, setPickedLabel] = useState('');
  const [attachKind, setAttachKind] = useState(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);
  const [historyTipo, setHistoryTipo] = useState('');
  const [historyCategoria, setHistoryCategoria] = useState('');
  const [historyFilter, setHistoryFilter] = useState(null);
  const [historySearchText, setHistorySearchText] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setHistorySearch(historySearchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [historySearchText]);

  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [refreshingHistory, setRefreshingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceData, setAudienceData] = useState(null);

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

  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: options.onCancel || closeAlert,
    });
  };

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const tipoOptions = useMemo(() => {
    if (userRol === 'nutricionista') return TIPO_CHIPS_NUTRI;
    if (userRol === 'psicologo') return TIPO_CHIPS_PSI;
    return TIPO_CHIPS_COACH;
  }, [userRol]);

  const defaultTipoForRol = (rol) => {
    if (rol === 'nutricionista') return 'nutricion';
    if (rol === 'psicologo') return 'estudio_medico';
    return 'tactico';
  };

  const resetForm = useCallback((rol = userRol) => {
    setEditingId(null);
    setTitulo('');
    setDescripcion('');
    setTipo(defaultTipoForRol(rol));
    setAlcance('categoria');
    setTargetUsuarioIds([]);
    setFileUrl('');
    setPickedLabel('');
    setAttachKind(null);
    setExternalUrl('');
  }, [userRol]);

  const loadHistory = useCallback(
    async ({ page = 1, append = false } = {}) => {
      if (!clubData?.urlIdentifier) return;
      if (page === 1) setLoadingHistory(true);
      try {
        const h = await headers();
        const params = { page, limit: 20 };
        if (historyTipo) params.tipo = historyTipo;
        if (historyCategoria) params.categoriaId = historyCategoria;
        if (historySearch) params.q = historySearch;
        const res = await clubApi.get('/resources', {
          headers: h,
          params,
        });
        const rows = pickPaginatedRows(res.data, 'resources');
        setHistory((prev) => (append ? [...prev, ...rows] : rows));
        setHistoryPage(page);
        const totalPages = Number(res.data?.totalPages) || 1;
        setHistoryHasMore(page < totalPages);
      } catch (e) {
        if (!append) setHistory([]);
        showAlert('Error', e.response?.data?.message || 'No se pudo cargar el historial.');
      } finally {
        setLoadingHistory(false);
        setRefreshingHistory(false);
        setLoadingMoreHistory(false);
      }
    },
    [clubData?.urlIdentifier, historyTipo, historyCategoria, historySearch],
  );

  const loadMeta = useCallback(async () => {
    try {
      const h = await headers();
      const rol = (await getToken('userRol')) || '';
      setUserRol(rol);
      if (!editingId) {
        setTipo(defaultTipoForRol(rol));
      }
      const res = await clubApi.get('/categories/mis-categorias', { headers: h });
      const cats = sortByNombre(res.data || []);
      setCategories(cats);
      if (cats[0]?._id && !editingId) {
        setTargetCategoria(cats[0]._id);
        const enr = await clubApi.get(`/enrollments/categoria/${cats[0]._id}`, { headers: h });
        setEnrollments(enr.data || []);
        setTargetUsuarioIds([]);
      }
    } catch (_) {
      showAlert('Error', 'No se pudieron cargar categorías.');
    }
  }, [clubData?.urlIdentifier, editingId]);

  useFocusEffect(
    useCallback(() => {
      loadMeta();
      loadHistory({ page: 1 });
    }, [loadMeta, loadHistory]),
  );

  const onRefreshHistory = () => {
    setRefreshingHistory(true);
    loadHistory({ page: 1 });
  };

  const loadMoreHistory = () => {
    if (loadingMoreHistory || !historyHasMore || loadingHistory) return;
    setLoadingMoreHistory(true);
    loadHistory({ page: historyPage + 1, append: true });
  };

  const refreshEnrollments = async (catId) => {
    try {
      const h = await headers();
      const enr = await clubApi.get(`/enrollments/categoria/${catId}`, { headers: h });
      const rows = enr.data || [];
      setEnrollments(rows);
      const validIds = new Set(
        rows.map((e) => e.atleta?._id).filter(Boolean).map((id) => String(id)),
      );
      setTargetUsuarioIds((prev) => prev.filter((id) => validIds.has(String(id))));
    } catch (_) {
      setEnrollments([]);
      setTargetUsuarioIds([]);
    }
  };

  const toggleAthlete = (athleteId) => {
    const id = String(athleteId);
    setTargetUsuarioIds((prev) =>
      prev.some((x) => String(x) === id) ? prev.filter((x) => String(x) !== id) : [...prev, id],
    );
  };

  const athleteOptions = useMemo(
    () =>
      enrollments
        .map((e) => e.atleta)
        .filter(Boolean)
        .map((a) => ({
          value: a._id,
          label: formatUserName(a) || 'Atleta',
        })),
    [enrollments],
  );

  const categoryOptions = useMemo(
    () => categoriesAsSectionedOptions(categories),
    [categories],
  );

  const athletePillLabel = useMemo(() => {
    if (!targetUsuarioIds.length) return null;
    if (targetUsuarioIds.length === 1) {
      const one = athleteOptions.find((o) => String(o.value) === String(targetUsuarioIds[0]));
      return one?.label || '1 atleta';
    }
    return `${targetUsuarioIds.length} atletas`;
  }, [targetUsuarioIds, athleteOptions]);

  const filterPillDefs = useMemo(() => {
    const pills = [
      {
        key: 'tipo',
        placeholder: 'Tipo',
        value: tipo,
        options: tipoOptions,
        onChange: setTipo,
        multi: false,
      },
    ];
    if (!editingId) {
      pills.push(
        {
          key: 'alcance',
          placeholder: 'Alcance',
          value: alcance,
          options: ALCANCE_OPTIONS,
          onChange: setAlcance,
          multi: false,
        },
        {
          key: 'categoria',
          placeholder: 'Categoría',
          value: targetCategoria,
          options: categoryOptions,
          displayLabel: categoryPillLabel(categories, targetCategoria, 'Categoría'),
          onChange: (catId) => {
            setTargetCategoria(catId);
            refreshEnrollments(catId);
          },
          multi: false,
        },
      );
      if (alcance === 'usuario') {
        pills.push({
          key: 'atleta',
          placeholder: 'Atletas',
          value: targetUsuarioIds.length ? targetUsuarioIds[0] : '',
          displayLabel: athletePillLabel,
          options: athleteOptions,
          onChange: toggleAthlete,
          multi: true,
          selectedIds: targetUsuarioIds,
        });
      }
    }
    return pills;
  }, [
    tipo,
    tipoOptions,
    alcance,
    targetCategoria,
    categoryOptions,
    categories,
    targetUsuarioIds,
    athleteOptions,
    athletePillLabel,
    editingId,
  ]);
  const activeFilterDef = filterPillDefs.find((f) => f.key === openFilter);

  const selectFileMode = () => {
    setAttachKind('file');
    setExternalUrl('');
  };

  const selectLinkMode = () => {
    setAttachKind('link');
    setFileUrl('');
    setPickedLabel('');
  };

  const uploadFile = async (uri, filename, mime, webFile) => {
    selectFileMode();
    setUploading(true);
    try {
      const { url } = await uploadFileToClub(clubData, uri, filename, mime, { webFile });
      setFileUrl(url);
      setPickedLabel(filename);
    } catch (e) {
      console.log(e);
      showAlert('Error', e.message || e.response?.data?.message || 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso', 'Necesitamos acceso a tus fotos para continuar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      ...iosCompatiblePhotoOptions(),
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type === 'video' || /\.(mp4|mov|webm|m4v|avi)$/i.test(asset.fileName || asset.uri || '')) {
      showAlert('Solo fotos', 'Por ahora no se pueden subir videos. Usá una foto, un PDF o un enlace externo.');
      return;
    }
    const { filename, mime } = imageFromPickerAsset(asset, asset.uri);
    await uploadFile(asset.uri, filename, mime, pickWebFile(asset, result));
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const doc = result.assets[0];
      const base = (doc.name || 'documento').trim() || 'documento';
      const name = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
      const mime = doc.mimeType || 'application/pdf';
      await uploadFile(doc.uri, name, mime, pickWebFile(doc, result));
    } catch (e) {
      console.log(e);
      showAlert('Error', e.message || 'No se pudo elegir o subir el PDF.');
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setTitulo(item.titulo || '');
    setDescripcion(item.descripcion || '');
    setTipo(item.tipo || defaultTipoForRol(userRol));
    setAlcance(item.alcance || 'categoria');
    if (item.targetCategoria) {
      const catId =
        typeof item.targetCategoria === 'object' ? item.targetCategoria._id : item.targetCategoria;
      if (catId) setTargetCategoria(String(catId));
    }
    if (item.targetUsuario) {
      const uid =
        typeof item.targetUsuario === 'object' ? item.targetUsuario._id : item.targetUsuario;
      if (uid) setTargetUsuarioIds([String(uid)]);
    }
    const kind = detectMediaKind(item.fileUrl);
    if (kind === 'youtube' || kind === 'link') {
      setAttachKind('link');
      setExternalUrl(item.fileUrl || '');
      setFileUrl('');
      setPickedLabel('');
    } else {
      setAttachKind('file');
      setFileUrl(item.fileUrl || '');
      setPickedLabel('');
      setExternalUrl('');
    }
    setComposerOpen(true);
  };

  const cancelEdit = () => {
    resetForm();
    if (categories[0]?._id) {
      setTargetCategoria(categories[0]._id);
      refreshEnrollments(categories[0]._id);
    }
  };

  const openNew = () => {
    resetForm();
    if (categories[0]?._id) {
      setTargetCategoria(categories[0]._id);
      refreshEnrollments(categories[0]._id);
    }
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setOpenFilter(null);
    setComposerOpen(false);
    cancelEdit();
  };

  const closeComposerOrFilter = () => {
    if (openFilter) {
      setOpenFilter(null);
      return;
    }
    closeComposer();
  };

  const openAudience = async (item) => {
    setAudienceOpen(true);
    setAudienceLoading(true);
    setAudienceData({ titulo: item.titulo, audiencia: [], vieron: 0, descargaron: 0, total: item.audiencia || 0 });
    try {
      const h = await headers();
      const { data } = await clubApi.get(`/resources/${item._id}/accesos`, { headers: h });
      setAudienceData(data);
    } catch (e) {
      setAudienceOpen(false);
      showAlert('Error', e.response?.data?.message || 'No se pudo ver quién lo abrió.');
    } finally {
      setAudienceLoading(false);
    }
  };

  const submit = async () => {
    const normalizedLink = attachKind === 'link' ? normalizeExternalLink(externalUrl) : null;
    const finalUrl = attachKind === 'link' ? normalizedLink : fileUrl;

    if (!titulo.trim() || !finalUrl) {
      showAlert('Falta algo', 'Título y archivo o enlace externo son obligatorios.');
      return;
    }
    if (attachKind === 'link' && !normalizedLink) {
      showAlert('Enlace inválido', 'Pegá un enlace http(s) válido (YouTube, Drive, web, etc.).');
      return;
    }
    if (!editingId) {
      if (alcance === 'categoria' && !targetCategoria) {
        showAlert('Atención', 'Elegí una categoría.');
        return;
      }
      if (alcance === 'usuario' && !targetUsuarioIds.length) {
        showAlert('Atención', 'Elegí al menos un atleta.');
        return;
      }
    }

    setSaving(true);
    try {
      const h = await headers();
      if (editingId) {
        await clubApi.put(
          `/resources/${editingId}`,
          {
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            fileUrl: finalUrl,
            tipo,
          },
          { headers: h },
        );
        showAlert('Listo', 'Material actualizado.');
      } else {
        await clubApi.post(
          '/resources',
          {
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            fileUrl: finalUrl,
            tipo,
            alcance,
            targetCategoria: alcance === 'categoria' ? targetCategoria : undefined,
            targetUsuarios: alcance === 'usuario' ? targetUsuarioIds : undefined,
          },
          { headers: h },
        );
        showAlert('Listo', 'Material enviado.');
      }
      resetForm();
      if (categories[0]?._id) {
        setTargetCategoria(categories[0]._id);
        refreshEnrollments(categories[0]._id);
      }
      await loadHistory({ page: 1 });
      setComposerOpen(false);
    } catch (e) {
      showAlert(
        'Error',
        e.response?.data?.message ||
          (editingId ? 'No se pudo actualizar el recurso.' : 'No se pudo publicar el recurso.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    showAlert('Eliminar material', `¿Eliminar «${item.titulo || 'este recurso'}»? No se puede deshacer.`, {
      showCancel: true,
      isDanger: true,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        closeAlert();
        setDeletingId(item._id);
        try {
          const h = await headers();
          await clubApi.delete(`/resources/${item._id}`, { headers: h });
          setHistory((prev) => prev.filter((r) => String(r._id) !== String(item._id)));
          if (String(editingId) === String(item._id)) cancelEdit();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }];

  const renderHistoryItem = ({ item }) => {
    const kind = detectMediaKind(item.fileUrl);
    const busy = String(deletingId) === String(item._id);
    const fecha = item.createdAt ? formatJsDateToDisplay(new Date(item.createdAt)) : '';

    return (
      <DesignCard theme={theme} isDarkMode={isDarkMode} accent={colorMarca} contentStyle={styles.histInner}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={async () => {
            if (!item.fileUrl) return;
            try {
              const kind = detectMediaKind(item.fileUrl);
              if (kind === 'pdf' || kind === 'image') {
                await downloadMediaFile(item.fileUrl, item.titulo);
              } else if (kind === 'youtube') {
                await openYouTubeExternal(item.fileUrl);
              } else {
                await openExternalLink(item.fileUrl);
              }
            } catch (e) {
              showAlert('Error', e.message || 'No se pudo abrir el archivo.');
            }
          }}
          activeOpacity={0.85}
        >
          <View style={styles.histTop}>
            <Ionicons name={mediaKindIcon(kind)} size={22} color={colorMarca} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.histTitle, { color: theme.text }]} numberOfLines={2}>
                {item.titulo}
              </Text>
              {item.descripcion ? (
                <Text style={[styles.histSub, { color: theme.textMuted }]} numberOfLines={2}>
                  {item.descripcion}
                </Text>
              ) : null}
              <Text style={[styles.histMeta, { color: theme.textMuted }]} numberOfLines={2}>
                {TIPO_LABELS[item.tipo] || item.tipo} · {destinoLabel(item)}
                {fecha ? ` · ${fecha}` : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.audienceBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={() => openAudience(item)}
          activeOpacity={0.85}
        >
          <Ionicons name="eye-outline" size={16} color={colorMarca} />
          <Text style={[styles.histBtnTxt, { color: theme.text }]}>
            {item.vieron || 0}/{item.audiencia || 0} vieron · {item.descargaron || 0} descargaron
          </Text>
        </TouchableOpacity>
        <View style={styles.histActions}>
          <TouchableOpacity
            style={[styles.histBtn, { borderColor: '#6b7280' }]}
            onPress={() => startEdit(item)}
            disabled={busy}
          >
            <Ionicons name="create-outline" size={16} color="#6b7280" />
            <Text style={[styles.histBtnTxt, { color: '#6b7280' }]}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.histBtn, { borderColor: '#ef4444', backgroundColor: '#ef4444' }]}
            onPress={() => confirmDelete(item)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={[styles.histBtnTxt, { color: '#fff' }]}>Eliminar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </DesignCard>
    );
  };

  const historyFilterOptions =
    historyFilter === 'categoria'
      ? [
          { value: '', label: 'Todas las categorías' },
          ...categories.map((cat) => ({ value: String(cat._id), label: cat.nombre })),
        ]
      : [{ value: '', label: 'Todos los tipos' }, ...tipoOptions];
  const historyFilterValue = historyFilter === 'categoria' ? historyCategoria : historyTipo;

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

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Material"
        title="Material multimedia"
        subtitle={clubData?.nombre || 'Tu club'}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.tabBody}>
        <FlatList
          data={history}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={styles.histList}
          renderItem={renderHistoryItem}
          refreshControl={
            <RefreshControl refreshing={refreshingHistory} onRefresh={onRefreshHistory} tintColor={colorMarca} />
          }
          onEndReached={loadMoreHistory}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View>
              <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Ionicons name="search-outline" size={18} color={theme.textMuted} />
                <TextInput
                  value={historySearchText}
                  onChangeText={setHistorySearchText}
                  placeholder="Buscar por título o descripción"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.searchInput, { color: theme.text }]}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {historySearchText ? (
                  <TouchableOpacity onPress={() => setHistorySearchText('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.filterPillsRow}>
                <TouchableOpacity
                  onPress={() => setHistoryFilter('tipo')}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: historyTipo ? colorMarca : theme.border,
                      backgroundColor: historyTipo ? `${colorMarca}18` : theme.surface,
                    },
                  ]}
                >
                  <Text
                    style={{ color: historyTipo ? colorMarca : theme.text, fontSize: 12, fontWeight: '600', flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {historyTipo ? TIPO_LABELS[historyTipo] || 'Tipo' : 'Tipo'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={historyTipo ? colorMarca : theme.textMuted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setHistoryFilter('categoria')}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: historyCategoria ? colorMarca : theme.border,
                      backgroundColor: historyCategoria ? `${colorMarca}18` : theme.surface,
                    },
                  ]}
                >
                  <Text
                    style={{ color: historyCategoria ? colorMarca : theme.text, fontSize: 12, fontWeight: '600', flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {historyCategoria
                      ? categories.find((cat) => String(cat._id) === String(historyCategoria))?.nombre || 'Categoría'
                      : 'Categoría'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={historyCategoria ? colorMarca : theme.textMuted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.histCount, { color: theme.textMuted }]}>
                {history.length} material{history.length === 1 ? '' : 'es'} enviado
                {history.length === 1 ? '' : 's'}
              </Text>
            </View>
          }
          ListEmptyComponent={
            loadingHistory ? (
              <ActivityIndicator color={colorMarca} style={{ marginTop: 28 }} />
            ) : (
              <Text style={[styles.emptyHist, { color: theme.textMuted }]}>
                {historyTipo || historyCategoria || historySearch
                  ? 'No hay material con estos filtros.'
                  : 'Todavía no enviaste material.'}
              </Text>
            )
          }
          ListFooterComponent={
            loadingMoreHistory ? (
              <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} />
            ) : null
          }
        />
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colorMarca }]}
        onPress={openNew}
        activeOpacity={0.9}
        accessibilityLabel="Nuevo material"
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <FormSheet
        visible={composerOpen}
        onClose={closeComposerOrFilter}
        title={
          openFilter
            ? activeFilterDef?.placeholder || 'Elegir'
            : editingId
              ? 'Editar material'
              : 'Nuevo material'
        }
        theme={theme}
        isDarkMode={isDarkMode}
      >
        {openFilter && activeFilterDef ? (
          <>
            {activeFilterDef.multi ? (
              <TouchableOpacity onPress={() => setOpenFilter(null)} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 15 }}>Listo</Text>
              </TouchableOpacity>
            ) : null}
            {activeFilterDef.multi && athleteOptions.length > 0 ? (
              <View style={styles.multiActions}>
                <TouchableOpacity
                  onPress={() => setTargetUsuarioIds(athleteOptions.map((o) => String(o.value)))}
                >
                  <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>Seleccionar todos</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTargetUsuarioIds([])}>
                  <Text style={{ color: theme.textMuted, fontWeight: '600', fontSize: 13 }}>Limpiar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {(activeFilterDef.options || []).length === 0 ? (
              <Text style={[styles.emptyOpts, { color: theme.textMuted }]}>
                No hay opciones disponibles.
              </Text>
            ) : (
              (activeFilterDef.options || []).map((item, index) => {
                if (item.type === 'header') {
                  return (
                    <View
                      key={`hdr-${index}`}
                      style={[styles.sectionHeader, { backgroundColor: theme.background }]}
                    >
                      <Text style={[styles.sectionHeaderTxt, { color: theme.textMuted }]}>
                        {item.label}
                      </Text>
                    </View>
                  );
                }
                const isMulti = !!activeFilterDef.multi;
                const selected = isMulti
                  ? (activeFilterDef.selectedIds || []).some((id) => String(id) === String(item.value))
                  : String(item.value) === String(activeFilterDef.value);
                return (
                  <TouchableOpacity
                    key={item.value !== undefined && item.value !== '' ? String(item.value) : `opt-${index}`}
                    style={[styles.filterOptionRow, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      activeFilterDef.onChange(item.value);
                      if (!isMulti) setOpenFilter(null);
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colorMarca : theme.text,
                        fontWeight: selected ? '700' : '500',
                        fontSize: 15,
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </Text>
                    {selected ? (
                      <Ionicons
                        name={isMulti ? 'checkbox' : 'checkmark'}
                        size={22}
                        color={colorMarca}
                      />
                    ) : isMulti ? (
                      <Ionicons name="square-outline" size={22} color={theme.textMuted} />
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : (
          <>
              <Text style={[styles.label, { color: theme.text }]}>Título</Text>
              <TextInput
                style={inputStyle}
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Ej. Material táctico rival"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.label, { color: theme.text }]}>Descripción</Text>
              <TextInput
                style={[inputStyle, { minHeight: 72 }]}
                multiline
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder=""
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.label, { color: theme.text }]}>
                {editingId ? 'Tipo' : 'Destino'}
              </Text>
              {editingId ? (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  El destino no se puede cambiar al editar. Podés actualizar título, tipo y archivo/enlace.
                </Text>
              ) : null}
              <View style={styles.filterPillsRow}>
                {filterPillDefs.map((f) => {
                  const selected = (f.options || []).find(
                    (o) => o.type !== 'header' && String(o.value) === String(f.value),
                  );
                  const hasValue = f.multi ? (f.selectedIds || []).length > 0 : f.value !== '';
                  const label = f.multi
                    ? f.displayLabel || f.placeholder
                    : hasValue
                      ? f.displayLabel || selected?.label || f.placeholder
                      : f.placeholder;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => setOpenFilter(f.key)}
                      style={[
                        styles.filterChip,
                        {
                          borderColor: hasValue ? colorMarca : theme.border,
                          backgroundColor: hasValue ? `${colorMarca}18` : theme.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: hasValue ? colorMarca : theme.text,
                          fontSize: 12,
                          fontWeight: '600',
                          flexShrink: 1,
                        }}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={hasValue ? colorMarca : theme.textMuted}
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!editingId ? (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  {alcance === 'categoria'
                    ? 'Va al chat grupal de la categoría. Si no está activo, se manda uno por uno (o al tutor).'
                    : 'Podés elegir varios atletas. Cada uno lo recibe en su chat (o el tutor si no tiene chat).'}
                </Text>
              ) : null}

              <Text style={[styles.label, { color: theme.text, marginTop: 8 }]}>Archivo adjunto</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                PDF, foto desde la galería, o un enlace externo (YouTube, Drive, web, etc.).
              </Text>
              {uploading ? (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator color={colorMarca} />
                  <Text style={[styles.uploadingText, { color: theme.textMuted }]}>Subiendo archivo…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.uploadRow}>
                    <TouchableOpacity
                      style={[
                        styles.uploadBtn,
                        {
                          borderColor: attachKind === 'file' && fileUrl ? colorMarca : theme.border,
                          backgroundColor: theme.surface,
                        },
                      ]}
                      onPress={pickPdf}
                    >
                      <Ionicons name="document-text-outline" size={26} color={colorMarca} />
                      <Text style={[styles.uploadBtnCaption, { color: theme.text }]}>Elegir PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.uploadBtn,
                        {
                          borderColor: attachKind === 'file' && fileUrl ? colorMarca : theme.border,
                          backgroundColor: theme.surface,
                        },
                      ]}
                      onPress={pickPhoto}
                    >
                      <Ionicons name="image-outline" size={26} color={colorMarca} />
                      <Text style={[styles.uploadBtnCaption, { color: theme.text }]}>Elegir foto</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.uploadBtn,
                      styles.uploadBtnWide,
                      {
                        borderColor: attachKind === 'link' ? colorMarca : theme.border,
                        backgroundColor: attachKind === 'link' ? colorMarca + '18' : theme.surface,
                      },
                    ]}
                    onPress={selectLinkMode}
                  >
                    <Ionicons name="link-outline" size={26} color={colorMarca} />
                    <Text style={[styles.uploadBtnCaption, { color: theme.text }]}>Enlace externo</Text>
                  </TouchableOpacity>
                </>
              )}
              {attachKind === 'link' ? (
                <TextInput
                  style={inputStyle}
                  value={externalUrl}
                  onChangeText={setExternalUrl}
                  placeholder="https://…"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              ) : null}
              {fileUrl ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }} numberOfLines={2}>
                  Archivo listo ✓{pickedLabel ? ` · ${pickedLabel}` : ''}
                </Text>
              ) : null}
              {attachKind === 'link' && normalizeExternalLink(externalUrl) ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }} numberOfLines={2}>
                  Enlace externo listo ✓
                </Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
                onPress={submit}
                disabled={saving || uploading}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>
                    {editingId ? 'Guardar cambios' : 'Enviar recurso'}
                  </Text>
                )}
              </TouchableOpacity>
          </>
        )}
      </FormSheet>

      <FormSheet
        visible={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        title="Quién lo vio"
        subtitle={audienceData?.titulo || ''}
        theme={theme}
        isDarkMode={isDarkMode}
      >
        {audienceLoading ? (
          <ActivityIndicator color={colorMarca} style={{ marginVertical: 24 }} />
        ) : (
          <>
            <Text style={[styles.histMeta, { color: theme.textMuted, marginBottom: 12 }]}>
              {audienceData?.vieron || 0}/{audienceData?.total || 0} vieron · {audienceData?.descargaron || 0} descargaron
            </Text>
            {(audienceData?.audiencia || []).length === 0 ? (
              <Text style={[styles.emptyHist, { color: theme.textMuted }]}>
                No hay atletas activos en este destino.
              </Text>
            ) : (
              (audienceData?.audiencia || []).map((person) => (
                <View key={String(person._id)} style={[styles.audienceRow, { borderColor: theme.border }]}>
                  <Text style={[styles.histTitle, { color: theme.text, fontSize: 15 }]}>
                    {formatUserName(person) || 'Atleta'}
                  </Text>
                  <Text style={[styles.histMeta, { color: person.vistoAt ? colorMarca : theme.textMuted }]}>
                    {person.vistoAt ? `Vio · ${formatJsDateToDisplay(new Date(person.vistoAt))}` : 'No lo vio'}
                  </Text>
                  <Text style={[styles.histMeta, { color: person.descargaAt ? colorMarca : theme.textMuted }]}>
                    {person.descargaAt ? `Descargó · ${formatJsDateToDisplay(new Date(person.descargaAt))}` : 'No descargó'}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </FormSheet>

      <FormSheet
        visible={!!historyFilter}
        onClose={() => setHistoryFilter(null)}
        title={historyFilter === 'categoria' ? 'Categoría' : 'Tipo'}
        theme={theme}
        isDarkMode={isDarkMode}
      >
        {historyFilterOptions.map((option) => {
          const selected = String(option.value) === String(historyFilterValue);
          return (
            <TouchableOpacity
              key={option.value || 'all'}
              style={[styles.filterOptionRow, { borderBottomColor: theme.border }]}
              onPress={() => {
                if (historyFilter === 'categoria') setHistoryCategoria(option.value);
                else setHistoryTipo(option.value);
                setHistoryFilter(null);
              }}
            >
              <Text
                style={{
                  color: selected ? colorMarca : theme.text,
                  fontWeight: selected ? '700' : '500',
                  fontSize: 15,
                  flex: 1,
                }}
              >
                {option.label}
              </Text>
              {selected ? <Ionicons name="checkmark" size={22} color={colorMarca} /> : null}
            </TouchableOpacity>
          );
        })}
      </FormSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabPillText: { fontSize: 12, fontWeight: '700' },
  tabBody: { flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  audienceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  audienceRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    gap: 2,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  editBannerTxt: { fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  filterPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    minWidth: 0,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterModalTitle: { fontSize: 17, fontWeight: '700' },
  multiActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionHeaderTxt: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyOpts: { padding: 20, textAlign: 'center', fontSize: 14 },
  uploadRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  uploadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    marginBottom: 8,
  },
  uploadingText: { marginTop: 10, fontSize: 13 },
  uploadBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    flex: 1,
    minHeight: 100,
  },
  uploadBtnCaption: { marginTop: 8, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  uploadBtnWide: { flex: undefined, width: '100%', minHeight: 88, marginBottom: 8 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  histList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96 },
  histCount: { fontSize: 12, fontWeight: '600', marginBottom: 10 },
  emptyHist: { textAlign: 'center', marginTop: 40, fontSize: 14, lineHeight: 20, paddingHorizontal: 12 },
  histInner: { paddingVertical: 4 },
  histTop: { flexDirection: 'row', alignItems: 'flex-start' },
  histTitle: { fontSize: 15, fontWeight: '800' },
  histSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  histMeta: { fontSize: 12, marginTop: 6 },
  histActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  histBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  histBtnTxt: { fontSize: 13, fontWeight: '700' },
});
