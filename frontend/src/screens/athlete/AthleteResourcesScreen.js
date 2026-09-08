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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { clubHeaders, memberScopeParams } from './athleteApi';
import { pickPaginatedRows } from '../../utils/paginatedApi';
import { detectMediaKind, openMediaViewer, downloadMediaFile, mediaKindIcon } from '../../utils/mediaUtils';
import MemberChildPicker from '../../components/MemberChildPicker';
import DesignCard from '../../components/DesignCard';
import { formatRolStaff, STAFF_ROL_FILTER_ORDER } from '../staff/staffUtils';
import { useBadges } from '../../context/BadgeContext';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const TIPO_LABELS = {
  rutina: 'Rutina',
  nutricion: 'Nutrición',
  estudio_medico: 'Estudio médico',
  tactico: 'Táctico',
  otro: 'Otro',
};

function authorRolKey(autor) {
  if (!autor || typeof autor === 'string') return 'unknown';
  return autor.rol || 'unknown';
}

function authorName(autor) {
  if (!autor || typeof autor === 'string') return 'Staff del club';
  return `${autor.nombre || ''} ${autor.apellido || ''}`.trim() || 'Staff';
}

export default function AthleteResourcesScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor, memberId } = useMember();
  const { markSeen, refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const resourcesCacheKey =
    clubData?.urlIdentifier && memberId
      ? `member-resources:${clubData.urlIdentifier}:${memberId}`
      : '';

  const [list, setList] = useState(() => readScreenCache(resourcesCacheKey) ?? []);
  const [resourcesPage, setResourcesPage] = useState(1);
  const [resourcesHasMore, setResourcesHasMore] = useState(false);
  const [loadingMoreResources, setLoadingMoreResources] = useState(false);
  const [selectedStaffRol, setSelectedStaffRol] = useState('');
  const [openFilter, setOpenFilter] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
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

  const fetchResources = useCallback(async () => {
    if (!clubData?.urlIdentifier || !memberId) return [];
    const h = await clubHeaders(clubData);
    const res = await clubApi.get('/resources/me', {
      headers: h,
      params: { ...memberScopeParams(isTutor, memberId), page: 1, limit: 30 },
    });
    const rows = pickPaginatedRows(res.data, 'resources');
    setResourcesPage(res.data?.page ?? 1);
    setResourcesHasMore(Boolean(res.data?.hasMore));
    return rows;
  }, [clubData?.urlIdentifier, memberId, isTutor]);

  const loadMoreResources = useCallback(async () => {
    if (loadingMoreResources || !resourcesHasMore) return;
    setLoadingMoreResources(true);
    try {
      const h = await clubHeaders(clubData);
      const nextPage = resourcesPage + 1;
      const res = await clubApi.get('/resources/me', {
        headers: h,
        params: { ...memberScopeParams(isTutor, memberId), page: nextPage, limit: 30 },
      });
      const rows = pickPaginatedRows(res.data, 'resources');
      setList((prev) => [...prev, ...rows]);
      setResourcesPage(res.data?.page ?? nextPage);
      setResourcesHasMore(Boolean(res.data?.hasMore));
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar más recursos.');
    } finally {
      setLoadingMoreResources(false);
    }
  }, [loadingMoreResources, resourcesHasMore, resourcesPage, clubData, memberId, isTutor]);

  const onResourcesFocus = useCallback(() => {
    (async () => {
      await markSeen({ resources: true });
      refresh();
    })();
  }, [markSeen, refresh]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: resourcesCacheKey,
    enabled: !!resourcesCacheKey && (!!memberId || !isTutor),
    fetchData: fetchResources,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los recursos.');
    },
    onFocus: onResourcesFocus,
  });

  const showInitialLoader = loading && list.length === 0;

  const staffRolOptions = useMemo(() => {
    const roles = new Set();
    for (const item of list) {
      const rol = authorRolKey(item.autor);
      if (rol !== 'unknown') roles.add(rol);
    }
    return Array.from(roles)
      .sort((a, b) => {
        const ia = STAFF_ROL_FILTER_ORDER.indexOf(a);
        const ib = STAFF_ROL_FILTER_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map((rol) => ({ id: rol, label: formatRolStaff(rol) }));
  }, [list]);

  useEffect(() => {
    if (!selectedStaffRol) return;
    const stillThere = staffRolOptions.some((s) => s.id === selectedStaffRol);
    if (!stillThere) setSelectedStaffRol('');
  }, [staffRolOptions, selectedStaffRol]);

  const filteredList = useMemo(() => {
    if (!selectedStaffRol) return list;
    return list.filter((item) => authorRolKey(item.autor) === selectedStaffRol);
  }, [list, selectedStaffRol]);

  const staffFilterOptions = useMemo(
    () => [{ value: '', label: 'Todas las áreas' }, ...staffRolOptions.map((s) => ({ value: s.id, label: s.label }))],
    [staffRolOptions],
  );

  const selectedStaffLabel = staffFilterOptions.find((o) => o.value === selectedStaffRol)?.label;

  const openResource = async (item) => {
    if (!item.fileUrl) {
      showAlert('Archivo', 'Este recurso no tiene un archivo adjunto.');
      return;
    }
    if (detectMediaKind(item.fileUrl) === 'pdf') return;
    try {
      await openMediaViewer(navigation, { url: item.fileUrl, title: item.titulo });
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo abrir el recurso.');
    }
  };

  const downloadPdf = async (item) => {
    if (!item.fileUrl) {
      showAlert('Archivo', 'Este recurso no tiene un archivo adjunto.');
      return;
    }
    setDownloadingId(item._id);
    try {
      await downloadMediaFile(item.fileUrl, item.titulo);
    } catch (e) {
      showAlert('Error', e.message || e.response?.data?.message || 'No se pudo descargar el PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const renderItem = ({ item }) => {
    const kind = detectMediaKind(item.fileUrl);
    const isPdf = kind === 'pdf';
    const tipoLabel = TIPO_LABELS[item.tipo] || item.tipo || 'Recurso';
    const busy = downloadingId === item._id;

    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={colorMarca}
        onPress={isPdf ? undefined : () => openResource(item)}
        contentStyle={styles.rowInner}
        muted={!item.fileUrl}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.titulo}
          </Text>
          {item.descripcion ? (
            <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={2}>
              {item.descripcion}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
            {tipoLabel} · {formatRolStaff(authorRolKey(item.autor))} · {authorName(item.autor)}
          </Text>
        </View>
        {isPdf ? (
          <TouchableOpacity
            style={[styles.downloadBtn, { borderColor: colorMarca, opacity: busy ? 0.65 : 1 }]}
            onPress={() => downloadPdf(item)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colorMarca} />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color={colorMarca} />
                <Text style={[styles.downloadBtnTxt, { color: colorMarca }]}>Descargar</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <Ionicons name={mediaKindIcon(kind)} size={22} color={theme.icon} />
        )}
      </DesignCard>
    );
  };

  const listHeader = staffRolOptions.length > 1 ? (
    <View style={styles.filterPillsRow}>
      <TouchableOpacity
        onPress={() => setOpenFilter(true)}
        style={[
          styles.filterChip,
          {
            borderColor: selectedStaffRol ? colorMarca : theme.border,
            backgroundColor: selectedStaffRol ? `${colorMarca}18` : theme.surface,
          },
        ]}
      >
        <Text
          style={{
            color: selectedStaffRol ? colorMarca : theme.text,
            fontSize: 12,
            fontWeight: '600',
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {selectedStaffRol ? selectedStaffLabel || 'Área' : 'Área del staff'}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={selectedStaffRol ? colorMarca : theme.textMuted}
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>
    </View>
  ) : null;

  const emptyMessage =
    list.length === 0
      ? 'Todavía no hay recursos para vos.'
      : 'No hay recursos de esta área. Probá con otro filtro.';

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
        kicker="Material"
        title="Recursos"
        subtitle={isTutor ? 'Material compartido con tu familiar' : 'Archivos que te compartieron para tu categoría o para vos'}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <Modal
        visible={openFilter}
        animationType="slide"
        transparent
        onRequestClose={() => setOpenFilter(false)}
      >
        <View style={styles.filterModalOverlay}>
          <View style={[styles.filterModalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.filterModalHeader}>
              <TouchableOpacity onPress={() => setOpenFilter(false)} hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
              <Text style={[styles.filterModalTitle, { color: theme.text }]}>Área del staff</Text>
              <View style={{ width: 26 }} />
            </View>
            <FlatList
              data={staffFilterOptions}
              keyExtractor={(item, index) => (item.value ? String(item.value) : `all-${index}`)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.value === selectedStaffRol;
                return (
                  <TouchableOpacity
                    style={[styles.filterOptionRow, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      setSelectedStaffRol(item.value);
                      setOpenFilter(false);
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
                    {selected ? <Ionicons name="checkmark" size={22} color={colorMarca} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} compact /> : null}

      {showInitialLoader ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colorMarca} />
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (!selectedStaffRol) loadMoreResources();
          }}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMoreResources ? <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} /> : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingTop: 8 },
  filterChip: {
    flex: 1,
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
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 4 },
  meta: { fontSize: 12, marginTop: 6 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  downloadBtnTxt: { fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22, paddingHorizontal: 16 },
});
