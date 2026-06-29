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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { sortByNombre } from '../../utils/listSort';
import { formatLocalDate } from '../../utils/timeSlots';
import { displayDateToIsoCalendar, isoCalendarDateToDisplay, maskDateDDMMAAAA } from '../../utils/dateDisplay';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

/** Alta de sesión tipo `consulta_nutricion`: un atleta y lugar en texto libre. */
export default function NutritionNewConsultScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const metaCacheKey = clubData?.urlIdentifier ? `nutrition-new-consult:${clubData.urlIdentifier}` : '';

  const [categories, setCategories] = useState(() => readScreenCache(metaCacheKey)?.categories ?? []);
  const [enrollments, setEnrollments] = useState(() => readScreenCache(metaCacheKey)?.enrollments ?? []);
  const [saving, setSaving] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [atletaId, setAtletaId] = useState('');
  const [lugarLibre, setLugarLibre] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('09:45');
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

  const fetchMeta = useCallback(async () => {
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const cats = await clubApi.get('/categories/mis-categorias', { headers: h });
    const sorted = sortByNombre(cats.data || []);
    const first = sorted[0];
    let list = [];
    if (first?._id) {
      const enr = await clubApi.get(`/enrollments/categoria/${first._id}`, { headers: h });
      list = enr.data || [];
    }
    return {
      categories: sorted,
      enrollments: list,
      defaultCategoriaId: first?._id || '',
      defaultAtletaId: list[0]?.atleta?._id || '',
      fecha: isoCalendarDateToDisplay(formatLocalDate(new Date())),
    };
  }, [clubData?.urlIdentifier]);

  const applyMeta = useCallback((data) => {
    setCategories(data.categories ?? []);
    setEnrollments(data.enrollments ?? []);
    setCategoria((prev) => {
      if (prev && data.categories?.some((c) => String(c._id) === String(prev))) return prev;
      return data.defaultCategoriaId || '';
    });
    setAtletaId((prev) => {
      if (prev && data.enrollments?.some((e) => String(e.atleta?._id) === String(prev))) return prev;
      return data.defaultAtletaId || '';
    });
    setFecha(data.fecha || isoCalendarDateToDisplay(formatLocalDate(new Date())));
  }, []);

  const { loading } = useCachedFocusLoad({
    cacheKey: metaCacheKey,
    enabled: !!metaCacheKey,
    fetchData: fetchMeta,
    onFetched: applyMeta,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar datos.');
    },
  });

  const showInitialLoader = loading && categories.length === 0;

  const onPickCategory = async (id) => {
    setCategoria(id);
    setAtletaId('');
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      const enr = await clubApi.get(`/enrollments/categoria/${id}`, { headers: h });
      const list = enr.data || [];
      setEnrollments(list);
      const a0 = list[0]?.atleta;
      setAtletaId(a0?._id || '');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el plantel.');
    }
  };

  const submit = async () => {
    if (!categoria || !atletaId || !fecha) {
      showAlert('Faltan datos', 'Elegí categoría, atleta y fecha.');
      return;
    }
    const fechaIso = displayDateToIsoCalendar(fecha);
    if (!fechaIso) {
      showAlert('Fecha inválida', 'Usá el formato DD-MM-AAAA con día y mes válidos.');
      return;
    }
    if (!isValidTimeHHMM(horaInicio) || !isValidTimeHHMM(horaFin)) {
      showAlert('Horario inválido', 'Usá HH:MM en 24 h.');
      return;
    }
    setSaving(true);
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      const body = {
        tipo: 'consulta_nutricion',
        categoria,
        atletaIndividual: atletaId,
        lugarLibre: lugarLibre.trim(),
        fecha: new Date(`${fechaIso}T12:00:00.000Z`).toISOString(),
        horaInicio,
        horaFin,
      };
      const { data } = await clubApi.post('/sessions', body, { headers: h });
      navigation.replace('CoachSessionDetail', { sessionId: data._id });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo crear la consulta.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];

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
        kicker="Nueva consulta"
        title="Nutrición individual"
        subtitle="No usa espacio del club: indicá el lugar en texto."
        onBack={() => navigation.goBack()}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.label, { color: theme.textMuted }]}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c._id}
                style={[
                  styles.chip,
                  {
                    borderColor: categoria === c._id ? colorMarca : theme.border,
                    backgroundColor: categoria === c._id ? colorMarca + '22' : theme.surface,
                  },
                ]}
                onPress={() => onPickCategory(c._id)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{c.nombre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.label, { color: theme.textMuted }]}>Atleta</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {enrollments.map((e) => {
              const a = e.atleta;
              if (!a?._id) return null;
              return (
                <TouchableOpacity
                  key={e._id}
                  style={[
                    styles.chip,
                    {
                      borderColor: atletaId === a._id ? colorMarca : theme.border,
                      backgroundColor: atletaId === a._id ? colorMarca + '22' : theme.surface,
                    },
                  ]}
                  onPress={() => setAtletaId(a._id)}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>
                    {a.nombre} {a.apellido}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {enrollments.length === 0 ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>No hay atletas activos en esta categoría.</Text>
          ) : null}

          <Text style={[styles.label, { color: theme.textMuted }]}>Lugar (texto libre)</Text>
          <TextInput
            style={[inputStyle, { minHeight: 56 }]}
            value={lugarLibre}
            onChangeText={setLugarLibre}
            placeholder="Ej. Consultorio Av. Siempre Viva 123 · Zoom · Gimnasio club sala 2"
            placeholderTextColor={theme.textMuted}
            multiline
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>Fecha (DD-MM-AAAA)</Text>
          <TextInput
            style={inputStyle}
            value={fecha}
            onChangeText={(t) => setFecha(maskDateDDMMAAAA(t))}
            placeholder="DD-MM-AAAA"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={10}
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>Hora inicio / fin</Text>
          <View style={styles.row2}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              value={horaInicio}
              onChangeText={(t) => setHoraInicio(maskTimeHHMM(t))}
              placeholder="09:00"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              maxLength={5}
            />
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              value={horaFin}
              onChangeText={(t) => setHoraFin(maskTimeHHMM(t))}
              placeholder="09:45"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colorMarca }]} onPress={submit} disabled={saving}>
            <Text style={styles.primaryBtnTxt}>{saving ? 'Guardando…' : 'Crear consulta'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  hint: { fontSize: 13, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 10 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
