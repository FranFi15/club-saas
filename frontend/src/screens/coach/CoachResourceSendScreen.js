import React, { useContext, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { uploadFileToClub, pickWebFile } from '../../utils/uploadMedia';
import { isYouTubeUrl, normalizeYouTubeWatchUrl } from '../../utils/youtubeUrl';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { sortByNombre } from '../../utils/listSort';

const TIPO_CHIPS_COACH = [
  { value: 'tactico', label: 'Táctico' },
  { value: 'rutina', label: 'Rutina' },
  { value: 'otro', label: 'Otro' },
];

const TIPO_CHIPS_NUTRI = [
  { value: 'nutricion', label: 'Nutrición' },
  { value: 'otro', label: 'Otro' },
];

export default function CoachResourceSendScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [categories, setCategories] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [alcance, setAlcance] = useState('categoria');
  const [targetCategoria, setTargetCategoria] = useState('');
  const [targetUsuario, setTargetUsuario] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('tactico');
  const [userRol, setUserRol] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [pickedLabel, setPickedLabel] = useState('');
  const [attachKind, setAttachKind] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const loadMeta = useCallback(async () => {
    try {
      const h = await headers();
      const rol = (await getToken('userRol')) || '';
      setUserRol(rol);
      if (rol === 'nutricionista') {
        setTipo('nutricion');
      }
      const res = await clubApi.get('/categories/mis-categorias', { headers: h });
      const cats = res.data || [];
      setCategories(sortByNombre(cats));
      if (cats[0]?._id) {
        setTargetCategoria(cats[0]._id);
        const enr = await clubApi.get(`/enrollments/categoria/${cats[0]._id}`, { headers: h });
        setEnrollments(enr.data || []);
        const firstA = enr.data?.[0]?.atleta;
        if (firstA?._id) setTargetUsuario(firstA._id);
      }
    } catch (_) {
      showAlert('Error', 'No se pudieron cargar categorías.');
    }
  }, [clubData?.urlIdentifier]);

  useFocusEffect(
    useCallback(() => {
      loadMeta();
    }, [loadMeta]),
  );

  const refreshEnrollments = async (catId) => {
    try {
      const h = await headers();
      const enr = await clubApi.get(`/enrollments/categoria/${catId}`, { headers: h });
      setEnrollments(enr.data || []);
      const firstA = enr.data?.[0]?.atleta;
      setTargetUsuario(firstA?._id || '');
    } catch (_) {
      setEnrollments([]);
    }
  };

  const selectFileMode = () => {
    setAttachKind('file');
    setYoutubeUrl('');
  };

  const selectYoutubeMode = () => {
    setAttachKind('youtube');
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

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso', 'Necesitamos acceso a tus fotos para continuar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const rawName = asset.fileName || asset.uri.split('/').pop() || 'archivo';
    const isVideo = asset.type === 'video' || /\.(mp4|mov|webm)$/i.test(rawName);
    const mime = asset.mimeType || (isVideo ? 'video/mp4' : `image/${(rawName.split('.').pop() || 'jpeg').replace('jpg', 'jpeg')}`);
    await uploadFile(asset.uri, rawName, mime, pickWebFile(asset, result));
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

  const submit = async () => {
    const normalizedYoutube =
      attachKind === 'youtube' ? normalizeYouTubeWatchUrl(youtubeUrl.trim()) : null;
    const finalUrl = attachKind === 'youtube' ? normalizedYoutube : fileUrl;

    if (!titulo.trim() || !finalUrl) {
      showAlert('Falta algo', 'Título y archivo o enlace de YouTube son obligatorios.');
      return;
    }
    if (attachKind === 'youtube' && !isYouTubeUrl(youtubeUrl)) {
      showAlert('Enlace inválido', 'Pegá un enlace válido de YouTube (watch, youtu.be o shorts).');
      return;
    }
    if (alcance === 'categoria' && !targetCategoria) {
      showAlert('Atención', 'Elegí una categoría.');
      return;
    }
    if (alcance === 'usuario' && !targetUsuario) {
      showAlert('Atención', 'Elegí un atleta.');
      return;
    }
    setSaving(true);
    try {
      const h = await headers();
      await clubApi.post(
        '/resources',
        {
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          fileUrl: finalUrl,
          tipo,
          alcance,
          targetCategoria: alcance === 'categoria' ? targetCategoria : undefined,
          targetUsuario: alcance === 'usuario' ? targetUsuario : undefined,
        },
        { headers: h },
      );
      navigation.goBack();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo publicar el recurso.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }];

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
        title={userRol === 'nutricionista' ? 'Enviar PDF o material' : 'Enviar recurso'}
        subtitle="Se envía por chat (grupal o personal)"
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={[styles.label, { color: theme.text }]}>Título</Text>
        <TextInput style={inputStyle} value={titulo} onChangeText={setTitulo} placeholder="Ej. Video táctico rival" placeholderTextColor={theme.textMuted} />

        <Text style={[styles.label, { color: theme.text }]}>Descripción</Text>
        <TextInput
          style={[inputStyle, { minHeight: 72 }]}
          multiline
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Opcional"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.label, { color: theme.text }]}>Tipo de recurso</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(userRol === 'nutricionista' ? TIPO_CHIPS_NUTRI : TIPO_CHIPS_COACH).map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.chip,
                {
                  borderColor: tipo === value ? colorMarca : theme.border,
                  backgroundColor: tipo === value ? colorMarca + '22' : theme.surface,
                },
              ]}
              onPress={() => setTipo(value)}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Alcance</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          {[
            { v: 'categoria', l: 'Categoría' },
            { v: 'usuario', l: 'Un atleta' },
          ].map((x) => (
            <TouchableOpacity
              key={x.v}
              style={[
                styles.chip,
                { borderColor: alcance === x.v ? colorMarca : theme.border, backgroundColor: alcance === x.v ? colorMarca + '22' : theme.surface },
              ]}
              onPress={() => setAlcance(x.v)}
            >
              <Text style={{ color: theme.text, fontWeight: '700' }}>{x.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {alcance === 'categoria'
            ? 'Va al chat grupal de la categoría. Si no está activo, se manda uno por uno (o al tutor).'
            : 'Va al chat personal. Si el atleta no tiene chat habilitado, se envía al tutor.'}
        </Text>

        {alcance === 'categoria' ? (
          <>
            <Text style={[styles.label, { color: theme.text }]}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  style={[
                    styles.chip,
                    {
                      borderColor: targetCategoria === c._id ? colorMarca : theme.border,
                      backgroundColor: targetCategoria === c._id ? colorMarca + '22' : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    setTargetCategoria(c._id);
                    refreshEnrollments(c._id);
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: theme.text }]}>Atleta</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {enrollments.map((e) => {
                const a = e.atleta;
                if (!a) return null;
                return (
                  <TouchableOpacity
                    key={e._id}
                    style={[
                      styles.chip,
                      {
                        borderColor: targetUsuario === a._id ? colorMarca : theme.border,
                        backgroundColor: targetUsuario === a._id ? colorMarca + '22' : theme.surface,
                      },
                    ]}
                    onPress={() => setTargetUsuario(a._id)}
                  >
                    <Text style={{ color: theme.text, fontWeight: '600' }}>
                      {a.nombre} {a.apellido}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={[styles.label, { color: theme.text, marginTop: 8 }]}>Archivo adjunto</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          PDF, foto/video desde la galería, o un enlace de YouTube.
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
                onPress={pickMedia}
              >
                <Ionicons name="images-outline" size={26} color={colorMarca} />
                <Text style={[styles.uploadBtnCaption, { color: theme.text }]}>Foto o video</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                styles.uploadBtnWide,
                {
                  borderColor: attachKind === 'youtube' ? colorMarca : theme.border,
                  backgroundColor: attachKind === 'youtube' ? colorMarca + '18' : theme.surface,
                },
              ]}
              onPress={selectYoutubeMode}
            >
              <Ionicons name="logo-youtube" size={26} color="#c4302b" />
              <Text style={[styles.uploadBtnCaption, { color: theme.text }]}>Enlace de YouTube</Text>
            </TouchableOpacity>
          </>
        )}
        {attachKind === 'youtube' ? (
          <TextInput
            style={inputStyle}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="https://www.youtube.com/watch?v=..."
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
        {attachKind === 'youtube' && youtubeUrl.trim() && isYouTubeUrl(youtubeUrl) ? (
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }} numberOfLines={2}>
            Enlace de YouTube listo ✓
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
          onPress={submit}
          disabled={saving || uploading}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Enviar recurso</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 8, marginBottom: 8 },
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
});
