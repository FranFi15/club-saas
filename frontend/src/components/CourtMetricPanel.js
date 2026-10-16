import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import CourtImageBoard from './CourtImageBoard';
import {
  courtBoardHeight,
  formatDuration,
  normalizeTipoMedicion,
  parseTimeInput,
  sanitizeTimeInput,
} from '../constants/courtMetrics';
import MeasurementLineChart from './MeasurementLineChart';
import FilterPillSheet from './FilterPillSheet';

function emptyDraft() {
  return { aciertos: '', intentos: '', tiempo: '', valorTotal: '' };
}

function draftHasAnyValue(d) {
  if (!d) return false;
  return Boolean(
    String(d.aciertos || '').trim() ||
      String(d.intentos || '').trim() ||
      String(d.tiempo || '').trim() ||
      String(d.valorTotal || '').trim(),
  );
}

function inputHintForTipo(tipoMedicion) {
  if (tipoMedicion === 'tiempo') return 'Ingresá el tiempo de cada punto (mm:ss.mmm)';
  if (tipoMedicion === 'total') return 'Ingresá el total de cada punto';
  return 'Ingresá aciertos e intentos de cada punto';
}

/**
 * Athlete/coach panel: session form + historial, optional clock, log results.
 * Both roles use the same inline inputs by tipoMedicion + "Finalizar sesión".
 */
