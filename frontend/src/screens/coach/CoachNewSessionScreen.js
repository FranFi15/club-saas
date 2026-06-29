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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CoachSpaceAvailabilityPicker from '../../components/CoachSpaceAvailabilityPicker';
import CoachSessionCalendar from '../../components/CoachSessionCalendar';
import { todayYmd } from '../../utils/timeSlots';
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import { sessionTipoLabel } from '../../utils/sessionDisplay';
import { sortByNombre } from '../../utils/listSort';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function CoachNewSessionScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const metaCacheKey = clubData?.urlIdentifier ? `coach-new-session:${clubData.urlIdentifier}` : '';

  const [userRol, setUserRol] = useState(() => readScreenCache(metaCacheKey)?.userRol ?? '');
  const soloEntrenamientoPf = userRol === 'preparador_fisico';

  const [categories, setCategories] = useState(() => readScreenCache(metaCacheKey)?.categories ?? []);
  const [spaces, setSpaces] = useState(() => readScreenCache(metaCacheKey)?.spaces ?? []);
  const [schedulesBySpace, setSchedulesBySpace] = useState(
    () => readScreenCache(metaCacheKey)?.schedulesBySpace ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [selectedYmd, setSelectedYmd] = useState(todayYmd());
  const [espacio, setEspacio] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [tipoSesion, setTipoSesion] = useState('entrenamiento');
  const [lugarPartidoModo, setLugarPartidoModo] = useState('club');
  const [lugarExternoText, setLugarExternoText] = useState('');
  const [nombreSesion, setNombreSesion] = useState('');
  const [esOpcional, setEsOpcional] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const needsClubSpace =
    tipoSesion === 'entrenamiento' || (tipoSesion === 'partido' && lugarPartidoModo === 'club');

  const selectedSlot = useMemo(() => {
    if (!needsClubSpace || !espacio || !horaInicio || !horaFin) return null;
    return { espacioId: espacio, horaInicio, horaFin, ymd: selectedYmd };
  }, [needsClubSpace, espacio, horaInicio, horaFin, selectedYmd]);

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: false,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const fetchMeta = useCallback(async () => {
    const token = await getToken('userToken');
    const rol = (await getToken('userRol')) || '';
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const [cats, sp] = await Promise.all([
      clubApi.get('/categories/mis-categorias', { headers: h }),
      clubApi.get('/spaces', { headers: h }),
    ]);
    const catList = sortByNombre(cats.data || []);
    const spaceList = sortByNombre(sp.data || []);
    const map = {};
    await Promise.all(
      spaceList.map(async (spc) => {
        try {
          const r = await clubApi.get(`/schedules/espacio/${spc._id}`, { headers: h });
          map[spc._id] = r.data || [];
        } catch {
          map[spc._id] = [];
        }
      }),
    );
    return { categories: catList, spaces: spaceList, schedulesBySpace: map, userRol: rol };
  }, [clubData?.urlIdentifier]);

  const applyMeta = useCallback((data) => {
    setCategories(data.categories ?? []);
    setSpaces(data.spaces ?? []);
    setSchedulesBySpace(data.schedulesBySpace ?? {});
    setUserRol(data.userRol ?? '');
    if (data.userRol === 'preparador_fisico') {
      setTipoSesion('entrenamiento');
      setLugarPartidoModo('club');
    }
    setCategoria((prev) => {
      if (prev && data.categories?.some((c) => String(c._id) === String(prev))) return prev;
      return data.categories?.[0]?._id || '';
    });
    setEspacio((prev) => {
      if (prev && data.spaces?.some((s) => String(s._id) === String(prev))) return prev;
      return data.spaces?.[0]?._id || '';
    });
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

  const showInitialLoader = loading && categories.length === 0 && spaces.length === 0;

  const onSelectSlot = ({ espacioId, horaInicio: hi, horaFin: hf, ymd }) => {
    setEspacio(espacioId);
    setHoraInicio(hi);
    setHoraFin(hf);
    if (ymd) setSelectedYmd(ymd);
  };

  const onSelectYmd = (ymd) => {
    setSelectedYmd(ymd);
    setHoraInicio('');
    setHoraFin('');
  };

  const onSelectSpaceId = (id) => {
    setEspacio(id);
    setHoraInicio('');
    setHoraFin('');
  };

  const submit = async () => {
    if (!categoria) {
      showAlert('Faltan datos', 'Elegí una categoría.');
      return;
    }
    if (!selectedYmd) {
      showAlert('Faltan datos', 'Elegí un día en el calendario.');
      return;
    }
    if (needsClubSpace) {
      if (!espacio || !horaInicio || !horaFin) {
        showAlert('Horario', 'Tocá un horario libre en el espacio que quieras usar.');
        return;
      }
    }
    if (needsClubSpace && (!isValidTimeHHMM(horaInicio) || !isValidTimeHHMM(horaFin))) {
      showAlert('Horario inválido', 'Elegí un horario de la lista.');
      return;
    }
    if (tipoSesion === 'partido' && lugarPartidoModo === 'externo') {
      const ext = lugarExternoText.trim();
      if (ext.length < 3) {
        showAlert(
          'Sede del partido',
          'Escribí dónde se juega (cancha rival, ciudad, dirección… al menos 3 caracteres).',
        );
        return;
      }
      if (!isValidTimeHHMM(horaInicio) || !isValidTimeHHMM(horaFin)) {
        showAlert('Horario inválido', 'Usá HH:MM en 24 h (ej. 18:00 y 19:30).');
        return;
      }
    }

    setSaving(true);
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      const body = {
        tipo: tipoSesion,
        categoria,
        fecha: new Date(`${selectedYmd}T12:00:00.000Z`).toISOString(),
        horaInicio,
        horaFin,
        nombreSesion: nombreSesion.trim(),
        esOpcional,
      };
      if (tipoSesion === 'partido' && lugarPartidoModo === 'externo') {
        body.lugarExterno = lugarExternoText.trim();
      } else {
        body.espacio = espacio;
      }
      const { data } = await clubApi.post('/sessions', body, { headers: h });
      navigation.replace('CoachSessionDetail', { sessionId: data._id });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo crear la sesión.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];
  const spaceName = spaces.find((s) => s._id === espacio)?.nombre;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Nueva sesión"
        title={
          soloEntrenamientoPf
            ? 'Entreno (gimnasio / campo)'
            : tipoSesion === 'partido'
              ? 'Programar partido'
              : 'Programar entreno'
        }
        subtitle={clubData?.nombre || 'Tu club'}
        onBack={() => navigation.goBack()}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!soloEntrenamientoPf ? (
            <>
              <Text style={[styles.label, { color: theme.textMuted }]}>Tipo</Text>
              <View style={{ flexDirection: 'row', marginBottom: 14, gap: 10 }}>
                {[
                  { v: 'entrenamiento', l: 'Entrenamiento' },
                  { v: 'partido', l: 'Partido' },
                ].map((x) => (
                  <TouchableOpacity
                    key={x.v}
                    style={[
                      styles.chip,
                      {
                        borderColor: tipoSesion === x.v ? colorMarca : theme.border,
                        backgroundColor: tipoSesion === x.v ? colorMarca + '22' : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      setTipoSesion(x.v);
                      if (x.v === 'entrenamiento') setLugarPartidoModo('club');
                    }}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{x.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <Text style={[styles.label, { color: theme.textMuted, marginBottom: 12 }]}>
              Solo entrenamientos (gimnasio o trabajo físico en campo). Los partidos los programa el DT.
            </Text>
          )}

          {tipoSesion === 'partido' ? (
            <>
              <Text style={[styles.label, { color: theme.textMuted }]}>¿Dónde se juega?</Text>
              <View style={{ flexDirection: 'row', marginBottom: 12, gap: 10 }}>
                {[
                  { v: 'club', l: 'En el club' },
                  { v: 'externo', l: 'Fuera / visitante' },
                ].map((x) => (
                  <TouchableOpacity
                    key={x.v}
                    style={[
                      styles.chip,
                      {
                        borderColor: lugarPartidoModo === x.v ? colorMarca : theme.border,
                        backgroundColor: lugarPartidoModo === x.v ? colorMarca + '22' : theme.surface,
                      },
                    ]}
                    onPress={() => setLugarPartidoModo(x.v)}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{x.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {lugarPartidoModo === 'externo' ? (
                <>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Sede o rival (texto)</Text>
                  <TextInput
                    style={[inputStyle, { minHeight: 44 }]}
                    value={lugarExternoText}
                    onChangeText={setLugarExternoText}
                    placeholder="Ej. Polideportivo Rivadavia · Avellaneda"
                    placeholderTextColor={theme.textMuted}
                    multiline
                  />
                </>
              ) : null}
            </>
          ) : null}

          <Text style={[styles.label, { color: theme.textMuted }]}>Nombre de la sesión</Text>
          <TextInput
            style={inputStyle}
            value={nombreSesion}
            onChangeText={setNombreSesion}
            placeholder={
              tipoSesion === 'partido'
                ? `Ej. Amistoso — si lo dejás vacío: ${sessionTipoLabel('partido')}`
                : `Ej. Entreno técnico — si lo dejás vacío: ${sessionTipoLabel('entrenamiento')}`
            }
            placeholderTextColor={theme.textMuted}
            maxLength={120}
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>¿Es obligatoria?</Text>
          <View style={{ flexDirection: 'row', marginBottom: 16, gap: 10 }}>
            {[
              { v: false, l: 'Obligatoria' },
              { v: true, l: 'Opcional' },
            ].map((x) => (
              <TouchableOpacity
                key={x.l}
                style={[
                  styles.chip,
                  {
                    borderColor: esOpcional === x.v ? colorMarca : theme.border,
                    backgroundColor: esOpcional === x.v ? colorMarca + '22' : theme.surface,
                  },
                ]}
                onPress={() => setEsOpcional(x.v)}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{x.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.hintSmall, { color: theme.textMuted }]}>
            {esOpcional
              ? 'Los atletas pueden tratarla como convocatoria abierta (no exige asistencia obligatoria).'
              : 'Cuenta como sesión normal del plantel.'}
          </Text>

          <Text style={[styles.label, { color: theme.textMuted }]}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
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
                onPress={() => setCategoria(c._id)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{c.nombre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {needsClubSpace ? (
            <>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Elegí un día fuera de tu grilla habitual y tocá un horario libre en el espacio que necesites.
              </Text>
              <CoachSpaceAvailabilityPicker
                clubIdentifier={clubData.urlIdentifier}
                spaces={spaces}
                schedulesBySpace={schedulesBySpace}
                colorMarca={colorMarca}
                theme={theme}
                isDarkMode={isDarkMode}
                selectedYmd={selectedYmd}
                onSelectYmd={onSelectYmd}
                selectedSpaceId={espacio}
                onSelectSpaceId={onSelectSpaceId}
                selectedSlot={selectedSlot}
                onSelectSlot={onSelectSlot}
              />
              {horaInicio && horaFin ? (
                <View style={[styles.selectionCard, { backgroundColor: theme.surface, borderColor: colorMarca }]}>
                  <Text style={[styles.selectionTitle, { color: theme.text }]}>Horario elegido</Text>
                  <Text style={[styles.selectionLine, { color: theme.textMuted }]}>
                    {isoCalendarDateToDisplay(selectedYmd)} · {horaInicio}–{horaFin}
                  </Text>
                  {spaceName ? (
                    <Text style={[styles.selectionLine, { color: theme.textMuted }]}>{spaceName}</Text>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Partido fuera del club: elegí el día y el horario (no reserva espacio interno).
              </Text>
              <CoachSessionCalendar
                theme={theme}
                colorMarca={colorMarca}
                currentMonth={calendarMonth}
                onChangeMonth={(o) =>
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + o, 1))
                }
                selectedYmd={selectedYmd}
                onSelectDay={onSelectYmd}
                sessionCountByDay={{}}
              />
              <Text style={[styles.label, { color: theme.textMuted }]}>Hora inicio / fin (HH:MM)</Text>
              <View style={styles.row2}>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={horaInicio}
                  onChangeText={(t) => setHoraInicio(maskTimeHHMM(t))}
                  placeholder="18:00"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={horaFin}
                  onChangeText={(t) => setHoraFin(maskTimeHHMM(t))}
                  placeholder="19:30"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
            onPress={submit}
            disabled={saving}
          >
            <Text style={styles.primaryBtnTxt}>
              {saving ? 'Guardando…' : tipoSesion === 'partido' ? 'Crear partido' : 'Crear entreno'}
            </Text>
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
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  hintSmall: { fontSize: 12, lineHeight: 17, marginTop: -8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 10 },
  selectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  selectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  selectionLine: { fontSize: 13, lineHeight: 18 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
