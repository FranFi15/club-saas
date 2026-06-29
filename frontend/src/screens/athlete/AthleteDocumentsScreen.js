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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { clubHeaders, memberScopeParams } from './athleteApi';
import { detectMediaKind, openMediaViewer, downloadMediaFile } from '../../utils/mediaUtils';
import { uploadFileToClub, pickWebFile } from '../../utils/uploadMedia';
import MemberChildPicker from '../../components/MemberChildPicker';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function estadoEntrega(miEntrega) {
  if (!miEntrega) return { label: 'Pendiente de subir', color: '#f59e0b' };
  if (miEntrega.estado === 'aprobado') return { label: 'Aprobado', color: '#22c55e' };
  if (miEntrega.estado === 'rechazado') return { label: 'Rechazado', color: '#ef4444' };
  if (miEntrega.estado === 'revision') return { label: 'En revisión', color: '#3b82f6' };
  return { label: miEntrega.estado || 'Enviado', color: '#6b7280' };
}

export default function AthleteDocumentsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor, memberId } = useMember();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const documentsCacheKey =
    clubData?.urlIdentifier && memberId
      ? `member-documents:${clubData.urlIdentifier}:${memberId}`
      : '';

  const [list, setList] = useState(() => readScreenCache(documentsCacheKey) ?? []);
  const [uploadingId, setUploadingId] = useState(null);
  const [downloadingViewId, setDownloadingViewId] = useState(null);
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

  const fetchDocuments = useCallback(async () => {
    if (!clubData?.urlIdentifier || !memberId) return [];
    const h = await clubHeaders(clubData);
    const res = await clubApi.get('/requirements/me', {
      headers: h,
      params: memberScopeParams(isTutor, memberId),
    });
    return res.data || [];
  }, [clubData?.urlIdentifier, memberId, isTutor]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: documentsCacheKey,
    enabled: !!documentsCacheKey && (!!memberId || !isTutor),
    fetchData: fetchDocuments,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los requerimientos.');
    },
  });

  const showInitialLoader = loading && list.length === 0;

  const submitForRequirement = async (requirementId, fileUrl) => {
    const h = await clubHeaders(clubData);
    const body = { requirementId, fileUrl };
    if (isTutor && memberId) body.atletaId = memberId;
    await clubApi.post('/requirements/submit', body, {
      headers: { ...h, 'Content-Type': 'application/json' },
    });
  };

  const handlePickFor = async (reqItem) => {
    setUploadingId(reqItem._id);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const doc = result.assets[0];
      const name = doc.name || 'documento.pdf';
      const mime = doc.mimeType || 'application/pdf';
      const { url } = await uploadFileToClub(clubData, doc.uri, name, mime, {
        webFile: pickWebFile(doc, result),
      });
      await submitForRequirement(reqItem._id, url);
      showAlert('Listo', 'Tu archivo fue enviado y está en revisión.');
      reload({ background: true });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo subir el archivo.');
    } finally {
      setUploadingId(null);
    }
  };

  const handlePhotoFor = async (reqItem) => {
    setUploadingId(reqItem._id);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permiso', 'Se necesita acceso a la galería.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.fileName || 'foto.jpg';
      const mime = asset.mimeType || 'image/jpeg';
      const { url } = await uploadFileToClub(clubData, asset.uri, name, mime, {
        webFile: pickWebFile(asset, result),
      });
      await submitForRequirement(reqItem._id, url);
      showAlert('Listo', 'Tu archivo fue enviado y está en revisión.');
      reload({ background: true });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingId(null);
    }
  };

  const renderItem = ({ item }) => {
    const st = estadoEntrega(item.miEntrega);
    const busy = uploadingId === item._id;
    const canUpload =
      !item.miEntrega ||
      item.miEntrega.estado === 'rechazado' ||
      item.miEntrega.estado === 'revision';

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{item.titulo}</Text>
          <View style={[styles.badge, { backgroundColor: `${st.color}22` }]}>
            <Text style={[styles.badgeTxt, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        {item.descripcion ? (
          <Text style={[styles.desc, { color: theme.textMuted }]}>{item.descripcion}</Text>
        ) : null}
        {item.miEntrega?.estado === 'rechazado' && item.miEntrega?.motivoRechazo ? (
          <Text style={[styles.reject, { color: '#ef4444' }]}>Motivo: {item.miEntrega.motivoRechazo}</Text>
        ) : null}
        {item.obligatorio ? (
          <Text style={[styles.oblig, { color: theme.textMuted }]}>Obligatorio</Text>
        ) : null}
        {item.miEntrega?.fileUrl ? (() => {
          const isPdf = detectMediaKind(item.miEntrega.fileUrl) === 'pdf';
          const viewBusy = downloadingViewId === item._id;
          return (
            <TouchableOpacity
              style={[styles.viewBtn, { borderColor: colorMarca, opacity: viewBusy ? 0.65 : 1 }]}
              onPress={async () => {
                if (isPdf) {
                  setDownloadingViewId(item._id);
                  try {
                    await downloadMediaFile(item.miEntrega.fileUrl, item.titulo);
                  } catch (e) {
                    showAlert('Error', e.message || 'No se pudo descargar el PDF.');
                  } finally {
                    setDownloadingViewId(null);
                  }
                  return;
                }
                try {
                  await openMediaViewer(navigation, {
                    url: item.miEntrega.fileUrl,
                    title: item.titulo,
                  });
                } catch (e) {
                  showAlert('Error', e.message || 'No se pudo abrir el recurso.');
                }
              }}
              disabled={viewBusy}
            >
              {viewBusy ? (
                <ActivityIndicator size="small" color={colorMarca} />
              ) : (
                <>
                  <Ionicons
                    name={isPdf ? 'download-outline' : 'eye-outline'}
                    size={18}
                    color={colorMarca}
                  />
                  <Text style={[styles.viewBtnTxt, { color: colorMarca }]}>
                    {isPdf ? 'Descargar PDF' : 'Ver archivo enviado'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          );
        })() : null}
        {canUpload ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}
              onPress={() => handlePickFor(item)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colorMarca} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={colorMarca} />
                  <Text style={[styles.btnTxt, { color: theme.text }]}>PDF / archivo</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}
              onPress={() => handlePhotoFor(item)}
              disabled={busy}
            >
              <Ionicons name="image-outline" size={18} color={colorMarca} />
              <Text style={[styles.btnTxt, { color: theme.text }]}>Foto</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.sent, { color: theme.textMuted }]}>
            Este requerimiento ya fue aprobado. Si necesitás cambiar el archivo, pedí ayuda en el club.
          </Text>
        )}
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
        kicker="Trámites"
        title="Documentación"
        subtitle={isTutor ? 'Pedidos del club para tu familiar' : 'Lo que el club o el cuerpo técnico te pidió subir'}
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
            <Text style={[styles.empty, { color: theme.textMuted }]}>No tenés documentos pendientes.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
  desc: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  reject: { fontSize: 13, marginTop: 8 },
  oblig: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  viewBtnTxt: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  btnTxt: { fontSize: 14, fontWeight: '600' },
  sent: { fontSize: 13, marginTop: 12 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
});
