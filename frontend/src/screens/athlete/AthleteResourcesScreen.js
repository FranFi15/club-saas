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
  ScrollView,
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
  const [selectedStaffRol, setSelectedStaffRol] = useState(null);
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
    if (!stillThere) setSelectedStaffRol(null);
  }, [staffRolOptions, selectedStaffRol]);

  const filteredList = useMemo(() => {
    if (!selectedStaffRol) return list;
    return list.filter((item) => authorRolKey(item.autor) === selectedStaffRol);
  }, [list, selectedStaffRol]);

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
    const RowWrap = isPdf ? View : TouchableOpacity;
    const rowProps = isPdf
      ? { style: [styles.row, { backgroundColor: theme.surface, borderColor: theme.border }] }
      : {
          style: [styles.row, { backgroundColor: theme.surface, borderColor: theme.border }],
          onPress: () => openResource(item),
          activeOpacity: 0.85,
        };

    return (
      <RowWrap {...rowProps}>
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
      </RowWrap>
    );
  };

  const listHeader = staffRolOptions.length > 1 ? (
    <View style={styles.filterWrap}>
      <Text style={[styles.filterLabel, { color: theme.textMuted }]}>Área del staff</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        <TouchableOpacity
          style={[
            styles.chip,
            {
              borderColor: !selectedStaffRol ? colorMarca : theme.border,
              backgroundColor: !selectedStaffRol ? colorMarca : theme.surface,
            },
          ]}
          onPress={() => setSelectedStaffRol(null)}
        >
          <Text style={[styles.chipTxt, { color: !selectedStaffRol ? '#fff' : theme.text }]}>Todos</Text>
        </TouchableOpacity>
        {staffRolOptions.map((s) => {
          const active = selectedStaffRol === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.chip,
                {
                  borderColor: active ? colorMarca : theme.border,
                  backgroundColor: active ? colorMarca : theme.surface,
                },
              ]}
              onPress={() => setSelectedStaffRol(s.id)}
            >
              <Text style={[styles.chipTxt, { color: active ? '#fff' : theme.text }]} numberOfLines={1}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  filterWrap: { marginBottom: 12, paddingTop: 8 },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 2,
  },
  filterScroll: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipTxt: { fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
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
