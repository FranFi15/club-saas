import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { buildCancelSessionComunicado, motivoCancelacionValido } from '../../utils/cancelSessionComunicado';

export default function CoachCancelSessionScreen({ navigation, route }) {
  const sessionSnapshot = route.params?.session;
  const sessionId = route.params?.sessionId || sessionSnapshot?._id;

  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [session, setSession] = useState(sessionSnapshot || null);
  const [loading, setLoading] = useState(!sessionSnapshot);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      navigation.goBack();
      return;
    }
    if (sessionSnapshot) {
      const d = buildCancelSessionComunicado(sessionSnapshot);
      setTitulo(d.titulo);
      setContenido(d.contenido);
      setSession(sessionSnapshot);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const h = await clubHeaders(clubData);
        const res = await clubApi.get(`/sessions/${sessionId}`, { headers: h });
        setSession(res.data);
        const d = buildCancelSessionComunicado(res.data);
        setTitulo(d.titulo);
        setContenido(d.contenido);
      } catch (e) {
        setError(e.response?.data?.message || 'No se pudo cargar la sesión.');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, sessionSnapshot, clubData, navigation]);

  const handleSubmit = async () => {
    const t = titulo.trim();
    const c = contenido.trim();
    if (!t || !c) {
      setError('Completá el título y el mensaje del comunicado.');
      return;
    }
    if (!motivoCancelacionValido(c)) {
      setError('Escribí el motivo de la cancelación después de “Motivo:”.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const h = await clubHeaders(clubData);
      await clubApi.patch(
        `/sessions/${sessionId}/cancel`,
        {
          motivoCancelacion: c,
          comunicado: { titulo: t, contenido: c, tipo: 'urgente' },
        },
        { headers: h },
      );
      navigation.goBack();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo cancelar la sesión.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Comunicado"
        title="Cancelar sesión"
        subtitle="Avisá al plantel por qué se suspende"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Al confirmar se publica la novedad y la sesión queda cancelada. Si usaba un espacio del club, quedará
            disponible para alquiler.
          </Text>

          <Text style={[styles.label, { color: theme.textMuted }]}>Título</Text>
          <TextInput
            style={inputStyle}
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Título del comunicado"
            placeholderTextColor={theme.textMuted}
            editable={!saving}
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>Mensaje</Text>
          <TextInput
            style={[inputStyle, styles.textArea]}
            value={contenido}
            onChangeText={setContenido}
            placeholder="Motivo de la cancelación…"
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
            editable={!saving}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#ef4444' }, saving && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnTxt}>Cancelar sesión</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()} disabled={saving}>
            <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Volver</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  textArea: { minHeight: 160, paddingTop: 12 },
  error: { color: '#ef4444', marginBottom: 12, fontSize: 14 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
});
