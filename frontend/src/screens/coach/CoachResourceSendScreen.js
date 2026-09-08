import React, { useContext, useState, useCallback, useMemo } from 'react';
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
  Modal,
  FlatList,
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
import { normalizeYouTubeWatchUrl } from '../../utils/youtubeUrl';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { sortByNombre } from '../../utils/listSort';
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

const ALCANCE_OPTIONS = [
  { value: 'categoria', label: 'Categoría' },
  { value: 'usuario', label: 'Atletas' },
];

export default function CoachResourceSendScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

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
  const [openFilter, setOpenFilter] = useState(null);
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

  const tipoOptions = useMemo(() => {
    if (userRol === 'nutricionista') return TIPO_CHIPS_NUTRI;
    if (userRol === 'psicologo') return TIPO_CHIPS_PSI;
    return TIPO_CHIPS_COACH;
  }, [userRol]);

  const loadMeta = useCallback(async () => {
    try {
      const h = await headers();
      const rol = (await getToken('userRol')) || '';
      setUserRol(rol);
      if (rol === 'nutricionista') {
        setTipo('nutricion');
      } else if (rol === 'psicologo') {
        setTipo('estudio_medico');
      }
      const res = await clubApi.get('/categories/mis-categorias', { headers: h });
      const cats = sortByNombre(res.data || []);
      setCategories(cats);
      if (cats[0]?._id) {
        setTargetCategoria(cats[0]._id);
        const enr = await clubApi.get(`/enrollments/categoria/${cats[0]._id}`, { headers: h });
        setEnrollments(enr.data || []);
        setTargetUsuarioIds([]);
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
          label: `${a.nombre || ''} ${a.apellido || ''}`.trim() || 'Atleta',
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
    ];
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
    return pills;
  }, [
    tipo,
    tipoOptions,
    alcance,
    targetCategoria,
    categoryOptions,
    targetUsuarioIds,
    athleteOptions,
    athletePillLabel,
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
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type === 'video' || /\.(mp4|mov|webm|m4v|avi)$/i.test(asset.fileName || asset.uri || '')) {
      showAlert('Solo fotos', 'Por ahora no se pueden subir videos. Usá una foto, un PDF o un enlace externo.');
      return;
    }
    const rawName = asset.fileName || asset.uri.split('/').pop() || 'foto.jpg';
    const ext = (rawName.split('.').pop() || 'jpeg').toLowerCase().replace('jpg', 'jpeg');
    const mime = asset.mimeType || `image/${ext}`;
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
    if (alcance === 'categoria' && !targetCategoria) {
      showAlert('Atención', 'Elegí una categoría.');
      return;
    }
    if (alcance === 'usuario' && !targetUsuarioIds.length) {
      showAlert('Atención', 'Elegí al menos un atleta.');
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
          targetUsuarios: alcance === 'usuario' ? targetUsuarioIds : undefined,
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
        title={'Enviar recurso'}
        subtitle={clubData?.nombre || 'Tu club'}
        onBack={() => navigation.goBack()}
      />

      <Modal
        visible={!!openFilter}
        animationType="slide"
        transparent
        onRequestClose={() => setOpenFilter(null)}
      >
        <View style={styles.filterModalOverlay}>
          <View style={[styles.filterModalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.filterModalHeader}>
              <TouchableOpacity onPress={() => setOpenFilter(null)} hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
              <Text style={[styles.filterModalTitle, { color: theme.text }]}>
                {activeFilterDef?.placeholder || 'Elegir'}
              </Text>
              {activeFilterDef?.multi ? (
                <TouchableOpacity onPress={() => setOpenFilter(null)} hitSlop={8}>
                  <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 15 }}>Listo</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 26 }} />
              )}
            </View>
            {activeFilterDef?.multi && athleteOptions.length > 0 ? (
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
            <FlatList
              data={activeFilterDef?.options || []}
              keyExtractor={(item, index) =>
                item.value !== undefined && item.value !== '' ? String(item.value) : `opt-${index}`
              }
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.emptyOpts, { color: theme.textMuted }]}>
                  No hay opciones disponibles.
                </Text>
              }
              renderItem={({ item }) => {
                if (item.type === 'header') {
                  return (
                    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                      <Text style={[styles.sectionHeaderTxt, { color: theme.textMuted }]}>
                        {item.label}
                      </Text>
                    </View>
                  );
                }
                const isMulti = !!activeFilterDef?.multi;
                const selected = isMulti
                  ? (activeFilterDef.selectedIds || []).some((id) => String(id) === String(item.value))
                  : String(item.value) === String(activeFilterDef?.value);
                return (
                  <TouchableOpacity
                    style={[styles.filterOptionRow, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      activeFilterDef?.onChange(item.value);
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
              }}
            />
          </View>
        </View>
      </Modal>

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
            placeholder="Opcional"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.text }]}>Destino</Text>
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
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {alcance === 'categoria'
              ? 'Va al chat grupal de la categoría. Si no está activo, se manda uno por uno (o al tutor).'
              : 'Podés elegir varios atletas. Cada uno lo recibe en su chat (o el tutor si no tiene chat).'}
          </Text>

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
});
