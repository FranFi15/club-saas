import React, { useContext, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import WellnessMetricsChart from '../../components/WellnessMetricsChart';
import WellnessScalePicker from '../../components/WellnessScalePicker';
import { seriesFromHistorial } from '../../utils/wellnessHistorial';
import { WELLNESS_PRE_FIELDS } from '../../constants/wellnessMetrics';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const CHART_W = Math.min(Dimensions.get('window').width - 32, 400);

const emptyPre = () =>
  Object.fromEntries(WELLNESS_PRE_FIELDS.map((f) => [f.key, 7]));

function preFromRecord(w) {
  if (!w) return emptyPre();
  return Object.fromEntries(
    WELLNESS_PRE_FIELDS.map((f) => [f.key, w[f.key] != null ? Number(w[f.key]) : 7]),
  );
}

export default function CoachWellnessScreen({ navigation, route }) {
  const { atletaId, atletaNombre, sesion, categoriaId, defaultTipo, tutorAtletaId } = route.params || {};
  const targetAtletaId = atletaId || tutorAtletaId;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const historialCacheKey =
    clubData?.urlIdentifier && targetAtletaId
      ? `coach-wellness-historial:${clubData.urlIdentifier}:${targetAtletaId}:${categoriaId || 'all'}`
      : '';

  const canPost = !!sesion;
  const [tipo, setTipo] = useState(defaultTipo === 'post' && canPost ? 'post' : 'pre');
  const [pre, setPre] = useState(emptyPre);
  const [rpe, setRpe] = useState(7);
  const [saving, setSaving] = useState(false);
  const [historialSeries, setHistorialSeries] = useState(
    () => readScreenCache(historialCacheKey)?.historialSeries ?? [],
  );
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

  const fetchHistorial = useCallback(async () => {
    if (!targetAtletaId) return { historialSeries: [] };
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const qs = categoriaId ? `?dias=30&categoriaId=${categoriaId}` : '?dias=30';
    const res = await clubApi.get(`/wellness/atleta/${targetAtletaId}/historial${qs}`, { headers: h });
    return { historialSeries: seriesFromHistorial(res.data) };
  }, [targetAtletaId, categoriaId, clubData?.urlIdentifier]);

  const applyHistorial = useCallback((data) => {
    setHistorialSeries(data.historialSeries ?? []);
  }, []);

  const { loading: histLoading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: historialCacheKey,
    enabled: !!historialCacheKey,
    fetchData: fetchHistorial,
    onFetched: applyHistorial,
  });

  const showHistorialLoader = histLoading && historialSeries.length === 0;

  const loadTodayPre = useCallback(async () => {
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      if (targetAtletaId && categoriaId) {
        const res = await clubApi.get(`/wellness/equipo/${categoriaId}`, { headers: h });
        const w = (res.data || []).find(
          (row) =>
            row.tipo === 'pre' && String(row.atleta?._id || row.atleta) === String(targetAtletaId),
        );
        if (w) setPre(preFromRecord(w));
      } else {
        const qs = tutorAtletaId ? `?atletaId=${tutorAtletaId}` : '';
        const res = await clubApi.get(`/wellness/mi-hoy${qs}`, { headers: h });
        if (res.data?.pre) setPre(preFromRecord(res.data.pre));
      }
    } catch {
      /* sin bloquear */
    }
  }, [targetAtletaId, categoriaId, tutorAtletaId, clubData?.urlIdentifier]);

  useEffect(() => {
    loadTodayPre();
  }, [loadTodayPre]);

  useEffect(() => {
    if (tipo === 'post' && !canPost) setTipo('pre');
  }, [canPost, tipo]);

  const setPreField = (key, value) => {
    setPre((p) => ({ ...p, [key]: value }));
  };

  const submit = async () => {
    if (tipo === 'post' && !sesion) {
      showAlert('Sin sesión', 'El RPE solo se carga cuando hay entrenamiento o partido ese día.');
      return;
    }
    setSaving(true);
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      const body = { tipo };
      if (tipo === 'post') body.sesion = sesion;
      else if (sesion) body.sesion = sesion;

      if (targetAtletaId) body.atletaId = targetAtletaId;
      else if (tutorAtletaId) body.atletaId = tutorAtletaId;

      if (tipo === 'pre') {
        WELLNESS_PRE_FIELDS.forEach((f) => {
          body[f.key] = pre[f.key];
        });
      } else {
        body.rpe = rpe;
      }
      await clubApi.post('/wellness', body, { headers: h });
      navigation.goBack();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const formTitle = atletaNombre
    ? atletaNombre
    : tipo === 'post'
      ? 'RPE de la sesión'
      : 'Wellness del día';

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
        kicker="Wellness"
        title={tipo === 'post' ? 'Wellness post' : 'Wellness pre'}
        subtitle={formTitle}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          targetAtletaId ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          ) : undefined
        }
      >
        {targetAtletaId ? (
          <>
            <Text style={[styles.sectionHead, { color: theme.text }]}>Historial por métrica (30 días)</Text>
            {showHistorialLoader ? (
              <ActivityIndicator color={colorMarca} style={{ marginBottom: 16 }} />
            ) : (
              <WellnessMetricsChart
                series={historialSeries}
                width={CHART_W}
                height={220}
                colorMarca={colorMarca}
                theme={theme}
                showLegend
              />
            )}
          </>
        ) : null}

        <Text style={[styles.sectionHead, { color: theme.text, marginTop: targetAtletaId ? 20 : 0 }]}>
          {tipo === 'pre' ? 'Hoy (se renueva cada día)' : 'Después de entrenar'}
        </Text>
        <Text style={[styles.formHint, { color: theme.textMuted }]}>
          {tipo === 'pre'
            ? 'Deslizá cada barra del 1 al 10. Podés cargarlo aunque no haya sesión.'
            : 'RPE de esta sesión (1–10).'}
        </Text>

        {canPost ? (
          <>
            <Text style={[styles.label, { color: theme.text }]}>Momento</Text>
            <View style={styles.row}>
              {['pre', 'post'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.chip,
                    {
                      borderColor: tipo === t ? colorMarca : theme.border,
                      backgroundColor: tipo === t ? colorMarca + '22' : theme.surface,
                    },
                  ]}
                  onPress={() => setTipo(t)}
                >
                  <Text style={{ color: theme.text, fontWeight: '700' }}>
                    {t === 'pre' ? 'Antes (día)' : 'Después (sesión)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <Text style={[styles.onlyPreNote, { color: theme.textMuted }]}>
            Hoy no tenés entrenamiento programado: solo wellness pre. El RPE aparece cuando haya sesión.
          </Text>
        )}

        {tipo === 'pre' ? (
          WELLNESS_PRE_FIELDS.map((f) => (
            <WellnessScalePicker
              key={f.key}
              label={f.label}
              value={pre[f.key]}
              onChange={(n) => setPreField(f.key, n)}
              accentColor={f.color || colorMarca}
              theme={theme}
            />
          ))
        ) : (
          <WellnessScalePicker
            label="RPE de la sesión"
            value={rpe}
            onChange={setRpe}
            accentColor={colorMarca}
            theme={theme}
          />
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
          onPress={submit}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Guardar</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  sectionHead: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  formHint: { fontSize: 13, marginBottom: 12 },
  onlyPreNote: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  chip: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
