import React, { useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { detectMediaKind, mediaKindLabel, openYouTubeExternal } from '../../utils/mediaUtils';

function VideoPlayerBlock({ url }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
}

export default function MemberMediaViewerScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const url = route.params?.url;
  const title = route.params?.title || 'Archivo';
  const kind = route.params?.kind || detectMediaKind(url);

  useEffect(() => {
    if (kind !== 'youtube' || !url) return;
    (async () => {
      try {
        await openYouTubeExternal(url);
      } catch (_) {
        /* ignore */
      }
      navigation.goBack();
    })();
  }, [kind, url, navigation]);

  const openExternal = () => {
    if (url) Linking.openURL(url);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker={mediaKindLabel(kind)}
        title={title}
        subtitle=""
        onBack={() => navigation.goBack()}
      />

      {!url ? (
        <View style={styles.centered}>
          <Text style={{ color: theme.textMuted }}>No hay archivo para mostrar.</Text>
        </View>
      ) : kind === 'youtube' ? (
        <View style={styles.centered}>
          <Ionicons name="logo-youtube" size={48} color="#c4302b" />
          <Text style={[styles.hint, { color: theme.textMuted }]}>Abriendo en YouTube…</Text>
        </View>
      ) : kind === 'image' ? (
        <View style={styles.mediaWrap}>
          <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
        </View>
      ) : kind === 'video' ? (
        <View style={styles.mediaWrap}>
          <VideoPlayerBlock url={url} />
        </View>
      ) : (
        <View style={styles.centered}>
          <Ionicons name="document-outline" size={48} color={theme.icon} />
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            No podemos previsualizar este formato en la app.
          </Text>
          <TouchableOpacity style={[styles.openBtn, { backgroundColor: colorMarca }]} onPress={openExternal}>
            <Text style={styles.openBtnTxt}>Abrir archivo</Text>
          </TouchableOpacity>
        </View>
      )}

      {url && (kind === 'image' || kind === 'video') ? (
        <TouchableOpacity style={[styles.footerBtn, { borderColor: theme.border }]} onPress={openExternal}>
          <Ionicons name="open-outline" size={18} color={theme.text} />
          <Text style={[styles.footerBtnTxt, { color: theme.text }]}>Abrir fuera de la app</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  mediaWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  image: { width: '100%', height: '100%', minHeight: 280 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  hint: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
  openBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  openBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  footerBtnTxt: { fontSize: 14, fontWeight: '600' },
});
