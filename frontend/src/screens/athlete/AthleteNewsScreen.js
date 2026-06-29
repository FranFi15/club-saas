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
  Modal,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { clubHeaders } from './athleteApi';
import MemberChildPicker from '../../components/MemberChildPicker';
import { useBadges } from '../../context/BadgeContext';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function formatNewsDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function AthleteNewsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor } = useMember();
  const { markSeen, refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const newsCacheKey = clubData?.urlIdentifier ? `member-news:${clubData.urlIdentifier}` : '';

  const [list, setList] = useState(() => readScreenCache(newsCacheKey) ?? []);
  const [selected, setSelected] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
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

  const fetchNews = useCallback(async () => {
    if (!clubData?.urlIdentifier) return [];
    const h = await clubHeaders(clubData);
    const res = await clubApi.get('/news/feed', { headers: h });
    return res.data || [];
  }, [clubData?.urlIdentifier]);

  const onNewsFocus = useCallback(() => {
    (async () => {
      await markSeen({ news: true });
      refresh();
    })();
  }, [markSeen, refresh]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: newsCacheKey,
    enabled: !!newsCacheKey,
    fetchData: fetchNews,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las novedades.');
    },
    onFocus: onNewsFocus,
  });

  const showInitialLoader = loading && list.length === 0;

  const openFullscreen = (url, title) => {
    if (!url) return;
    setFullscreenImage({ url, title: title || 'Imagen' });
  };

  const renderItem = ({ item }) => {
    const imageUrl = item.imagen?.url;
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {imageUrl ? (
          <TouchableOpacity activeOpacity={0.9} onPress={() => openFullscreen(imageUrl, item.titulo)}>
            <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
            <View style={styles.cardImageBadge}>
              <Ionicons name="expand-outline" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.cardBody}
          onPress={() => setSelected(item)}
          activeOpacity={0.85}
        >
          <View style={styles.cardBodyRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                {item.titulo}
              </Text>
              <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={2}>
                {item.autor?.nombre} {item.autor?.apellido} · {formatNewsDate(item.createdAt)}
              </Text>
              {!imageUrl && item.contenido ? (
                <Text style={[styles.preview, { color: theme.textMuted }]} numberOfLines={2}>
                  {item.contenido}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.icon} />
          </View>
          {imageUrl && item.contenido ? (
            <Text style={[styles.preview, { color: theme.textMuted, marginTop: 8 }]} numberOfLines={2}>
              {item.contenido}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  };

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
        kicker={isTutor ? 'Comunicación' : 'Tu club'}
        title="Novedades"
        subtitle={
          isTutor
            ? 'Avisos del club y de tus familiares'
            : clubData?.nombre
              ? `Avisos de ${clubData.nombre} y tus categorías`
              : 'Avisos del club y de tus categorías'
        }
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} compact /> : null}

      {showInitialLoader ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colorMarca} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>Todavía no hay novedades para vos.</Text>
          }
        />
      )}

      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropPress} onPress={() => setSelected(null)} />
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalTitleBar, { backgroundColor: colorMarca }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={3}>
                  {selected?.titulo}
                </Text>
                <TouchableOpacity onPress={() => setSelected(null)} hitSlop={12}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalBodyWrap}>
              <Text style={[styles.modalMeta, { color: theme.textMuted }]}>
                {selected?.autor?.nombre} {selected?.autor?.apellido} · {formatNewsDate(selected?.createdAt)}
              </Text>
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selected?.imagen?.url ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => openFullscreen(selected.imagen.url, selected.titulo)}
                >
                  <Image source={{ uri: selected.imagen.url }} style={styles.modalImage} resizeMode="cover" />
                  <Text style={[styles.tapHint, { color: theme.textMuted }]}>Tocá la imagen para verla en pantalla completa</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={[styles.modalContent, { color: theme.text }]}>{selected?.contenido}</Text>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!fullscreenImage}
        animationType="fade"
        transparent
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenBackdrop}>
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenImage(null)} hitSlop={16}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {fullscreenImage?.url ? (
            <Image
              source={{ uri: fullscreenImage.url }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : null}
          {fullscreenImage?.title ? (
            <Text style={styles.fullscreenCaption} numberOfLines={2}>
              {fullscreenImage.title}
            </Text>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 148,
    backgroundColor: '#e5e7eb',
  },
  cardImageBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 6,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 72,
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 5 },
  preview: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  modalBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalTitleBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },
  modalBodyWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
  },
  modalMeta: { fontSize: 13, marginBottom: 12 },
  modalBody: { maxHeight: 400 },
  modalImage: { width: '100%', height: 260, borderRadius: 12, marginBottom: 8 },
  tapHint: { fontSize: 12, marginBottom: 12, textAlign: 'center' },
  modalContent: { fontSize: 16, lineHeight: 24, paddingBottom: 24 },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 48,
  },
  fullscreenClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '78%',
  },
  fullscreenCaption: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    opacity: 0.9,
  },
});
