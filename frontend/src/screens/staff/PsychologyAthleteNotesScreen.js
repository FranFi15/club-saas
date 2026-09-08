import React, { useCallback, useContext, useMemo, useState } from 'react';
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
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader, {
  CoachHeaderOverlayFab,
  CoachScreenHeaderWithFabs,
} from '../../components/CoachScreenHeader';
import { formatJsDateToDisplay } from '../../utils/dateDisplay';
import { clearScreenCache, readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function PsychologyAthleteNotesScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const atletaId = route?.params?.atletaId;
  const atletaNombre = route?.params?.atletaNombre || 'Atleta';
  const cacheKey =
    clubData?.urlIdentifier && atletaId
      ? `psi-athlete-notes:${clubData.urlIdentifier}:${atletaId}`
      : '';

  const [payload, setPayload] = useState(() => readScreenCache(cacheKey) ?? { sessions: [], notas: [] });
  const [composerOpen, setComposerOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [visAtleta, setVisAtleta] = useState(false);
  const [visTutor, setVisTutor] = useState(false);
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

  const fetchNotes = useCallback(async () => {
    if (!atletaId || !clubData?.urlIdentifier) return { sessions: [], notas: [] };
    const h = await headers();
    const { data } = await clubApi.get(`/sessions/psicologo/atleta/${atletaId}/notas`, { headers: h });
    return {
      sessions: Array.isArray(data?.sessions) ? data.sessions : [],
      notas: Array.isArray(data?.notas) ? data.notas : [],
    };
  }, [atletaId, clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchNotes,
    onFetched: setPayload,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el historial.');
      setPayload({ sessions: [], notas: [] });
    },
  });

  const timeline = useMemo(() => {
    const sessionItems = (payload.sessions || [])
      .filter((s) => (s.informeSesion || '').trim())
      .map((s) => ({
        id: `session-${s._id}`,
        kind: 'session',
        date: s.fecha ? new Date(s.fecha).getTime() : 0,
        session: s,
      }));
    const noteItems = (payload.notas || []).map((n) => ({
      id: `note-${n._id}`,
      kind: 'note',
      date: n.fecha ? new Date(n.fecha).getTime() : new Date(n.createdAt || 0).getTime(),
      note: n,
    }));
    return [...sessionItems, ...noteItems].sort((a, b) => b.date - a.date);
  }, [payload]);

  const showInitialLoader = loading && timeline.length === 0 && !(payload.sessions || []).length;

  const openComposer = () => {
    setTitulo('');
    setContenido('');
    setVisAtleta(false);
    setVisTutor(false);
    setComposerOpen(true);
  };

  const saveNote = async () => {
    if (!titulo.trim() || !contenido.trim()) {
      showAlert('Falta algo', 'Completá título y el texto de la nota.');
      return;
    }
    setSaving(true);
    try {
      const h = await headers();
      await clubApi.post(
        '/performance/clinical-notes',
        {
          atleta: atletaId,
          titulo: titulo.trim(),
          contenidoRichText: contenido.trim(),
          visibleParaAtleta: visAtleta,
          visibleParaTutor: visTutor,
        },
        { headers: h },
      );
      setComposerOpen(false);
      if (cacheKey) clearScreenCache(cacheKey);
      await onRefresh();
      showAlert('Listo', 'Nota guardada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar la nota.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => {
    if (item.kind === 'note') {
      const n = item.note;
      const body = stripHtml(n.contenidoRichText);
      return (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardTop}>
            <View style={[styles.badge, { backgroundColor: '#6366f118', borderColor: '#6366f1' }]}>
              <Text style={[styles.badgeTxt, { color: '#6366f1' }]}>Nota libre</Text>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {n.fecha ? formatJsDateToDisplay(new Date(n.fecha)) : '—'}
            </Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{n.titulo || 'Nota'}</Text>
          <Text style={[styles.note, { color: theme.text }]}>{body}</Text>
          <Text style={[styles.vis, { color: theme.textMuted }]}>
            Visible atleta: {n.visibleParaAtleta ? 'Sí' : 'No'} · Tutor: {n.visibleParaTutor ? 'Sí' : 'No'}
          </Text>
        </View>
      );
    }

    const s = item.session;
    const fechaLbl = s.fecha ? formatJsDateToDisplay(new Date(s.fecha)) : '—';
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => navigation.navigate('CoachSessionDetail', { sessionId: s._id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: '#6366f118', borderColor: '#6366f1' }]}>
            <Text style={[styles.badgeTxt, { color: '#6366f1' }]}>Sesión</Text>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{fechaLbl}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.icon} style={{ marginLeft: 'auto' }} />
        </View>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {s.categoria?.nombre || 'Consulta'}
          {s.horaInicio ? ` · ${s.horaInicio}${s.horaFin ? `–${s.horaFin}` : ''}` : ''}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          Qué pasó en la sesión
          {s.estado === 'completada' ? ' · Realizada' : ' · Programada'}
        </Text>
        <Text style={[styles.note, { color: theme.text }]} numberOfLines={8}>
          {s.informeSesion}
        </Text>
        <Text style={[styles.vis, { color: theme.textMuted }]}>
          Visible atleta: {s.informeVisibleParaAtleta === false ? 'No' : 'Sí'} · Tutor:{' '}
          {s.informeVisibleParaTutor === false ? 'No' : 'Sí'}
        </Text>
      </TouchableOpacity>
    );
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <CoachScreenHeaderWithFabs
        fabChildren={
          <CoachHeaderOverlayFab
            colorMarca={colorMarca}
            icon="add"
            accessibilityLabel="Nueva nota"
            onPress={openComposer}
          />
        }
      >
        <CoachScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          kicker="Psicología"
          title="Notas"
          subtitle={atletaNombre}
          onBack={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}
        />
      </CoachScreenHeaderWithFabs>

      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Acá ves las notas de “Qué pasó en la sesión” y las notas libres que creés desde este atleta.
      </Text>

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={timeline}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              Todavía no hay notas. Tocá + para crear una, o cargá “Qué pasó en la sesión” al cerrar una consulta.
            </Text>
          }
        />
      )}

      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nueva nota</Text>
              <TouchableOpacity onPress={() => setComposerOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.icon} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Título</Text>
              <TextInput
                style={inputStyle}
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Ej. Seguimiento semanal"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.label, { color: theme.textMuted }]}>Nota</Text>
              <TextInput
                style={[inputStyle, { minHeight: 140, textAlignVertical: 'top' }]}
                value={contenido}
                onChangeText={setContenido}
                placeholder="Evolución, acuerdos, observaciones…"
                placeholderTextColor={theme.textMuted}
                multiline
              />
              <View style={[styles.switchRow, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text, flex: 1 }}>Visible para el atleta</Text>
                <Switch value={visAtleta} onValueChange={setVisAtleta} trackColor={{ true: `${colorMarca}88` }} />
              </View>
              <View style={[styles.switchRow, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text, flex: 1 }}>Visible para el tutor</Text>
                <Switch value={visTutor} onValueChange={setVisTutor} trackColor={{ true: `${colorMarca}88` }} />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
                onPress={saveNote}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnTxt}>Guardar nota</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  hint: { fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 3, marginBottom: 6 },
  note: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  vis: { fontSize: 11, marginTop: 10 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22, paddingHorizontal: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '88%',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
