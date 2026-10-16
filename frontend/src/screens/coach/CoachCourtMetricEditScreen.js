import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { uploadFileToClub, iosCompatiblePhotoOptions } from '../../utils/uploadMedia';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CourtImageBoard from '../../components/CourtImageBoard';
import CustomAlert from '../../components/CustomAlert';
import FilterPillSheet from '../../components/FilterPillSheet';
import { sortUsersByName, formatUserName } from '../../utils/listSort';
import {
  COURT_DEPORTES,
  COURT_TIPOS_MEDICION,
  courtBoardHeight,
  courtPresetKey,
  deporteLabel,
  normalizeTipoMedicion,
} from '../../constants/courtMetrics';

export default function CoachCourtMetricEditScreen({ navigation, route }) {
  const metricId = route?.params?.metricId;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';

  const [titulo, setTitulo] = useState('');
  const [deporte, setDeporte] = useState('basquet');
  const [tipoMedicion, setTipoMedicion] = useState('porcentaje');
  const [imagenUrl, setImagenUrl] = useState(courtPresetKey('basquet'));
  const [imagenPublicId, setImagenPublicId] = useState('');
  const [pines, setPines] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [atletas, setAtletas] = useState([]);
  const [selectedCat, setSelectedCat] = useState({});
  const [selectedAth, setSelectedAth] = useState({});
  const [loading, setLoading] = useState(!!metricId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [athletesOpen, setAthletesOpen] = useState(false);
  const [athleteSearch, setAthleteSearch] = useState('');
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

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  useEffect(() => {
    (async () => {
      try {
        const h = await getHeaders();
        const catsRes = await clubApi.get('/categories/mis-categorias', { headers: h }).catch(() => ({ data: [] }));
        const cats = Array.isArray(catsRes.data) ? catsRes.data : catsRes.data?.categories || [];
        setCategorias(cats);
        // Coaches often cannot list /users; gather athletes from category enrollments.
        const athMap = new Map();
        await Promise.all(
          cats.slice(0, 20).map(async (c) => {
            try {
              const enr = await clubApi.get(`/enrollments/categoria/${c._id}`, { headers: h });
              const rows = Array.isArray(enr.data) ? enr.data : [];
              rows.forEach((e) => {
                const a = e.atleta;
                if (a?._id) athMap.set(String(a._id), a);
              });
            } catch {
              /* ignore */
            }
          }),
        );
        setAtletas(sortUsersByName([...athMap.values()]));

        if (metricId) {
          const { data } = await clubApi.get(`/court-metrics/${metricId}`, { headers: h });
          setTitulo(data.titulo || '');
          setDeporte(data.deporte || 'basquet');
          setTipoMedicion(normalizeTipoMedicion(data.tipoMedicion));
          setImagenUrl(data.imagenUrl || courtPresetKey('basquet'));
          setImagenPublicId(data.imagenPublicId || '');
          setPines(data.pines || []);
          const catMap = {};
          (data.categorias || []).forEach((c) => {
            catMap[String(c._id || c)] = true;
          });
          setSelectedCat(catMap);
          const athMap = {};
          (data.atletas || []).forEach((a) => {
            athMap[String(a._id || a)] = true;
          });
          setSelectedAth(athMap);
        }
      } catch (e) {
        showAlert('Error', e.response?.data?.message || 'No se pudo cargar.');
      } finally {
        setLoading(false);
      }
    })();
  }, [metricId, getHeaders]);

  const pickDeporte = useCallback((key) => {
    setDeporte(key);
    if (key !== 'otro') {
      setImagenUrl(courtPresetKey(key));
      setImagenPublicId('');
    }
  }, []);

  const uploadCustom = useCallback(async () => {
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
    setUploading(true);
    try {
      const up = await uploadFileToClub(
        clubData,
        asset.uri,
        asset.fileName || 'cancha.jpg',
        asset.mimeType || 'image/jpeg',
      );
      setDeporte('otro');
      setImagenUrl(up.url);
      setImagenPublicId(up.publicId || '');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'No se pudo subir.');
    } finally {
      setUploading(false);
    }
  }, [clubData]);

  const onPickDeporte = useCallback(
    (key) => {
      if (key === 'otro') {
        uploadCustom();
        return;
      }
      pickDeporte(key);
    },
    [pickDeporte, uploadCustom],
  );

  const deportePills = useMemo(
    () => [
      {
        key: 'deporte',
        placeholder: 'Deporte / cancha',
        value: deporte,
        options: COURT_DEPORTES.map((d) => ({ value: d.key, label: d.label })),
        displayLabel: deporteLabel(deporte) || 'Deporte / cancha',
        onChange: onPickDeporte,
        searchable: false,
      },
    ],
    [deporte, onPickDeporte],
  );

  const selectedCatCount = useMemo(
    () => Object.keys(selectedCat).filter((k) => selectedCat[k]).length,
    [selectedCat],
  );

  const selectedAthCount = useMemo(
    () => Object.keys(selectedAth).filter((k) => selectedAth[k]).length,
    [selectedAth],
  );

  const filteredAthletes = useMemo(() => {
    const q = athleteSearch.trim().toLowerCase();
    if (!q) return atletas;
    const tokens = q.split(/\s+/).filter(Boolean);
    return atletas.filter((a) => {
      const hay = `${formatUserName(a)} ${a.dni || ''} ${a.email || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [atletas, athleteSearch]);

  const toggleCategory = (id) => {
    const key = String(id);
    setSelectedCat((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleAthlete = (id) => {
    const key = String(id);
    setSelectedAth((p) => ({ ...p, [key]: !p[key] }));
  };

  const save = async () => {
    if (!titulo.trim()) {
      showAlert('Falta título', 'Poné un nombre al shoot-around.');
      return;
    }
    if (!imagenUrl) {
      showAlert('Imagen', 'Elegí un preset o subí una imagen.');
      return;
    }
    const catIds = Object.keys(selectedCat).filter((k) => selectedCat[k]);
    const athIds = Object.keys(selectedAth).filter((k) => selectedAth[k]);
    if (!catIds.length && !athIds.length) {
      showAlert('Asignación', 'Elegí al menos una categoría o un atleta.');
      return;
    }
    setSaving(true);
    try {
      const h = await getHeaders();
      const payload = {
        titulo: titulo.trim(),
        deporte,
        tipoMedicion,
        imagenUrl,
        imagenPublicId: imagenPublicId || undefined,
        pines: pines.map((p) => ({
          ...(p._id ? { _id: p._id } : {}),
          label: p.label,
          x: p.x,
          y: p.y,
          notas: p.notas || '',
        })),
        categorias: catIds,
        atletas: athIds,
        estado: 'activa',
      };
      if (metricId) {
        await clubApi.patch(`/court-metrics/${metricId}`, payload, { headers: h });
      } else {
        await clubApi.post('/court-metrics', payload, { headers: h });
      }
      route?.params?.onSaved?.();
      navigation.goBack();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <ActivityIndicator color={cc} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={cc}
        theme={theme}
        kicker="Individual"
        title={metricId ? 'Editar métrica' : 'Nueva métrica'}
        subtitle="Tocá la cancha para agregar puntos"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.textMuted }]}>Título</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ej. Shoot around perímetro"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.label, { color: theme.textMuted, marginTop: 14 }]}>Tipo de medición</Text>
        <View style={styles.tipoRow}>
          {COURT_TIPOS_MEDICION.map((t) => {
            const on = tipoMedicion === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.tipoChip,
                  {
                    borderColor: on ? cc : theme.border,
                    backgroundColor: on ? `${cc}18` : theme.surface,
                  },
                ]}
                onPress={() => setTipoMedicion(t.key)}
              >
                <Text
                  style={{
                    color: on ? cc : theme.text,
                    fontWeight: '800',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
          {COURT_TIPOS_MEDICION.find((t) => t.key === tipoMedicion)?.inputHint ||
            'Elegí cómo carga el atleta cada punto.'}
        </Text>

        <Text style={[styles.label, { color: theme.textMuted, marginTop: 14 }]}>Deporte / cancha</Text>
        <FilterPillSheet
          pills={deportePills}
          openKey={openFilter}
          onOpen={setOpenFilter}
          onClose={() => setOpenFilter(null)}
          colorMarca={cc}
          theme={theme}
        />
        {uploading ? <ActivityIndicator color={cc} style={{ marginVertical: 8 }} /> : null}

        <Text style={[styles.label, { color: theme.textMuted, marginTop: 8 }]}>
          Tocá la imagen para colocar un punto ({deporteLabel(deporte)})
        </Text>
        <CourtImageBoard
          imagenUrl={imagenUrl}
          deporte={deporte}
          pines={pines}
          editMode
          theme={theme}
          primaryColor={cc}
          onPinsChange={setPines}
          height={courtBoardHeight(deporte, { edit: true })}
        />

        <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>Categorías</Text>
        <TouchableOpacity
          style={[
            styles.athleteBtn,
            {
              borderColor: selectedCatCount ? cc : theme.border,
              backgroundColor: selectedCatCount ? `${cc}18` : theme.surface,
            },
          ]}
          onPress={() => setCategoriesOpen(true)}
        >
          <Ionicons
            name="albums-outline"
            size={20}
            color={selectedCatCount ? cc : theme.icon}
          />
          <Text style={{ color: selectedCatCount ? cc : theme.text, fontWeight: '700', flex: 1, marginLeft: 10 }}>
            {selectedCatCount
              ? `${selectedCatCount} categoría${selectedCatCount === 1 ? '' : 's'} seleccionada${selectedCatCount === 1 ? '' : 's'}`
              : 'Elegir categorías'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={selectedCatCount ? cc : theme.textMuted} />
        </TouchableOpacity>

        <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>Atletas individuales</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
          Opcional: sumá atletas sueltos además de las categorías.
        </Text>
        <TouchableOpacity
          style={[
            styles.athleteBtn,
            {
              borderColor: selectedAthCount ? cc : theme.border,
              backgroundColor: selectedAthCount ? `${cc}18` : theme.surface,
            },
          ]}
          onPress={() => {
            setAthleteSearch('');
            setAthletesOpen(true);
          }}
        >
          <Ionicons
            name="people-outline"
            size={20}
            color={selectedAthCount ? cc : theme.icon}
          />
          <Text style={{ color: selectedAthCount ? cc : theme.text, fontWeight: '700', flex: 1, marginLeft: 10 }}>
            {selectedAthCount
              ? `${selectedAthCount} atleta${selectedAthCount === 1 ? '' : 's'} seleccionado${selectedAthCount === 1 ? '' : 's'}`
              : 'Elegir atletas'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={selectedAthCount ? cc : theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: cc, opacity: saving ? 0.7 : 1 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Guardar</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={categoriesOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoriesOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Elegir categorías</Text>
              <TouchableOpacity onPress={() => setCategoriesOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalHint, { color: theme.textMuted }]}>
              Los atletas de estas categorías van a ver la métrica individual.
            </Text>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {categorias.length === 0 ? (
                <Text style={{ color: theme.textMuted, padding: 12 }}>
                  No tenés categorías asignadas.
                </Text>
              ) : (
                categorias.map((c) => {
                  const sel = !!selectedCat[String(c._id)];
                  return (
                    <TouchableOpacity
                      key={c._id}
                      style={[
                        styles.pickRow,
                        {
                          borderColor: theme.border,
                          backgroundColor: sel ? `${cc}15` : 'transparent',
                        },
                      ]}
                      onPress={() => toggleCategory(c._id)}
                    >
                      <Ionicons
                        name={sel ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={sel ? cc : theme.textMuted}
                      />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>{c.nombre}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.submitReq, { backgroundColor: cc }]}
              onPress={() => setCategoriesOpen(false)}
            >
              <Text style={styles.submitReqTxt}>Listo ({selectedCatCount})</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={athletesOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAthletesOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Elegir atletas</Text>
              <TouchableOpacity onPress={() => setAthletesOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalHint, { color: theme.textMuted }]}>
              Elegí atletas de tus categorías. Podés combinarlos con las categorías asignadas.
            </Text>
            <TextInput
              style={[
                styles.search,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Buscar por nombre, DNI o email…"
              placeholderTextColor={theme.textMuted}
              value={athleteSearch}
              onChangeText={setAthleteSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filteredAthletes.length === 0 ? (
                <Text style={{ color: theme.textMuted, padding: 12 }}>
                  {athleteSearch.trim()
                    ? 'Sin resultados para esta búsqueda.'
                    : 'No hay atletas disponibles en tus categorías.'}
                </Text>
              ) : (
                filteredAthletes.map((u) => {
                  const sel = !!selectedAth[String(u._id)];
                  return (
                    <TouchableOpacity
                      key={u._id}
                      style={[
                        styles.pickRow,
                        {
                          borderColor: theme.border,
                          backgroundColor: sel ? `${cc}15` : 'transparent',
                        },
                      ]}
                      onPress={() => toggleAthlete(u._id)}
                    >
                      <Ionicons
                        name={sel ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={sel ? cc : theme.textMuted}
                      />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>
                          {formatUserName(u)}
                        </Text>
                        {u.dni || u.email ? (
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {[u.dni ? `DNI ${u.dni}` : null, u.email].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.submitReq, { backgroundColor: cc }]}
              onPress={() => setAthletesOpen(false)}
            >
              <Text style={styles.submitReqTxt}>Listo ({selectedAthCount})</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  tipoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  tipoChip: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  athleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    borderRadius: 16,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 8 },
  modalHint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  submitReq: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitReqTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  saveBtn: {
    marginTop: 24,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
