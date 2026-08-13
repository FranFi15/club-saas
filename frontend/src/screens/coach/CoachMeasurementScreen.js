import React, { useContext, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { NutritionSettingsContext } from '../../context/NutritionSettingsContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import NutriBodyFatPanel from '../../components/NutriBodyFatPanel';
import NutriStructuredChartsPanel from '../../components/NutriStructuredChartsPanel';
import MetricSingleBarChartPanel from '../../components/MetricSingleBarChartPanel';
import NutriBatchMeasurementCards from '../../components/NutriBatchMeasurementCards';
import { defsWithChartData, pickDefaultMetricId } from '../../utils/metricChartSeries';
import { chartContentWrapStyle, useChartLayout } from '../../utils/chartLayout';
import {
  maskDateDDMMAAAA,
  displayDateToIsoCalendar,
  formatJsDateToDisplay,
} from '../../utils/dateDisplay';
import {
  ISAK_BASIC_PRESETS,
  ISAK_BONE_DIAMETER_PRESETS,
  ISAK_PERIMETER_PRESETS,
  ISAK_SKINFOLD_PRESETS,
  ISAK_RESTRICTED_METRIC_COUNT,
  NUTRI_AREA_LABELS,
  NUTRI_AREA_OPTS,
  NUTRI_MEASUREMENT_AREAS,
  NUTRITION_METRIC_PRESETS,
  canonicalMetricName,
  defsAlignedToPresets,
  isBasicArea,
  isBasicMetricName,
  isDiametroArea,
  isPerimetroArea,
  isPliegueArea,
  nutriAreaShortLabel,
  sortDefsByNutritionProtocol,
  sortDefsLikePresets,
} from '../../constants/nutritionMetrics';
import SearchableDropdown from '../../components/SearchableDropdown';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const MEJOR_DIR_OPTS = [
  { value: 'mayor_es_mejor', label: '↑ Mayor = mejor' },
  { value: 'menor_es_mejor', label: '↓ Menor = mejor' },
];

const AREA_LABELS = {
  ...NUTRI_AREA_LABELS,
  fisico: 'Físico',
};

const TABS = [
  { key: 'registrar', label: 'Registrar', icon: 'add-circle-outline' },
  { key: 'historial', label: 'Historial', icon: 'list-outline' },
  { key: 'grafico', label: 'Gráfico', icon: 'analytics-outline' },
];

function parseValor(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export default function CoachMeasurementScreen({ navigation, route }) {
  const { atletaId, atletaNombre, initialTab } = route.params || {};
  const { clubData } = useContext(ClubContext);
  const { metodoGrasaCorporal } = useContext(NutritionSettingsContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const measurementCacheKey =
    clubData?.urlIdentifier && atletaId
      ? `coach-measurement:${clubData.urlIdentifier}:${atletaId}`
      : '';

  const [activeTab, setActiveTab] = useState(
    () => (TABS.some((t) => t.key === initialTab) ? initialTab : 'registrar'),
  );
  const [searchHistorial, setSearchHistorial] = useState('');
  const [chartMetricId, setChartMetricId] = useState('');

  const [defs, setDefs] = useState(() => readScreenCache(measurementCacheKey)?.defs ?? []);
  const [mediciones, setMediciones] = useState(() => readScreenCache(measurementCacheKey)?.mediciones ?? []);
  const [myUserId, setMyUserId] = useState(() => readScreenCache(measurementCacheKey)?.myUserId ?? '');
  const [metrica, setMetrica] = useState('');
  const [valor, setValor] = useState('');
  const [notas, setNotas] = useState('');
  const [visibleParaAtleta, setVisibleParaAtleta] = useState(true);
  const [visibleParaTutor, setVisibleParaTutor] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewMetricForm, setShowNewMetricForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('cm');
  const [newMejorDir, setNewMejorDir] = useState('mayor_es_mejor');
  const [newMetricArea, setNewMetricArea] = useState('metodologia_isak');
  const [creating, setCreating] = useState(false);
  const [userRol, setUserRol] = useState(() => readScreenCache(measurementCacheKey)?.userRol ?? '');
  const [atletaMeta, setAtletaMeta] = useState(() => readScreenCache(measurementCacheKey)?.atletaMeta ?? null);
  const chartLayout = useChartLayout({ grouped: userRol === 'nutricionista' });
  const chartContentWrap = chartContentWrapStyle(chartLayout);
  const [editRow, setEditRow] = useState(null);
  const [editValor, setEditValor] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [editFechaDisplay, setEditFechaDisplay] = useState('');
  const [editVisAtleta, setEditVisAtleta] = useState(true);
  const [editVisTutor, setEditVisTutor] = useState(true);
  const [editSaving, setEditSaving] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: options.onCancel || closeAlert,
    });
  };

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const measurementAreas = useMemo(() => {
    if (userRol === 'nutricionista') return NUTRI_MEASUREMENT_AREAS;
    return ['fisico'];
  }, [userRol]);

  const historialMedidas = useMemo(
    () =>
      (Array.isArray(mediciones) ? mediciones : []).filter(
        (m) => m.metrica && measurementAreas.includes(m.metrica.area),
      ),
    [mediciones, measurementAreas],
  );

  const defsRegistrar = defs;
  const chartDefsGrafico = useMemo(
    () => defsWithChartData(historialMedidas, defs),
    [historialMedidas, defs],
  );

  const historialFiltered = useMemo(() => {
    const q = searchHistorial.trim().toLowerCase();
    if (!q) return historialMedidas;
    return historialMedidas.filter((m) => {
      const label = `${m.metrica?.nombre || ''} ${m.metrica?.unidad || ''}`.toLowerCase();
      return label.includes(q);
    });
  }, [historialMedidas, searchHistorial]);

  const chartMetricDef = useMemo(
    () => defs.find((d) => String(d._id) === String(chartMetricId)),
    [defs, chartMetricId],
  );

  useEffect(() => {
    if (userRol === 'nutricionista') return;
    if (defs.length === 0) {
      setChartMetricId('');
      return;
    }
    const withData = chartDefsGrafico.length ? chartDefsGrafico : defs;
    setChartMetricId((prev) => pickDefaultMetricId(withData, prev));
  }, [userRol, defs, chartDefsGrafico]);

  useEffect(() => {
    if (userRol !== 'nutricionista') return;
    const opt = NUTRI_AREA_OPTS.find((o) => o.value === newMetricArea);
    if (opt) setNewUnit(opt.defaultUnit);
  }, [userRol, newMetricArea]);

  const ensureIsakMetricDefs = useCallback(async (h, currentDefs) => {
    const existing = new Set(
      currentDefs.map((d) => `${d.area}::${canonicalMetricName(d.nombre)}`.toLowerCase()),
    );
    const canonNames = new Set(
      currentDefs.map((d) => canonicalMetricName(d.nombre).toLowerCase()),
    );
    let defs = [...currentDefs];
    for (const preset of NUTRITION_METRIC_PRESETS) {
      const key = `${preset.area}::${preset.nombre}`.toLowerCase();
      const canon = preset.nombre.toLowerCase();
      if (existing.has(key) || canonNames.has(canon)) continue;
      if (
        isBasicMetricName(preset.nombre) &&
        currentDefs.some(
          (d) => canonicalMetricName(d.nombre).toLowerCase() === preset.nombre.toLowerCase(),
        )
      ) {
        continue;
      }
      const { data } = await clubApi.post('/performance/metrics/definitions', preset, { headers: h });
      defs.push(data);
      existing.add(key);
      canonNames.add(canon);
    }
    return sortDefsByNutritionProtocol(defs);
  }, []);

  const fetchMeasurementData = useCallback(async () => {
    if (!clubData?.urlIdentifier || !atletaId) return {};
    const uid = await getToken('userId');
    const rol = (await getToken('userRol')) || '';
    const areas = rol === 'nutricionista' ? NUTRI_MEASUREMENT_AREAS : ['fisico'];
    const h = await headers();
    const [defsRes, perfRes] = await Promise.all([
      clubApi.get('/performance/metrics/definitions', { headers: h }),
      clubApi.get(`/performance/atleta/${atletaId}`, { headers: h }),
    ]);
    const raw = defsRes.data;
    const list = Array.isArray(raw)
      ? raw.filter(
          (d) => areas.includes(d.area) || (rol === 'nutricionista' && isBasicMetricName(d.nombre)),
        )
      : [];
    let finalDefs = rol === 'nutricionista' ? sortDefsByNutritionProtocol(list) : list;
    if (rol === 'nutricionista') {
      finalDefs = await ensureIsakMetricDefs(h, finalDefs);
    }
    const meds = perfRes.data?.mediciones;
    return {
      defs: finalDefs,
      mediciones: Array.isArray(meds) ? meds : [],
      atletaMeta: perfRes.data?.atleta || null,
      myUserId: uid ? String(uid) : '',
      userRol: rol,
    };
  }, [clubData?.urlIdentifier, atletaId, ensureIsakMetricDefs]);

  const applyMeasurementData = useCallback((data) => {
    setDefs(data.defs ?? []);
    setMediciones(data.mediciones ?? []);
    setAtletaMeta(data.atletaMeta ?? null);
    setMyUserId(data.myUserId ?? '');
    setUserRol(data.userRol ?? '');
    const ids = new Set((data.defs ?? []).map((d) => String(d._id)));
    setMetrica((prev) => (prev && ids.has(String(prev)) ? prev : data.defs?.[0]?._id || ''));
  }, []);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: measurementCacheKey,
    enabled: !!measurementCacheKey,
    fetchData: fetchMeasurementData,
    onFetched: applyMeasurementData,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los datos.');
    },
  });

  const showInitialLoader = loading && defs.length === 0 && mediciones.length === 0;

  const createDefinition = async () => {
    if (!newName.trim()) {
      showAlert('Atención', 'Poné un nombre para la métrica.');
      return;
    }
    setCreating(true);
    try {
      const h = await headers();
      const rolForArea = userRol || (await getToken('userRol')) || '';
      const areaPayload = rolForArea === 'nutricionista' ? newMetricArea : 'fisico';
      const { data } = await clubApi.post(
        '/performance/metrics/definitions',
        {
          nombre: newName.trim(),
          unidad: newUnit.trim() || 'u',
          mejorDireccion: newMejorDir,
          area: areaPayload,
        },
        { headers: h },
      );
      setDefs((prev) => [...prev, data].sort((a, b) => String(a.nombre).localeCompare(b.nombre)));
      setMetrica(data._id);
      setNewName('');
      setShowNewMetricForm(false);
      showAlert('Listo', 'Métrica creada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo crear.');
    } finally {
      setCreating(false);
    }
  };

  const fechaPayloadFromDisplay = (display) => {
    const ymd = displayDateToIsoCalendar(display);
    if (!ymd) return undefined;
    return `${ymd}T12:00:00`;
  };

  const submit = async () => {
    if (!atletaId || !metrica || valor === '') {
      showAlert('Faltan datos', 'Elegí métrica e ingresá un valor numérico.');
      return;
    }
    const num = parseValor(valor);
    if (Number.isNaN(num)) {
      showAlert('Valor inválido', 'Ingresá un número (podés usar coma o punto decimal).');
      return;
    }
    setSaving(true);
    try {
      const h = await headers();
      const body = {
        atleta: atletaId,
        metrica,
        valor: num,
        notasExtra: notas.trim() || undefined,
        visibleParaAtleta,
        visibleParaTutor,
      };
      await clubApi.post('/performance/measurements', body, { headers: h });
      setValor('');
      setNotas('');
      await reload({ background: true });
      showAlert('Listo', 'Medición guardada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (m) => {
    setEditRow(m);
    setEditValor(String(m.valor ?? ''));
    setEditNotas(m.notasExtra || '');
    setEditVisAtleta(m.visibleParaAtleta !== false);
    setEditVisTutor(m.visibleParaTutor !== false);
    const fd = m.fechaMedicion ? formatJsDateToDisplay(new Date(m.fechaMedicion)) : '';
    setEditFechaDisplay(fd);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const num = parseValor(editValor);
    if (Number.isNaN(num)) {
      showAlert('Valor inválido', 'Ingresá un número válido.');
      return;
    }
    const fechaIso = fechaPayloadFromDisplay(editFechaDisplay);
    setEditSaving(true);
    try {
      const h = await headers();
      const body = {
        valor: num,
        notasExtra: editNotas.trim() || undefined,
        visibleParaAtleta: editVisAtleta,
        visibleParaTutor: editVisTutor,
      };
      if (fechaIso) body.fechaMedicion = fechaIso;
      await clubApi.put(`/performance/measurements/${editRow._id}`, body, { headers: h });
      setEditRow(null);
      await reload({ background: true });
      showAlert('Listo', 'Medición actualizada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo actualizar.');
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = (m) => {
    showAlert('Quitar medición', '¿Querés borrar este registro?', {
      showCancel: true,
      isDanger: true,
      confirmText: 'Eliminar',
      onCancel: closeAlert,
      onConfirm: async () => {
        closeAlert();
        try {
          const h = await headers();
          await clubApi.delete(`/performance/measurements/${m._id}`, { headers: h });
          setEditRow(null);
          await reload({ background: true });
          showAlert('Listo', 'Medición eliminada.');
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        }
      },
    });
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
  ];

  const canEditMedicion = (m) => {
    if (userRol === 'nutricionista' || userRol === 'admin_club') return true;
    return myUserId && m.evaluador && String(m.evaluador._id) === String(myUserId);
  };

  const isNutri = userRol === 'nutricionista';
  const screenKicker = isNutri ? 'Nutrición' : 'Medición física';
  const screenTitle = isNutri ? 'Mediciones del atleta' : 'Valores y evolución';
  const screenSubtitle = isNutri
    ? `Perfil ISAK — ${ISAK_RESTRICTED_METRIC_COUNT} medidas`
    : atletaNombre || 'Atleta';
  const historialSectionTitle = isNutri ? 'Todas las mediciones' : 'Historial físico';
  const historialEmptyAll = isNutri
    ? 'Todavía no cargaste ninguna medición para este atleta.'
    : 'Todavía no hay mediciones físicas.';

  const defsBasicos = useMemo(
    () =>
      defsAlignedToPresets(
        defsRegistrar.filter((d) => isBasicArea(d.area) || isBasicMetricName(d.nombre)),
        ISAK_BASIC_PRESETS,
      ),
    [defsRegistrar],
  );
  const defsPliegues = useMemo(
    () => defsAlignedToPresets(defsRegistrar.filter((d) => isPliegueArea(d.area)), ISAK_SKINFOLD_PRESETS),
    [defsRegistrar],
  );
  const defsDiametros = useMemo(
    () =>
      defsAlignedToPresets(defsRegistrar.filter((d) => isDiametroArea(d.area)), ISAK_BONE_DIAMETER_PRESETS),
    [defsRegistrar],
  );
  const defsPerimetros = useMemo(
    () =>
      defsAlignedToPresets(defsRegistrar.filter((d) => isPerimetroArea(d.area)), ISAK_PERIMETER_PRESETS),
    [defsRegistrar],
  );

  const metricDropdownOptions = useMemo(
    () =>
      defsRegistrar.map((d) => ({
        value: d._id,
        label: isNutri
          ? `${d.nombre} (${d.unidad}) · ${nutriAreaShortLabel(d.area)}`
          : `${d.nombre} (${d.unidad})`,
      })),
    [defsRegistrar, isNutri],
  );

  const mejorDirDropdownOptions = useMemo(
    () => MEJOR_DIR_OPTS.map((opt) => ({ value: opt.value, label: opt.label })),
    [],
  );

  const renderSearchBox = (value, onChangeText, placeholder) => (
    <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="search" size={20} color={theme.icon} style={{ marginRight: 10 }} />
      <TextInput
        style={[styles.searchInput, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={22} color={theme.icon} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderHistorialCard = (m) => (
    <View
      key={m._id}
      style={[styles.histCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={styles.histTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.histMetric, { color: theme.text }]} numberOfLines={1}>
            {m.metrica?.nombre || 'Métrica'} ({m.metrica?.unidad || '—'})
          </Text>
          {isNutri && m.metrica?.area && AREA_LABELS[m.metrica.area] ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {AREA_LABELS[m.metrica.area]}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.histDate, { color: theme.textMuted }]}>
          {m.fechaMedicion ? formatJsDateToDisplay(new Date(m.fechaMedicion)) : '—'}
        </Text>
      </View>
      <Text style={[styles.histValor, { color: colorMarca }]}>{m.valor}</Text>
      {m.notasExtra ? (
        <Text style={[styles.histNotas, { color: theme.textMuted }]} numberOfLines={2}>
          {m.notasExtra}
        </Text>
      ) : null}
      <View style={styles.histMeta}>
        <View style={styles.visChip}>
          <Ionicons name="person-outline" size={14} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted, fontSize: 11, marginLeft: 4 }}>
            {m.evaluador?.nombre ? `${m.evaluador.nombre} ${m.evaluador.apellido || ''}`.trim() : 'Staff'}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          {m.visibleParaAtleta ? (
            <Text style={styles.badgeOk}>Atleta</Text>
          ) : (
            <Text style={[styles.badgeOff, { color: theme.textMuted }]}>Oculto atleta</Text>
          )}
          {m.visibleParaTutor ? (
            <Text style={styles.badgeOk}>Tutor</Text>
          ) : (
            <Text style={[styles.badgeOff, { color: theme.textMuted }]}>Oculto tutor</Text>
          )}
        </View>
      </View>
      {canEditMedicion(m) ? (
        <TouchableOpacity style={[styles.editLink, { borderColor: colorMarca }]} onPress={() => openEdit(m)}>
          <Text style={{ color: colorMarca, fontWeight: '700' }}>Editar o eliminar</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (!atletaId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <CoachScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          kicker="Medición"
          title="Registrar valor"
          subtitle="Sin atleta"
          onBack={() => navigation.goBack()}
        />
        <Text style={{ color: theme.textMuted, padding: 20 }}>No se recibió un atleta.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker={screenKicker}
        title={screenTitle}
        subtitle={isNutri ? `${atletaNombre || 'Atleta'} · ${screenSubtitle}` : screenSubtitle}
        onBack={() => navigation.goBack()}
      />

      <View style={[styles.tabBar, { backgroundColor: theme.background }]}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tabPill,
                {
                  borderColor: active ? colorMarca : theme.border,
                  backgroundColor: active ? colorMarca + '22' : theme.surface,
                },
              ]}
              onPress={() => setActiveTab(t.key)}
              activeOpacity={0.85}
            >
              <Ionicons name={t.icon} size={18} color={active ? colorMarca : theme.textMuted} />
              <Text style={[styles.tabPillText, { color: active ? colorMarca : theme.text }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <View style={styles.tabBody}>
          {activeTab === 'registrar' && (
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {isNutri ? (
                <NutriBatchMeasurementCards
                  atletaId={atletaId}
                  defsBasicos={defsBasicos}
                  defsPliegues={defsPliegues}
                  defsDiametros={defsDiametros}
                  defsPerimetros={defsPerimetros}
                  clubIdentifier={clubData?.urlIdentifier}
                  getHeaders={headers}
                  theme={theme}
                  colorMarca={colorMarca}
                  onSaved={() => reload({ background: true })}
                  showAlert={showAlert}
                />
              ) : null}

              {!isNutri ? (
                <>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Nueva medición</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Se guardará con la fecha de hoy ({formatJsDateToDisplay(new Date())}).
              </Text>

              <Text style={[styles.label, { color: theme.text }]}>Métrica</Text>
              {defs.length === 0 ? (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Creá una métrica con el botón de abajo para poder cargar valores.
                </Text>
              ) : (
                <View style={styles.dropdownWrap}>
                  <SearchableDropdown
                    data={metricDropdownOptions}
                    value={metrica}
                    onChange={setMetrica}
                    placeholder="Elegí una métrica…"
                    theme={theme}
                    colorMarca={colorMarca}
                  />
                </View>
              )}

              <Text style={[styles.label, { color: theme.text }]}>Valor medido</Text>
              <TextInput style={inputStyle} keyboardType="decimal-pad" value={valor} onChangeText={setValor} />

              <Text style={[styles.label, { color: theme.text }]}>Notas</Text>
              <TextInput
                style={[inputStyle, { minHeight: 72 }]}
                multiline
                value={notas}
                onChangeText={setNotas}
                placeholder="Opcional — contexto de la medición"
                placeholderTextColor={theme.textMuted}
              />

              <View style={[styles.switchRow, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text, flex: 1 }}>Visible para el atleta</Text>
                <Switch
                  value={visibleParaAtleta}
                  onValueChange={setVisibleParaAtleta}
                  trackColor={{ true: colorMarca + '88' }}
                />
              </View>
              <View style={[styles.switchRow, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text, flex: 1 }}>Visible para el tutor</Text>
                <Switch
                  value={visibleParaTutor}
                  onValueChange={setVisibleParaTutor}
                  trackColor={{ true: colorMarca + '88' }}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
                onPress={submit}
                disabled={saving || defs.length === 0}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Guardar medición</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.newMetricToggle, { borderColor: colorMarca, backgroundColor: theme.surface }]}
                onPress={() => setShowNewMetricForm((v) => !v)}
                activeOpacity={0.85}
              >
                <Ionicons name={showNewMetricForm ? 'remove-circle-outline' : 'add-circle-outline'} size={22} color={colorMarca} />
                <Text style={[styles.newMetricToggleTxt, { color: colorMarca }]}>
                  {showNewMetricForm ? 'Ocultar nueva métrica' : 'Nueva métrica'}
                </Text>
              </TouchableOpacity>

              {showNewMetricForm ? (
                <View style={[styles.newMetricPanel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.label, { color: theme.textMuted, marginTop: 0 }]}>
                    Definición del club (orientación para evolución en gráficos)
                  </Text>
                  <TextInput
                    style={inputStyle}
                    placeholder="Nombre ej. Altura de salto"
                    placeholderTextColor={theme.textMuted}
                    value={newName}
                    onChangeText={setNewName}
                  />
                  <TextInput
                    style={inputStyle}
                    placeholder="Unidad ej. cm, kg, seg"
                    placeholderTextColor={theme.textMuted}
                    value={newUnit}
                    onChangeText={setNewUnit}
                  />
                  <Text style={[styles.label, { color: theme.text }]}>Dirección “buena” en evolución</Text>
                  <View style={styles.dropdownWrap}>
                    <SearchableDropdown
                      data={mejorDirDropdownOptions}
                      value={newMejorDir}
                      onChange={setNewMejorDir}
                      placeholder="Elegí criterio de evolución…"
                      theme={theme}
                      colorMarca={colorMarca}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colorMarca }]}
                    onPress={createDefinition}
                    disabled={creating}
                  >
                    <Text style={{ color: colorMarca, fontWeight: '700' }}>
                      {creating ? 'Creando…' : 'Crear definición'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
                </>
              ) : null}
            </ScrollView>
          )}

          {activeTab === 'historial' && (
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
            >
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{historialSectionTitle}</Text>
              {renderSearchBox(searchHistorial, setSearchHistorial, 'Filtrar por métrica…')}
              <Text style={[styles.countHint, { color: theme.textMuted }]}>
                {historialFiltered.length} registro{historialFiltered.length === 1 ? '' : 's'}
                {searchHistorial.trim() ? ' (filtrado)' : ''}
              </Text>
              {historialFiltered.length === 0 ? (
                <Text style={[styles.emptyHist, { color: theme.textMuted }]}>
                  {historialMedidas.length === 0
                    ? historialEmptyAll
                    : 'Ningún resultado con este filtro.'}
                </Text>
              ) : (
                historialFiltered.slice(0, 80).map((m) => renderHistorialCard(m))
              )}
            </ScrollView>
          )}

          {activeTab === 'grafico' && (
            <ScrollView
              contentContainerStyle={[styles.scroll, chartContentWrap]}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {isNutri ? 'Evolución de medidas' : 'Evolución visual'}
              </Text>
              {isNutri ? (
                <>
                  <NutriBodyFatPanel
                    mediciones={historialMedidas}
                    defs={defs}
                    atleta={atletaMeta}
                    theme={theme}
                    colorMarca={colorMarca}
                    metodoGrasaCorporal={metodoGrasaCorporal}
                  />
                  {defs.length === 0 ? (
                    <Text style={[styles.hint, { color: theme.textMuted }]}>
                      Primero creá métricas en la pestaña Registrar.
                    </Text>
                  ) : (
                    <NutriStructuredChartsPanel
                      mediciones={historialMedidas}
                      defs={defs}
                      chartLayout={chartLayout}
                      theme={theme}
                      colorMarca={colorMarca}
                      emptyMessage={
                        historialMedidas.length === 0
                          ? 'Sin mediciones todavía — registrá un control en Registrar.'
                          : 'Todavía no hay mediciones para graficar.'
                      }
                    />
                  )}
                </>
              ) : defs.length === 0 ? (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Primero creá métricas en la pestaña Registrar.
                </Text>
              ) : (
                <>
                  {chartMetricDef?.mejorDireccion ? (
                    <Text style={[styles.chartHint, { color: theme.textMuted }]}>
                      {chartMetricDef.mejorDireccion === 'mayor_es_mejor'
                        ? 'Mejor evolución: valores más altos'
                        : 'Mejor evolución: valores más bajos'}
                    </Text>
                  ) : null}
                  <MetricSingleBarChartPanel
                    defs={chartDefsGrafico.length ? chartDefsGrafico : defs}
                    mediciones={historialMedidas}
                    chartMetricId={chartMetricId}
                    onChangeChartMetricId={setChartMetricId}
                    chartLayout={chartLayout}
                    theme={theme}
                    colorMarca={colorMarca}
                    emptyDefsMessage="Todavía no hay mediciones para graficar."
                  />
                </>
              )}
            </ScrollView>
          )}
        </View>
      )}

      <Modal visible={!!editRow} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Editar medición</Text>
              <TouchableOpacity onPress={() => setEditRow(null)}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
            </View>
            {editRow ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {editRow.metrica?.nombre} ({editRow.metrica?.unidad})
                </Text>
                <Text style={[styles.label, { color: theme.text }]}>Fecha (DD-MM-AAAA)</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="DD-MM-AAAA"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={editFechaDisplay}
                  onChangeText={(tx) => setEditFechaDisplay(maskDateDDMMAAAA(tx))}
                />
                <Text style={[styles.label, { color: theme.text }]}>Valor</Text>
                <TextInput
                  style={inputStyle}
                  keyboardType="decimal-pad"
                  value={editValor}
                  onChangeText={setEditValor}
                />
                <Text style={[styles.label, { color: theme.text }]}>Notas</Text>
                <TextInput
                  style={[inputStyle, { minHeight: 64 }]}
                  multiline
                  value={editNotas}
                  onChangeText={setEditNotas}
                  placeholderTextColor={theme.textMuted}
                />
                <View style={[styles.switchRow, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, flex: 1 }}>Visible atleta</Text>
                  <Switch value={editVisAtleta} onValueChange={setEditVisAtleta} trackColor={{ true: colorMarca + '88' }} />
                </View>
                <View style={[styles.switchRow, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, flex: 1 }}>Visible tutor</Text>
                  <Switch value={editVisTutor} onValueChange={setEditVisTutor} trackColor={{ true: colorMarca + '88' }} />
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
                  onPress={saveEdit}
                  disabled={editSaving}
                >
                  {editSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Guardar cambios</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteBtn, { borderColor: '#ef4444' }]}
                  onPress={() => confirmDelete(editRow)}
                  disabled={editSaving}
                >
                  <Text style={{ color: '#ef4444', fontWeight: '800' }}>Eliminar medición</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabPillText: { fontSize: 12, fontWeight: '700' },
  tabBody: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  avgBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
  },
  avgBannerLbl: { fontSize: 12, fontWeight: '600', width: '100%' },
  avgBannerVal: { fontSize: 26, fontWeight: '900' },
  avgBannerDate: { fontSize: 13, fontWeight: '600' },
  chartTitle: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  chartHint: { fontSize: 12, marginBottom: 4 },
  countHint: { fontSize: 12, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 10 },
  emptyHist: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  histCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  histTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  histMetric: { flex: 1, fontSize: 15, fontWeight: '700' },
  histDate: { fontSize: 12, fontWeight: '600' },
  histValor: { fontSize: 22, fontWeight: '800', marginTop: 6 },
  histNotas: { fontSize: 13, marginTop: 6 },
  histMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeRow: { flexDirection: 'row', gap: 8 },
  visChip: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  badgeOk: { fontSize: 11, fontWeight: '700', color: '#10b981' },
  badgeOff: { fontSize: 11, fontWeight: '600' },
  editLink: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  infoBody: { fontSize: 13, lineHeight: 20 },
  stepBlock: { flexDirection: 'row', gap: 12, marginBottom: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stepTitle: { fontSize: 16, fontWeight: '800' },
  stepSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  groupTitle: { fontSize: 15, fontWeight: '800' },
  groupSub: { fontSize: 12, marginTop: 2 },
  areaCard: {
    flex: 1,
    minWidth: '46%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  chipBadge: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  dirRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dirChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  secondaryBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 2, alignItems: 'center', marginTop: 4 },
  dropdownWrap: { marginBottom: 12 },
  newMetricToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  newMetricToggleTxt: { fontSize: 15, fontWeight: '800' },
  newMetricPanel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  deleteBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 12, borderWidth: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    paddingBottom: 36,
    maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
});