export default function CourtMetricPanel({
  metric,
  atletaId,
  theme,
  primaryColor,
  getHeaders,
  canPickAthlete = false,
  isStaff = false,
}) {
  const athleteSession = true;
  const [mode, setMode] = useState('sesion');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clockOn, setClockOn] = useState(false);
  const [tick, setTick] = useState(0);
  const [clockEpoch, setClockEpoch] = useState(null);
  const [accumulatedSec, setAccumulatedSec] = useState(0);
  const [stoppedDurationSec, setStoppedDurationSec] = useState(null);
  const [usedClock, setUsedClock] = useState(false);
  const [pinModal, setPinModal] = useState(null);
  const [aciertos, setAciertos] = useState('');
  const [intentos, setIntentos] = useState('');
  const [tiempo, setTiempo] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [savingResult, setSavingResult] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [series, setSeries] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [chartPinId, setChartPinId] = useState(''); // '' = todos los puntos
  const [openChartFilter, setOpenChartFilter] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const startedAtRef = useRef(null);

  const pines = metric?.pines || [];
  const tipoMedicion = normalizeTipoMedicion(metric?.tipoMedicion);
  const isTiempo = tipoMedicion === 'tiempo';
  const isTotal = tipoMedicion === 'total';
  const cc = primaryColor || '#2563eb';

  useEffect(() => {
    const list = metric?.pines || [];
    setDrafts((prev) => {
      const next = {};
      for (const pin of list) {
        const id = String(pin._id);
        next[id] = prev[id] || emptyDraft();
      }
      return next;
    });
    // Default chart filter: first spot (clearer session-by-session view).
    if (list[0]?._id) {
      setChartPinId((prev) => prev || String(list[0]._id));
    } else {
      setChartPinId('');
    }
  }, [metric?._id, metric?.pines]);

  // When the metric type changes, wipe values so the correct inputs start empty.
  useEffect(() => {
    setDrafts((prev) => {
      const next = {};
      Object.keys(prev).forEach((id) => {
        next[id] = emptyDraft();
      });
      return next;
    });
    setAciertos('');
    setIntentos('');
    setTiempo('');
    setValorTotal('');
    setError('');
  }, [metric?._id, tipoMedicion]);

  useEffect(() => {
    if (!clockOn || !clockEpoch) return undefined;
    startedAtRef.current = clockEpoch;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [clockOn, clockEpoch]);

  const currentElapsedSec = useCallback(() => {
    if (clockOn && clockEpoch) {
      return accumulatedSec + Math.max(0, Math.round((Date.now() - clockEpoch) / 1000));
    }
    if (stoppedDurationSec != null) return stoppedDurationSec;
    return accumulatedSec;
  }, [clockOn, clockEpoch, accumulatedSec, stoppedDurationSec]);

  const elapsedLabel = useMemo(() => {
    void tick;
    return formatDuration(currentElapsedSec());
  }, [tick, currentElapsedSec]);

  const ensureRun = useCallback(
    async (conReloj = false) => {
      if (run && run.estado === 'en_curso') {
        if (conReloj && !run.usaReloj) {
          /* fall through */
        } else {
          return run;
        }
      }
      setBusy(true);
      setError('');
      try {
        const h = await getHeaders();
        const { data } = await clubApi.post(
          `/court-metrics/${metric._id}/runs`,
          { atletaId, conReloj },
          { headers: h },
        );
        setRun(data);
        if (data.usaReloj) setClockOn(true);
        return data;
      } catch (e) {
        setError(e.response?.data?.message || 'No se pudo iniciar.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [run, getHeaders, metric?._id, atletaId],
  );

  const startClock = async () => {
    const r = await ensureRun(true);
    if (!r) return;
    setUsedClock(true);
    setAccumulatedSec(0);
    setStoppedDurationSec(null);
    setClockEpoch(Date.now());
    setClockOn(true);
  };

  const resumeClock = async () => {
    let active = run;
    if (!active || active.estado !== 'en_curso') {
      active = await ensureRun(true);
      if (!active) return;
    }
    setUsedClock(true);
    setStoppedDurationSec(null);
    setClockEpoch(Date.now());
    setClockOn(true);
  };

  const stopClock = () => {
    if (clockOn && clockEpoch) {
      const total =
        accumulatedSec + Math.max(0, Math.round((Date.now() - clockEpoch) / 1000));
      setAccumulatedSec(total);
      setStoppedDurationSec(total);
    }
    setClockEpoch(null);
    setClockOn(false);
  };

  const finishRun = async (activeRun, { duracionSegundos } = {}) => {
    const target = activeRun || run;
    if (!target?._id) return null;
    const h = await getHeaders();
    const body = {};
    if (duracionSegundos != null && Number.isFinite(Number(duracionSegundos))) {
      body.duracionSegundos = Math.max(0, Math.round(Number(duracionSegundos)));
    }
    const { data } = await clubApi.patch(
      `/court-metrics/${metric._id}/runs/${target._id}/finish`,
      body,
      { headers: h },
    );
    setRun(data);
    setClockOn(false);
    setClockEpoch(null);
    setAccumulatedSec(0);
    setStoppedDurationSec(null);
    setUsedClock(false);
    return data;
  };

  const openPin = (pin) => {
    setPinModal(pin);
    setAciertos('');
    setIntentos('');
    setTiempo('');
    setValorTotal('');
  };

  const updateDraft = (pinId, patch) => {
    const id = String(pinId);
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyDraft()), ...patch },
    }));
  };

  const buildBodyFromDraft = (pinId, draft) => {
    if (isTiempo) {
      const t = parseTimeInput(draft.tiempo);
      if (t == null) return { error: `Tiempo inválido en un punto (usá mm:ss.mmm).` };
      return { body: { pinId, tiempoSegundos: t } };
    }
    if (isTotal) {
      const v = Number(String(draft.valorTotal).replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) return { error: 'Total inválido en un punto.' };
      return { body: { pinId, valorTotal: v } };
    }
    const a = Math.floor(Number(draft.aciertos));
    const i = Math.floor(Number(draft.intentos));
    if (!Number.isFinite(a) || !Number.isFinite(i) || i < 1 || a < 0 || a > i) {
      return { error: 'Revisá aciertos e intentos en los puntos cargados.' };
    }
    return { body: { pinId, aciertos: a, intentos: i } };
  };

  const submitResult = async () => {
    let body;
    if (isTiempo) {
      const t = parseTimeInput(tiempo);
      if (t == null) {
        setError('Indicá un tiempo válido (mm:ss.mmm).');
        return;
      }
      body = { pinId: pinModal._id, tiempoSegundos: t };
    } else if (isTotal) {
      const v = Number(String(valorTotal).replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) {
        setError('Indicá un total válido.');
        return;
      }
      body = { pinId: pinModal._id, valorTotal: v };
    } else {
      const a = Math.floor(Number(aciertos));
      const i = Math.floor(Number(intentos));
      if (!Number.isFinite(a) || !Number.isFinite(i) || i < 1 || a < 0 || a > i) {
        setError('Revisá aciertos e intentos.');
        return;
      }
      body = { pinId: pinModal._id, aciertos: a, intentos: i };
    }
    setSavingResult(true);
    setError('');
    try {
      let active = run;
      if (!active || active.estado !== 'en_curso') {
        active = await ensureRun(false);
      }
      if (!active?._id) return;
      const h = await getHeaders();
      await clubApi.post(`/court-metrics/${metric._id}/runs/${active._id}/results`, body, {
        headers: h,
      });
      setPinModal(null);
      await loadHistory();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSavingResult(false);
    }
  };

  const finalizeSession = async () => {
    setError('');
    setSuccessMsg('');
    const payloads = [];
    for (const pin of pines) {
      const id = String(pin._id);
      const draft = drafts[id] || emptyDraft();
      if (!draftHasAnyValue(draft)) continue;
      const built = buildBodyFromDraft(pin._id, draft);
      if (built.error) {
        setError(built.error);
        return;
      }
      payloads.push(built.body);
    }
    if (payloads.length === 0) {
      setError('Completá al menos un punto antes de finalizar.');
      return;
    }

    setFinalizing(true);
    try {
      let active = run;
      if (!active || active.estado !== 'en_curso') {
        active = await ensureRun(clockOn);
      }
      if (!active?._id) return;

      const h = await getHeaders();
      for (const body of payloads) {
        await clubApi.post(`/court-metrics/${metric._id}/runs/${active._id}/results`, body, {
          headers: h,
        });
      }
      const clockSecs = usedClock || clockOn || stoppedDurationSec != null ? currentElapsedSec() : null;
      await finishRun(active, { duracionSegundos: clockSecs });

      const cleared = {};
      for (const pin of pines) cleared[String(pin._id)] = emptyDraft();
      setDrafts(cleared);
      setSuccessMsg('Sesión guardada.');
      await loadHistory();
      setMode('historial');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo finalizar la sesión.');
    } finally {
      setFinalizing(false);
    }
  };

  const loadHistory = useCallback(async () => {
    if (!metric?._id || !atletaId) return;
    setLoadingHist(true);
    try {
      const h = await getHeaders();
      const [runsRes, seriesRes] = await Promise.all([
        clubApi.get(`/court-metrics/${metric._id}/runs`, {
          headers: h,
          params: { atleta: atletaId, limit: 30 },
        }),
        clubApi.get(`/court-metrics/${metric._id}/results/series`, {
          headers: h,
          params: { atleta: atletaId },
        }),
      ]);
      setRuns(runsRes.data?.runs || []);
      setSeries(seriesRes.data?.series || []);
    } catch {
      /* ignore */
    } finally {
      setLoadingHist(false);
    }
  }, [metric?._id, atletaId, getHeaders]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // When coach switches athlete, clear in-progress session drafts/clock.
  useEffect(() => {
    setRun(null);
    setClockOn(false);
    setClockEpoch(null);
    setAccumulatedSec(0);
    setStoppedDurationSec(null);
    setUsedClock(false);
    setError('');
    setSuccessMsg('');
    setMode('sesion');
    setDrafts((prev) => {
      const next = {};
      Object.keys(prev).forEach((id) => {
        next[id] = emptyDraft();
      });
      return next;
    });
  }, [atletaId]);

  const finishClockOnly = async () => {
    if (!run?._id) return;
    setBusy(true);
    setError('');
    try {
      await finishRun();
      await loadHistory();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo terminar.');
    } finally {
      setBusy(false);
    }
  };

  const pointValue = useCallback(
    (p) => {
      const val = isTiempo ? p.tiempoSegundos : isTotal ? p.valorTotal : p.porcentaje;
      const n = Number(val);
      return Number.isFinite(n) ? n : null;
    },
    [isTiempo, isTotal],
  );

  /** One point per saved session (run), optionally filtered by court spot. */
  const chartSeries = useMemo(() => {
    const rows = (series || []).filter((p) => {
      if (chartPinId && String(p.pinId) !== String(chartPinId)) return false;
      return pointValue(p) != null;
    });

    if (chartPinId) {
      // Selected spot: every session result for that pin.
      return rows
        .slice()
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .map((p, i) => ({
          t: p.fecha,
          value: Math.round(pointValue(p) * 10) / 10,
          label: `S${i + 1}`,
        }));
    }

    // All spots: one point per session (average, or sum for total).
    const byRun = new Map();
    for (const p of rows) {
      const rid = String(p.runId || p.run || `${p.fecha}-${p.pinId}`);
      const val = pointValue(p);
      if (val == null) continue;
      const prev = byRun.get(rid);
      if (!prev) {
        byRun.set(rid, { fecha: p.fecha, vals: [val] });
      } else {
        prev.vals.push(val);
        if (new Date(p.fecha) > new Date(prev.fecha)) prev.fecha = p.fecha;
      }
    }

    return [...byRun.values()]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .map((r, i) => {
        const agg = isTotal
          ? r.vals.reduce((s, v) => s + v, 0)
          : r.vals.reduce((s, v) => s + v, 0) / r.vals.length;
        return {
          t: r.fecha,
          value: Math.round(agg * 10) / 10,
          label: `S${i + 1}`,
        };
      });
  }, [series, chartPinId, pointValue, isTotal]);

  const progressHint = useMemo(() => {
    if (chartSeries.length < 2) {
      return chartSeries.length === 1 ? '1 sesión registrada' : '';
    }
    const first = chartSeries[0].value;
    const last = chartSeries[chartSeries.length - 1].value;
    const delta = Math.round((last - first) * 10) / 10;
    if (delta === 0) return `${chartSeries.length} sesiones · estable vs la primera`;
    const improved = isTiempo ? delta < 0 : delta > 0;
    const abs = Math.abs(delta);
    const unit = isTiempo ? 's' : isTotal ? '' : '%';
    const sign = delta > 0 ? '+' : '';
    return improved
      ? `${chartSeries.length} sesiones · mejora ${sign}${abs}${unit} vs la primera`
      : `${chartSeries.length} sesiones · ${sign}${abs}${unit} vs la primera`;
  }, [chartSeries, isTiempo, isTotal]);

  const chartWidth = Math.min(Dimensions.get('window').width - 48, 400);

  const selectedPinLabel = useMemo(() => {
    if (!chartPinId) return 'Todos los puntos';
    const pin = pines.find((p) => String(p._id) === String(chartPinId));
    return pin?.label || 'Punto';
  }, [chartPinId, pines]);

  const chartPinPills = useMemo(
    () => [
      {
        key: 'punto',
        placeholder: selectedPinLabel,
        value: chartPinId || '__all__',
        displayLabel: selectedPinLabel,
        searchable: pines.length > 6,
        options: [
          { value: '__all__', label: 'Todos los puntos' },
          ...pines.map((pin, idx) => ({
            value: String(pin._id),
            label: `${idx + 1}. ${pin.label}`,
          })),
        ],
        onChange: (v) => setChartPinId(!v || v === '__all__' ? '' : String(v)),
      },
    ],
    [chartPinId, selectedPinLabel, pines],
  );

  const renderProgressChart = (title = 'Tu progreso') => {
    return (
      <View
        style={[
          styles.progressBox,
          { borderColor: theme.border, backgroundColor: theme.surface },
        ]}
      >
        <Text style={[styles.sectionLbl, { color: theme.text, marginBottom: 4 }]}>{title}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
          {progressHint || 'Elegí un punto para ver cada sesión'}
        </Text>

        <Text style={[styles.fieldLbl, { color: theme.textMuted }]}>Punto en la cancha</Text>
        <FilterPillSheet
          pills={chartPinPills}
          openKey={openChartFilter}
          onOpen={setOpenChartFilter}
          onClose={() => setOpenChartFilter(null)}
          colorMarca={cc}
          theme={theme}
        />

        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8, marginBottom: 8 }}>
          Mostrando: {selectedPinLabel}
          {chartSeries.length ? ` · ${chartSeries.length} sesión${chartSeries.length === 1 ? '' : 'es'}` : ''}
        </Text>

        {chartSeries.length === 0 ? (
          <Text style={{ color: theme.textMuted, fontSize: 13, paddingVertical: 12 }}>
            Todavía no hay sesiones guardadas{chartPinId ? ' para este punto' : ''}.
          </Text>
        ) : (
          <MeasurementLineChart
            series={chartSeries}
            width={Math.min(chartWidth, Dimensions.get('window').width - 64)}
            height={200}
            color={cc}
            theme={theme}
            metricName={isTiempo ? 's' : isTotal ? 'tot' : '%'}
          />
        )}
      </View>
    );
  };

  const tabs = ['sesion', 'historial'];

  const onAthleteMapPin = (pin) => {
    // Jump focus: ensure draft exists; map is visual guide for the session form below.
    const id = String(pin?._id);
    if (!id) return;
    setDrafts((prev) => ({
      ...prev,
      [id]: prev[id] || emptyDraft(),
    }));
  };

  const renderPinInputs = (pin, draft, { compact = false } = {}) => {
    const inputStyle = [
      styles.input,
      compact && styles.inputCompact,
      { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
    ];
    if (isTiempo) {
      return (
        <View>
          <Text style={[styles.fieldLbl, { color: theme.textMuted }]}>Tiempo</Text>
          <TextInput
            style={inputStyle}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            value={draft.tiempo}
            onChangeText={(v) => updateDraft(pin._id, { tiempo: sanitizeTimeInput(v) })}
            placeholder="0:00.000"
            placeholderTextColor={theme.textMuted}
            maxLength={10}
          />
        </View>
      );
    }
    if (isTotal) {
      return (
        <View>
          <Text style={[styles.fieldLbl, { color: theme.textMuted }]}>Total</Text>
          <TextInput
            style={inputStyle}
            keyboardType="decimal-pad"
            value={draft.valorTotal}
            onChangeText={(v) => updateDraft(pin._id, { valorTotal: v })}
            placeholder="0"
            placeholderTextColor={theme.textMuted}
          />
        </View>
      );
    }
    return (
      <View style={styles.rowInputs}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.fieldLbl, { color: theme.textMuted }]}>Aciertos</Text>
          <TextInput
            style={inputStyle}
            keyboardType="number-pad"
            value={draft.aciertos}
            onChangeText={(v) => updateDraft(pin._id, { aciertos: v })}
            placeholder="0"
            placeholderTextColor={theme.textMuted}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLbl, { color: theme.textMuted }]}>Intentos</Text>
          <TextInput
            style={inputStyle}
            keyboardType="number-pad"
            value={draft.intentos}
            onChangeText={(v) => updateDraft(pin._id, { intentos: v })}
            placeholder="0"
            placeholderTextColor={theme.textMuted}
          />
        </View>
      </View>
    );
  };

  const filledCount = useMemo(
    () => pines.filter((p) => draftHasAnyValue(drafts[String(p._id)])).length,
    [pines, drafts],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        {tabs.map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.tab, mode === k && { backgroundColor: `${cc}22`, borderColor: cc }]}
            onPress={() => setMode(k)}
          >
            <Text style={{ color: mode === k ? cc : theme.textMuted, fontWeight: '700', fontSize: 13 }}>
              {k === 'mapa'
                ? 'Mapa'
                : k === 'lista'
                  ? 'Lista'
                  : k === 'sesion'
                    ? 'Sesión'
                    : 'Historial'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {(mode === 'sesion' || mode === 'mapa' || mode === 'lista') && (
        <View style={[styles.clockRow, { borderColor: theme.border }]}>
          {clockOn ? (
            <>
              <Ionicons name="timer-outline" size={20} color={cc} />
              <Text style={[styles.clockTxt, { color: theme.text }]}>{elapsedLabel}</Text>
              {athleteSession ? (
                <TouchableOpacity
                  style={[styles.clockBtn, { backgroundColor: '#ef4444' }]}
                  onPress={stopClock}
                  disabled={busy || finalizing}
                >
                  <Text style={styles.clockBtnTxt}>Detener</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.clockBtn, { backgroundColor: '#ef4444' }]}
                  onPress={finishClockOnly}
                  disabled={busy}
                >
                  <Text style={styles.clockBtnTxt}>Terminar</Text>
                </TouchableOpacity>
              )}
            </>
          ) : stoppedDurationSec != null ? (
            <>
              <Ionicons name="timer-outline" size={20} color={theme.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.clockTxt, { color: theme.text, fontSize: 20 }]}>{elapsedLabel}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '600' }}>
                  Reloj detenido
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.clockBtn, { backgroundColor: cc }]}
                onPress={resumeClock}
                disabled={busy || finalizing}
              >
                <Text style={styles.clockBtnTxt}>Reanudar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: theme.textMuted, fontSize: 13, flex: 1 }}>
                Reloj opcional para medir la duración total
              </Text>
              <TouchableOpacity
                style={[styles.clockBtn, { backgroundColor: cc }]}
                onPress={startClock}
                disabled={busy || finalizing}
              >
                <Text style={styles.clockBtnTxt}>Usar reloj</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {error ? (
        <Text style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>{error}</Text>
      ) : null}
      {successMsg ? (
        <Text style={{ color: '#16a34a', marginBottom: 8, fontSize: 13, fontWeight: '700' }}>
          {successMsg}
        </Text>
      ) : null}

      {mode === 'sesion' ? (
        <View>
          <CourtImageBoard
            imagenUrl={metric.imagenUrl}
            deporte={metric.deporte}
            pines={pines}
            theme={theme}
            primaryColor={cc}
            onPinPress={onAthleteMapPin}
            height={courtBoardHeight(metric?.deporte)}
          />
          <Text style={[styles.sectionLbl, { color: theme.text, marginTop: 14 }]}>
            Completá los puntos y finalizá la sesión
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
            {inputHintForTipo(tipoMedicion)}
          </Text>
          {pines.length === 0 ? (
            <Text style={{ color: theme.textMuted, paddingVertical: 12 }}>Sin puntos en la cancha.</Text>
          ) : (
            pines.map((pin, idx) => {
              const draft = drafts[String(pin._id)] || emptyDraft();
              return (
                <View
                  key={String(pin._id || idx)}
                  style={[styles.sessionCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <View style={styles.sessionHead}>
                    <View style={[styles.listBadge, { backgroundColor: cc }]}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '700' }}>{pin.label}</Text>
                      {pin.notas ? (
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                          {pin.notas}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {renderPinInputs(pin, draft, { compact: true })}
                </View>
              );
            })
          )}

          <TouchableOpacity
            style={[
              styles.finalizeBtn,
              { backgroundColor: cc, opacity: finalizing || pines.length === 0 ? 0.7 : 1 },
            ]}
            onPress={finalizeSession}
            disabled={finalizing || busy || pines.length === 0}
          >
            {finalizing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.finalizeBtnTxt}>
                  Finalizar sesión{filledCount > 0 ? ` (${filledCount})` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === 'mapa' ? (
        <CourtImageBoard
          imagenUrl={metric.imagenUrl}
          deporte={metric.deporte}
          pines={pines}
          theme={theme}
          primaryColor={cc}
          onPinPress={openPin}
          height={courtBoardHeight(metric?.deporte)}
        />
      ) : null}

      {mode === 'lista' ? (
        <ScrollView style={{ maxHeight: 320 }}>
          {pines.length === 0 ? (
            <Text style={{ color: theme.textMuted, padding: 12 }}>Sin puntos en la cancha.</Text>
          ) : (
            pines.map((pin, idx) => (
              <TouchableOpacity
                key={String(pin._id || idx)}
                style={[styles.listRow, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={() => openPin(pin)}
              >
                <View style={[styles.listBadge, { backgroundColor: cc }]}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{pin.label}</Text>
                  {pin.notas ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>{pin.notas}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.icon} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : null}

      {mode === 'historial' ? (
        <ScrollView style={{ maxHeight: 420 }}>
          {loadingHist ? <ActivityIndicator color={cc} style={{ marginVertical: 20 }} /> : null}
          {renderProgressChart(
            isTiempo ? 'Evolución del tiempo' : isTotal ? 'Evolución del total' : 'Evolución del %',
          )}
          {(runs || []).map((r) => (
            <View
              key={String(r._id)}
              style={[styles.runCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
            >
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {r.fecha || r.createdAt
                  ? new Date(r.finalizadoEn || r.createdAt).toLocaleString('es-AR')
                  : 'Entrenamiento'}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>
                {isTotal ? 'Suma' : 'Promedio'}:{' '}
                {isTiempo
                  ? r.tiempoPromedioSegundos != null
                    ? formatDuration(r.tiempoPromedioSegundos)
                    : '—'
                  : isTotal
                    ? r.totalSuma != null
                      ? String(r.totalSuma)
                      : '—'
                    : r.porcentajePromedio != null
                      ? `${r.porcentajePromedio}%`
                      : '—'}
                {r.usaReloj && r.duracionSegundos != null
                  ? ` · Reloj ${formatDuration(r.duracionSegundos)}`
                  : ''}
                {r.estado === 'en_curso' ? ' · En curso' : ''}
              </Text>
              {(r.resultados || []).slice(0, 6).map((res) => {
                const pin = pines.find((p) => String(p._id) === String(res.pinId));
                const detail = isTiempo
                  ? formatDuration(res.tiempoSegundos)
                  : isTotal
                    ? String(res.valorTotal ?? '—')
                    : `${res.aciertos}/${res.intentos} (${res.porcentaje}%)`;
                return (
                  <Text key={String(res._id)} style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    · {pin?.label || 'Punto'}: {detail}
                  </Text>
                );
              })}
            </View>
          ))}
          {!loadingHist && !runs.length ? (
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>
              Todavía no hay registros.
            </Text>
          ) : null}
        </ScrollView>
      ) : null}

      {isStaff && canPickAthlete ? null : null}

      <Modal visible={!!pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{pinModal?.label}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
              {inputHintForTipo(tipoMedicion)}
            </Text>
            {isTiempo ? (
              <View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Tiempo</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  value={tiempo}
                  onChangeText={(v) => setTiempo(sanitizeTimeInput(v))}
                  placeholder="0:00.000"
                  placeholderTextColor={theme.textMuted}
                  maxLength={10}
                />
              </View>
            ) : isTotal ? (
              <View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Total</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                  keyboardType="decimal-pad"
                  value={valorTotal}
                  onChangeText={setValorTotal}
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
            ) : (
              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Aciertos</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                    keyboardType="number-pad"
                    value={aciertos}
                    onChangeText={setAciertos}
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Intentos</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                    keyboardType="number-pad"
                    value={intentos}
                    onChangeText={setIntentos}
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setPinModal(null)} style={{ marginRight: 16 }}>
                <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitResult} disabled={savingResult}>
                {savingResult ? (
                  <ActivityIndicator color={cc} />
                ) : (
                  <Text style={{ color: cc, fontWeight: '800' }}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clockTxt: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], flex: 1 },
  clockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  clockBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  listBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  sessionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  sessionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  fieldLbl: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  finalizeBtn: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  finalizeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sectionLbl: { fontWeight: '800', fontSize: 14, marginBottom: 8 },
  runCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 14, padding: 18 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  rowInputs: { flexDirection: 'row' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputCompact: {
    paddingVertical: 8,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    alignItems: 'center',
  },
});
