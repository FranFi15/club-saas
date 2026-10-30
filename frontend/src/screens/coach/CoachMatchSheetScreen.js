import React, { useCallback, useContext, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { COURT_DEPORTES, courtPresetKey, isCourtPresetUrl } from '../../constants/courtMetrics';
import CourtPresetImage from '../../components/CourtPresetImage';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CustomAlert from '../../components/CustomAlert';
import FormSheet from '../../components/FormSheet';
import { MATCH_MARKS, MatchMark } from '../../components/MatchMark';
import { iosCompatiblePhotoOptions, uploadFileToClub } from '../../utils/uploadMedia';
import { Ionicons } from '@expo/vector-icons';

const TIPOS = [
  { id: 'porcentaje', label: 'Anotó / Erró' },
  { id: 'total', label: 'Total' },
  { id: 'limite', label: 'Faltas / tarjetas' },
  { id: 'numero', label: 'Número' },
];

function totalDependsOn(item, targetId, rows, seen = new Set()) {
  if (!item || seen.has(item.id)) return false;
  seen.add(item.id);
  return (item.camposTotal || []).some((id) => {
    if (id === targetId) return true;
    return totalDependsOn(rows.find((row) => row.id === id), targetId, rows, seen);
  });
}

function blankField() {
  return {
    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    etiqueta: '',
    alcance: 'persona',
    tipo: 'porcentaje',
    iconoAnoto: 'circulo',
    iconoErro: 'x',
    camposTotal: [],
    limite: '5',
    puntos: '0',
  };
}

export default function CoachMatchSheetScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const sheetId = route.params?.sheetId;
  const [nombre, setNombre] = useState('');
  const [deporte, setDeporte] = useState('basquet');
  const [imagenUrl, setImagenUrl] = useState(courtPresetKey('basquet'));
  const [relojOn, setRelojOn] = useState(true);
  const [periodos, setPeriodos] = useState('4');
  const [minutos, setMinutos] = useState('10');
  const [enCancha, setEnCancha] = useState('5');
  const [posesionOn, setPosesionOn] = useState(true);
  const [rivalOn, setRivalOn] = useState(false);
  const [rivalModo, setRivalModo] = useState('general');
  const [campos, setCampos] = useState([blankField()]);
  const [openCampoId, setOpenCampoId] = useState(null);
  const [loading, setLoading] = useState(Boolean(sheetId));
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '' });

  const showAlert = (title, message) => setAlertConfig({ visible: true, title, message });

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
  }, [clubData?.urlIdentifier]);

  React.useEffect(() => {
    if (!sheetId) return undefined;
    let alive = true;
    (async () => {
      try {
        const h = await headers();
        const { data } = await clubApi.get('/sessions/match-sheets', { headers: h });
        const sheet = (data || []).find((item) => String(item._id) === String(sheetId));
        if (!alive || !sheet) return;
        setNombre(sheet.nombre || '');
        setDeporte(sheet.cancha?.deporte || 'basquet');
        setImagenUrl(sheet.cancha?.imagenUrl || courtPresetKey(sheet.cancha?.deporte || 'basquet'));
        setRelojOn(sheet.reloj?.activo !== false);
        setPeriodos(String(sheet.reloj?.periodos || 4));
        setMinutos(String(sheet.reloj?.minutosPorPeriodo || 10));
        setEnCancha(String(sheet.reloj?.jugadoresEnCancha || 5));
        setPosesionOn(sheet.reloj?.posesion !== false);
        setRivalOn(sheet.rival?.activo === true);
        setRivalModo(sheet.rival?.modo === 'alineacion' ? 'alineacion' : 'general');
        setCampos(
          (sheet.campos || []).map((campo) => ({
            id: String(campo._id),
            etiqueta: campo.etiqueta,
            alcance: campo.alcance,
            tipo: campo.tipo,
            iconoAnoto: campo.iconoAnoto || 'circulo',
            iconoErro: campo.iconoErro || 'x',
            camposTotal: (campo.camposTotal || []).map(String),
            limite: String(campo.limite || 5),
            puntos: String(campo.puntos || 0),
          })),
        );
      } catch (e) {
        showAlert('Error', e.response?.data?.message || 'No se pudo abrir la planilla.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [headers, sheetId]);

  const save = async () => {
    if (!nombre.trim()) {
      showAlert('Nombre', 'Poné un nombre a la planilla.');
      return;
    }
    setSaving(true);
    try {
      const h = await headers();
      const body = {
        nombre: nombre.trim(),
        cancha: { deporte, imagenUrl },
        reloj: {
          activo: relojOn,
          periodos: Number(periodos) || 4,
          minutosPorPeriodo: Number(minutos) || 10,
          jugadoresEnCancha: Number(enCancha) || 5,
          posesion: posesionOn,
        },
        rival: { activo: rivalOn, modo: rivalModo },
        campos,
      };
      if (sheetId) await clubApi.patch(`/sessions/match-sheets/${sheetId}`, body, { headers: h });
      else await clubApi.post('/sessions/match-sheets', body, { headers: h });
      navigation.goBack();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permiso', 'Necesitamos acceso a la galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      ...iosCompatiblePhotoOptions(),
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      const up = await uploadFileToClub(clubData, asset.uri, asset.fileName || 'cancha.jpg', asset.mimeType || 'image/jpeg');
      setDeporte('otro');
      setImagenUrl(up.url);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'No se pudo subir.');
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  const patchCampo = (index, patch) => {
    setCampos((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addCampo = () => {
    const field = blankField();
    setCampos((rows) => [...rows, field]);
    setOpenCampoId(field.id);
  };

  const openIndex = campos.findIndex((campo) => campo.id === openCampoId);
  const openCampo = openIndex >= 0 ? campos[openIndex] : null;
  const tipoLabel = (tipo) => TIPOS.find((item) => item.id === tipo)?.label || (tipo === 'texto' ? 'Texto' : tipo === 'si_no' ? 'Sí / No' : 'Dato');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={() => setAlertConfig((p) => ({ ...p, visible: false }))}
        onCancel={() => setAlertConfig((p) => ({ ...p, visible: false }))}
      />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Planilla"
        title={sheetId ? 'Editar planilla' : 'Nueva planilla'}
        onBack={() => navigation.goBack()}
      />
      {loading ? (
        <ClubSpinLoader size={40} style={{ marginTop: 24 }} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: theme.textMuted }]}>Nombre de la planilla</Text>
          <TextInput
            style={inputStyle}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Ej. Básquet oficial"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>Cancha</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Elegí el dibujo del deporte o subí una foto de la cancha.
          </Text>
          <View style={styles.chipWrap}>
            {COURT_DEPORTES.filter((d) => d.key !== 'otro').map((d) => {
              const on = deporte === d.key && isCourtPresetUrl(imagenUrl);
              return (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => {
                    setDeporte(d.key);
                    setImagenUrl(courtPresetKey(d.key));
                  }}
                  style={[
                    styles.chip,
                    { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : theme.surface },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{d.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={upload}
              style={[styles.chip, { borderColor: !isCourtPresetUrl(imagenUrl) ? colorMarca : theme.border, backgroundColor: theme.surface }]}
            >
              <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>Subir imagen</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.preview, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            {isCourtPresetUrl(imagenUrl) ? (
              <CourtPresetImage imagenUrl={imagenUrl} deporte={deporte} height={160} />
            ) : (
              <Image source={{ uri: imagenUrl }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
            )}
          </View>

          <Text style={[styles.label, { color: theme.textMuted }]}>Reloj del partido</Text>
          <View style={styles.chipWrap}>
            {[
              { on: true, label: 'Con reloj' },
              { on: false, label: 'Sin reloj' },
            ].map((option) => (
              <TouchableOpacity
                key={option.label}
                onPress={() => setRelojOn(option.on)}
                style={[
                  styles.chip,
                  {
                    borderColor: relojOn === option.on ? colorMarca : theme.border,
                    backgroundColor: relojOn === option.on ? colorMarca + '22' : theme.surface,
                  },
                ]}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {relojOn ? (
            <View style={styles.row3}>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Períodos</Text>
                <TextInput style={inputStyle} value={periodos} onChangeText={setPeriodos} keyboardType="number-pad" placeholder="4" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Minutos</Text>
                <TextInput style={inputStyle} value={minutos} onChangeText={setMinutos} keyboardType="number-pad" placeholder="10" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>En cancha</Text>
                <TextInput style={inputStyle} value={enCancha} onChangeText={setEnCancha} keyboardType="number-pad" placeholder="5" placeholderTextColor={theme.textMuted} />
              </View>
            </View>
          ) : (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Sin reloj no se cuenta el tiempo de juego.
            </Text>
          )}

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Contar posesiones</Text>
              <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 0, marginTop: 4 }]}>
                El entrenador marca qué equipo tiene la pelota.
              </Text>
            </View>
            <Switch value={posesionOn} onValueChange={setPosesionOn} trackColor={{ false: theme.border, true: colorMarca }} />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Anotar al rival</Text>
              <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 0, marginTop: 4 }]}>
                Las mismas estadísticas también pueden sumar para el otro equipo.
              </Text>
            </View>
            <Switch value={rivalOn} onValueChange={setRivalOn} trackColor={{ false: theme.border, true: colorMarca }} />
          </View>
          {rivalOn ? (
            <>
              <View style={styles.chipWrap}>
                {[
                  { id: 'general', label: 'General' },
                  { id: 'alineacion', label: 'Alineación' },
                ].map((option) => {
                  const on = rivalModo === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => setRivalModo(option.id)}
                      style={[
                        styles.chip,
                        { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : theme.surface },
                      ]}
                    >
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {rivalModo === 'alineacion'
                  ? 'En el partido se cargan los números del rival y, si se quiere, el nombre.'
                  : 'El rival se anota como equipo, sin jugadores.'}
              </Text>
            </>
          ) : null}

          <Text style={[styles.label, { color: theme.textMuted }]}>Datos</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Cada dato es una estadística. Tocá uno para editarlo. Anotó / Erró se carga tocando la cancha.
          </Text>
          {campos.map((campo, index) => (
            <TouchableOpacity
              key={campo.id}
              onPress={() => setOpenCampoId(campo.id)}
              style={[styles.statBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                  {campo.etiqueta.trim() || `Dato ${index + 1}`}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>
                  {tipoLabel(campo.tipo)}{campo.tipo === 'limite' ? ` · ${campo.limite || 5}` : ''}{campo.tipo === 'porcentaje' && Number(campo.puntos) > 0 ? ` · ${campo.puntos} pts` : ''} · {campo.alcance === 'partido' ? 'Del partido' : 'Por jugador'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={addCampo}
            style={[styles.addBtn, { borderColor: colorMarca }]}
          >
            <Text style={{ color: colorMarca, fontWeight: '800' }}>+ Agregar dato</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: colorMarca }]}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{saving ? 'Guardando…' : 'Guardar planilla'}</Text>
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
      <FormSheet
        visible={!!openCampo}
        onClose={() => setOpenCampoId(null)}
        title={openCampo?.etiqueta.trim() || (openIndex >= 0 ? `Dato ${openIndex + 1}` : 'Dato')}
        subtitle="Estadística de la planilla"
        theme={theme}
        isDarkMode={isDarkMode}
      >
        {openCampo ? (
          <>
            <View style={styles.cardHead}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0 }]}>Nombre</Text>
              <TouchableOpacity
                onPress={() => {
                  setCampos((rows) => rows.filter((row) => row.id !== openCampo.id));
                  setOpenCampoId(null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.remove}>Quitar</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={inputStyle}
              value={openCampo.etiqueta}
              onChangeText={(etiqueta) => patchCampo(openIndex, { etiqueta })}
              placeholder="Ej. 3pts"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Tipo</Text>
            <View style={styles.chipWrap}>
              {TIPOS.map((tipo) => {
                const on = openCampo.tipo === tipo.id;
                return (
                  <TouchableOpacity
                    key={tipo.id}
                    onPress={() => patchCampo(openIndex, { tipo: tipo.id, ...(tipo.id === 'limite' ? { alcance: 'persona' } : {}) })}
                    style={[
                      styles.chip,
                      { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : theme.background },
                    ]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{tipo.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Se anota</Text>
            <View style={styles.chipWrap}>
              {(openCampo.tipo === 'limite'
                ? [{ id: 'persona', label: 'Por jugador' }]
                : [
                  { id: 'persona', label: 'Por jugador' },
                  { id: 'partido', label: 'Del partido' },
                ]
              ).map((alcance) => {
                const on = openCampo.alcance === alcance.id;
                return (
                  <TouchableOpacity
                    key={alcance.id}
                    onPress={() => patchCampo(openIndex, { alcance: alcance.id })}
                    style={[
                      styles.chip,
                      { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : theme.background },
                    ]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{alcance.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {openCampo.tipo === 'porcentaje' ? (
              <>
                {[
                  { key: 'iconoAnoto', label: 'Marca de anotó' },
                  { key: 'iconoErro', label: 'Marca de erró' },
                ].map((markRow) => (
                  <View key={markRow.key}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{markRow.label}</Text>
                    <View style={styles.chipWrap}>
                      {MATCH_MARKS.map((mark) => {
                        const on = openCampo[markRow.key] === mark.id;
                        return (
                          <TouchableOpacity
                            key={mark.id}
                            onPress={() => patchCampo(openIndex, { [markRow.key]: mark.id })}
                            style={[
                              styles.markChip,
                              { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : theme.background },
                            ]}
                            accessibilityLabel={mark.label}
                          >
                            <MatchMark tipo={mark.id} size={16} color={on ? colorMarca : theme.text} />
                            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{mark.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Puntos que suma</Text>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Cuando anota, estos puntos se suman al marcador. 0 no suma.
                </Text>
                <TextInput
                  style={inputStyle}
                  value={String(openCampo.puntos ?? '0')}
                  onChangeText={(puntos) => patchCampo(openIndex, { puntos: puntos.replace(/[^0-9]/g, '').slice(0, 2) })}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                />
              </>
            ) : null}
            {openCampo.tipo === 'limite' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Límite</Text>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Cada toque en la cancha suma uno. Cuando un jugador llega a este número queda expulsado.
                </Text>
                <TextInput
                  style={inputStyle}
                  value={String(openCampo.limite ?? '5')}
                  onChangeText={(limite) => patchCampo(openIndex, { limite: limite.replace(/[^0-9]/g, '').slice(0, 2) })}
                  keyboardType="number-pad"
                  placeholder="5"
                  placeholderTextColor={theme.textMuted}
                />
              </>
            ) : null}
            {openCampo.tipo === 'total' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Sumar</Text>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Si no marcás nada, este total aparece en las acciones y cada toque suma uno. Si marcás otros datos, solo los suma y no se anota aparte.
                </Text>
                <View style={styles.chipWrap}>
                  {campos
                    .filter((item) => (
                      item.id !== openCampo.id
                      && (item.tipo === 'porcentaje' || item.tipo === 'total')
                      && !totalDependsOn(item, openCampo.id, campos)
                    ))
                    .map((item) => {
                      const on = openCampo.camposTotal.includes(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() =>
                            patchCampo(openIndex, {
                              camposTotal: on
                                ? openCampo.camposTotal.filter((id) => id !== item.id)
                                : [...openCampo.camposTotal, item.id],
                            })
                          }
                          style={[
                            styles.chip,
                            { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : theme.background },
                          ]}
                        >
                          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{item.etiqueta || 'Sin nombre'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </FormSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8, textTransform: 'uppercase' },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  markChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  preview: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  row3: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  statBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  remove: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  addBtn: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
  saveBtn: { borderRadius: 12, padding: 14, alignItems: 'center' },
});
