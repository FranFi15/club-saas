import React, { useContext, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { displayDateToIsoCalendar, isoCalendarDateToDisplay, maskDateDDMMAAAA } from '../../utils/dateDisplay';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import { sessionDisplayName, sessionEsOpcional, sessionTipoLabel, consultaConfirmacionEstado, consultaConfirmacionLabel } from '../../utils/sessionDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const ASIST_OPTS = [
  { key: 'presente', label: 'Presente' },
  { key: 'tarde', label: 'Tarde' },
  { key: 'ausente', label: 'Ausente' },
];

/** Alineado con `training.model.js` → bloques[].enfoque */
const ENFOQUE_OPTS = [
  { key: 'ofensivo', label: 'Ofensivo' },
  { key: 'defensivo', label: 'Defensivo' },
  { key: 'transicion_ataque', label: 'Tr. ataque' },
  { key: 'transicion_defensa', label: 'Tr. defensa' },
  { key: 'fisico', label: 'Físico' },
  { key: 'tecnico', label: 'Técnico' },
  { key: 'neutro', label: 'Neutro' },
];

function emptyDraftBlock() {
  return {
    tituloBloque: '',
    formato: 'General',
    enfoque: 'neutro',
    duracionMinutos: '15',
    descripcionDetallada: '',
  };
}

export default function CoachSessionDetailScreen({ navigation, route }) {
  const sessionId = route.params?.sessionId;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const sessionCacheKey =
    clubData?.urlIdentifier && sessionId
      ? `coach-session-detail:${clubData.urlIdentifier}:${sessionId}`
      : '';

  const cachedSession = readScreenCache(sessionCacheKey);
  const [saving, setSaving] = useState(false);
  const [restoringHome, setRestoringHome] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [session, setSession] = useState(() => cachedSession?.session ?? null);
  const [roster, setRoster] = useState(() => cachedSession?.roster ?? []);
  const [attendance, setAttendance] = useState(() => cachedSession?.attendance ?? {});
  /** Atletas con wellness pre cargado hoy (ids como string). */
  const [wellnessPreDoneToday, setWellnessPreDoneToday] = useState(
    () => new Set(cachedSession?.wellnessPreDoneToday ?? []),
  );
  const [executedBlocks, setExecutedBlocks] = useState(() => cachedSession?.executedBlocks ?? []);
  const [draftBlocks, setDraftBlocks] = useState([emptyDraftBlock()]);
  const [planNombre, setPlanNombre] = useState(() => cachedSession?.planNombre ?? '');
  const [planObjetivo, setPlanObjetivo] = useState(() => cachedSession?.planObjetivo ?? '');
  const [editingPlanDraft, setEditingPlanDraft] = useState(false);
  const [selectedTimerIndex, setSelectedTimerIndex] = useState(0);
  const [timerStartedAt, setTimerStartedAt] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const tickRef = useRef(null);

  const [detailTab, setDetailTab] = useState('checkin');
  const [spaces, setSpaces] = useState(() => cachedSession?.spaces ?? []);
  const [freeSpaces, setFreeSpaces] = useState(() => cachedSession?.freeSpaces ?? []);
  const [editFecha, setEditFecha] = useState('');
  const [editHoraInicio, setEditHoraInicio] = useState('');
  const [editHoraFin, setEditHoraFin] = useState('');
  const [editEspacioId, setEditEspacioId] = useState('');
  const [editLugarExterno, setEditLugarExterno] = useState('');
  const [editLugarLibre, setEditLugarLibre] = useState('');
  const [editInformeSesion, setEditInformeSesion] = useState('');
  const [editInformeVisAtleta, setEditInformeVisAtleta] = useState(true);
  const [editInformeVisTutor, setEditInformeVisTutor] = useState(true);
  const [savingPsychVis, setSavingPsychVis] = useState(false);
  const [savingSessionMeta, setSavingSessionMeta] = useState(false);
  const [reopeningSession, setReopeningSession] = useState(false);
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

  const showAlert = (title, message, opts = {}) => {
    const {
      showCancel = false,
      isDanger = false,
      confirmText = 'Aceptar',
      cancelText = 'Cancelar',
      onConfirm,
      onCancel,
    } = opts;
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel,
      isDanger,
      confirmText,
      cancelText,
      onConfirm: () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        onConfirm?.();
      },
      onCancel: () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        onCancel?.();
      },
    });
  };

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const buildSessionPayload = useCallback((sess, freeSpaceList, athletes, wellnessToday) => {
    const donePre = new Set();
    (wellnessToday || []).forEach((w) => {
      if (w.tipo !== 'pre') return;
      const aid = w.atleta?._id || w.atleta;
      if (aid) donePre.add(String(aid));
    });

    const map = {};
    (sess.asistencia || []).forEach((row) => {
      const id = row.atleta?._id || row.atleta;
      if (id) map[id] = row.estado || 'ausente';
    });
    athletes.forEach((a) => {
      const id = a._id;
      if (map[id] == null) map[id] = 'presente';
    });

    const plan = sess.planEntrenamiento;
    const ejecutados = sess.bloquesEjecutados || [];
    let nextExecutedBlocks = [];
    if (plan?.bloques?.length) {
      nextExecutedBlocks = plan.bloques.map((b, i) => {
        const ex = ejecutados[i];
        return {
          tituloBloque: b.tituloBloque,
          formato: b.formato,
          enfoque: b.enfoque,
          duracionPlanificada: b.duracionMinutos,
          duracionRealMinutos: ex?.duracionRealMinutos ?? 0,
        };
      });
    } else if (Array.isArray(ejecutados) && ejecutados.length) {
      nextExecutedBlocks = ejecutados.map((b) => ({
        tituloBloque: b.tituloBloque || 'Bloque',
        formato: b.formato || '',
        enfoque: b.enfoque || '',
        duracionPlanificada: b.duracionPlanificada || 0,
        duracionRealMinutos: b.duracionRealMinutos || 0,
      }));
    }

    const defaultNombre =
      sess.tipo === 'partido'
        ? `Partido ${sess.categoria?.nombre || ''} ${isoCalendarDateToDisplay(sess.fecha)}`.trim()
        : `Entreno ${sess.categoria?.nombre || ''} ${isoCalendarDateToDisplay(sess.fecha)}`.trim();

    return {
      session: sess,
      spaces: freeSpaceList || [],
      freeSpaces: freeSpaceList || [],
      roster: athletes,
      wellnessPreDoneToday: [...donePre],
      attendance: map,
      executedBlocks: nextExecutedBlocks,
      planNombre: plan?._id ? plan.nombre || defaultNombre : defaultNombre,
      planObjetivo: plan?._id ? plan.objetivoSesion || '' : '',
      preservePlanNombre: !!(plan?._id),
    };
  }, []);

  const applySessionData = useCallback((data) => {
    if (!data?.session) return;
    setSession(data.session);
    setSpaces(data.spaces ?? []);
    setFreeSpaces(data.freeSpaces ?? []);
    setRoster(data.roster ?? []);
    setWellnessPreDoneToday(new Set(data.wellnessPreDoneToday ?? []));
    setAttendance(data.attendance ?? {});
    setExecutedBlocks(data.executedBlocks ?? []);
    if (data.preservePlanNombre) {
      setPlanNombre(data.planNombre ?? '');
      setPlanObjetivo(data.planObjetivo ?? '');
    } else {
      setPlanNombre((n) => (n.trim() ? n : data.planNombre ?? ''));
      setPlanObjetivo(data.planObjetivo ?? '');
    }
  }, []);

  const fetchSessionData = useCallback(async () => {
    if (!sessionId) return null;
    const h = await headers();
    const { data: sess } = await clubApi.get(`/sessions/${sessionId}`, { headers: h });
    const catId = sess.categoria?._id || sess.categoria;

    let espaciosLibres = [];
    const isConsulta = sess.tipo === 'consulta_nutricion' || sess.tipo === 'consulta_psicologia';
    if (!isConsulta && sess.fecha && sess.horaInicio && sess.horaFin) {
      try {
        const { data: freeData } = await clubApi.get('/spaces/libres', {
          headers: h,
          params: {
            fecha: sess.fecha,
            horaInicio: sess.horaInicio,
            horaFin: sess.horaFin,
            excludeSessionId: sessionId,
          },
        });
        espaciosLibres = freeData.espaciosLibres || [];
      } catch {
        espaciosLibres = [];
      }
    }

    const { data: enrollments } = await clubApi.get(`/enrollments/categoria/${catId}`, { headers: h });
    let athletes = enrollments.map((e) => e.atleta).filter(Boolean);
    if (sess.tipo === 'consulta_nutricion' || sess.tipo === 'consulta_psicologia') {
      const ind = sess.atletaIndividual;
      if (ind && typeof ind === 'object') {
        athletes = [ind];
      } else if (ind) {
        const found = athletes.find((a) => String(a._id) === String(ind));
        athletes = found ? [found] : athletes;
      }
    }

    let wellnessToday = [];
    if (catId) {
      try {
        const { data } = await clubApi.get(`/wellness/equipo/${catId}`, { headers: h });
        wellnessToday = data || [];
      } catch {
        /* sin bloquear check-in */
      }
    }

    return buildSessionPayload(sess, espaciosLibres, athletes, wellnessToday);
  }, [sessionId, clubData?.urlIdentifier, buildSessionPayload]);

  const { loading, reload } = useCachedFocusLoad({
    cacheKey: sessionCacheKey,
    enabled: !!sessionCacheKey,
    fetchData: fetchSessionData,
    onFetched: applySessionData,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la sesión.');
    },
  });

  const showInitialLoader = loading && !session;

  useEffect(() => {
    if (!session) return;
    try {
      const raw = String(session.fecha || '').split('T')[0];
      setEditFecha(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? isoCalendarDateToDisplay(raw) : '');
    } catch {
      setEditFecha('');
    }
    setEditHoraInicio(session.horaInicio || '');
    setEditHoraFin(session.horaFin || '');
    const esp = session.espacio;
    setEditEspacioId(esp && typeof esp === 'object' ? esp._id : esp || '');
    setEditLugarExterno(session.lugarExterno || '');
    setEditLugarLibre(session.lugarLibre || '');
    setEditInformeSesion(session.informeSesion || '');
    setEditInformeVisAtleta(session.informeVisibleParaAtleta !== false);
    setEditInformeVisTutor(session.informeVisibleParaTutor !== false);
  }, [
    session?._id,
    session?.fecha,
    session?.horaInicio,
    session?.horaFin,
    session?.espacio,
    session?.lugarExterno,
    session?.lugarLibre,
    session?.informeSesion,
    session?.informeVisibleParaAtleta,
    session?.informeVisibleParaTutor,
  ]);

  useEffect(() => {
    if (!sessionId || !session) return;
    if (session.tipo === 'consulta_nutricion' || session.tipo === 'consulta_psicologia') return;

    const fechaIso = displayDateToIsoCalendar(editFecha);
    if (!fechaIso || !editHoraInicio || !editHoraFin) return;

    let cancelled = false;
    (async () => {
      try {
        const h = await headers();
        const { data } = await clubApi.get('/spaces/libres', {
          headers: h,
          params: {
            fecha: new Date(`${fechaIso}T12:00:00.000Z`).toISOString(),
            horaInicio: editHoraInicio,
            horaFin: editHoraFin,
            excludeSessionId: sessionId,
          },
        });
        if (!cancelled) {
          const list = data.espaciosLibres || [];
          setFreeSpaces(list);
          setSpaces(list);
        }
      } catch {
        if (!cancelled) {
          setFreeSpaces([]);
          setSpaces([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, session?._id, session?.tipo, editFecha, editHoraInicio, editHoraFin, clubData?.urlIdentifier]);

  useEffect(() => {
    if (timerStartedAt == null) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - timerStartedAt) / 1000));
    }, 500);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [timerStartedAt]);

  useEffect(() => {
    if (selectedTimerIndex >= executedBlocks.length && executedBlocks.length > 0) {
      setSelectedTimerIndex(executedBlocks.length - 1);
    }
  }, [executedBlocks.length, selectedTimerIndex]);

  const completed = session?.estado === 'completada';
  const needsRelocation = Boolean(session?.reubicacionPendiente);
  const canRestoreHome = useMemo(() => {
    if (!session?.espacioSuspendido || session.reubicacionPendiente || completed) return false;
    if (session.espacioSuspendido.estado && session.espacioSuspendido.estado !== 'disponible') return false;
    const homeId = String(session.espacioSuspendido._id || session.espacioSuspendido);
    const currentId = session.espacio?._id || session.espacio;
    const hasExterno = Boolean((session.lugarExterno || '').trim());
    if (hasExterno) return true;
    if (!currentId) return true;
    return String(currentId) !== homeId;
  }, [session, completed]);
  const availableSpaces = useMemo(() => freeSpaces, [freeSpaces]);
  const plan = session?.planEntrenamiento;
  const hasPlan = !!(plan?.bloques?.length > 0);

  const restoreHomeSpace = async () => {
    if (!sessionId || !canRestoreHome) return;
    setRestoringHome(true);
    try {
      const h = await headers();
      await clubApi.patch('/sessions/restauracion/bulk', { sessionIds: [sessionId] }, { headers: h });
      await reload({ background: true });
      showAlert('Listo', `La sesión volvió a ${session.espacioSuspendido?.nombre || 'su espacio original'}.`);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo restaurar el espacio.');
    } finally {
      setRestoringHome(false);
    }
  };

  const saveAttendance = async () => {
    if (!sessionId || completed) return;
    setSaving(true);
    try {
      const h = await headers();
      const asistencia = roster.map((a) => ({
        atleta: a._id,
        estado: attendance[a._id] || 'ausente',
        observaciones: '',
      }));
      await clubApi.put(`/sessions/${sessionId}/asistencia`, { asistencia, estado: session?.estado || 'programada' }, { headers: h });
      await reload({ background: true });
      showAlert('Listo', 'Asistencia guardada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const startEditingPlan = () => {
    const bloques = plan?.bloques || [];
    if (!bloques.length) {
      setDraftBlocks([emptyDraftBlock()]);
      setEditingPlanDraft(true);
      return;
    }
    setDraftBlocks(
      bloques.map((b) => ({
        tituloBloque: b.tituloBloque || '',
        formato: b.formato || 'General',
        enfoque: b.enfoque || 'neutro',
        duracionMinutos: String(b.duracionMinutos ?? 15),
        descripcionDetallada: b.descripcionDetallada || '',
      })),
    );
    setPlanNombre(plan.nombre || planNombre);
    setPlanObjetivo(plan.objetivoSesion || '');
    setEditingPlanDraft(true);
  };

  const cancelEditingPlan = () => {
    setEditingPlanDraft(false);
    reload({ background: true });
  };

  const persistTrainingPlan = async () => {
    if (!sessionId || completed) return;
    for (let i = 0; i < draftBlocks.length; i++) {
      const d = draftBlocks[i];
      if (!d.tituloBloque?.trim()) {
        showAlert('Revisá el plan', `El bloque ${i + 1} necesita un título.`);
        return;
      }
      const mins = Number(d.duracionMinutos);
      if (!mins || mins <= 0) {
        showAlert('Revisá el plan', `El bloque "${d.tituloBloque.trim()}" necesita duración en minutos (> 0).`);
        return;
      }
    }
    if (draftBlocks.length === 0) {
      showAlert('Plan vacío', 'Agregá al menos un bloque de entrenamiento.');
      return;
    }

    setSavingPlan(true);
    try {
      const h = await headers();
      const disc = session.categoria?.disciplina;
      const disciplineId = disc && typeof disc === 'object' ? disc._id : disc;

      const bloquesPayload = draftBlocks.map((d) => ({
        tituloBloque: d.tituloBloque.trim(),
        formato: (d.formato || 'General').trim(),
        enfoque: d.enfoque,
        duracionMinutos: Number(d.duracionMinutos),
        descripcionDetallada: d.descripcionDetallada?.trim() || undefined,
      }));

      const { data: created } = await clubApi.post(
        '/training/plans',
        {
          nombre: (planNombre || `Plan ${isoCalendarDateToDisplay(session.fecha)}`).trim(),
          ...(disciplineId ? { disciplina: disciplineId } : {}),
          objetivoSesion: planObjetivo.trim() || undefined,
          bloques: bloquesPayload,
        },
        { headers: h },
      );

      await clubApi.patch(`/sessions/${sessionId}/plan`, { planEntrenamiento: created._id }, { headers: h });
      setEditingPlanDraft(false);
      setSelectedTimerIndex(0);
      await reload({ background: true });
      showAlert('Listo', 'Plan guardado y vinculado a la sesión. Ya podés usar el cronómetro por bloque.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const updateDraft = (index, field, value) => {
    setDraftBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const startTimer = () => {
    if (completed || !hasPlan || editingPlanDraft || executedBlocks.length === 0) return;
    setTimerStartedAt(Date.now());
    setElapsedSec(0);
  };

  const stopTimerAndAssign = () => {
    if (timerStartedAt == null || completed) return;
    const minutes = Math.max(1, Math.round(elapsedSec / 60) || 1);
    const idx = Math.min(selectedTimerIndex, Math.max(0, executedBlocks.length - 1));
    setExecutedBlocks((prev) => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = { ...next[idx], duracionRealMinutos: minutes };
      }
      return next;
    });
    setTimerStartedAt(null);
    setElapsedSec(0);
  };

  const setRealMinutesAt = (index, text) => {
    const n = parseInt(text.replace(/\D/g, ''), 10);
    const val = Number.isFinite(n) && n >= 0 ? n : 0;
    setExecutedBlocks((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], duracionRealMinutos: val };
      return next;
    });
  };

  const saveSessionMeta = async () => {
    if (!sessionId || completed) return;
    const fechaIso = displayDateToIsoCalendar(editFecha);
    if (!fechaIso) {
      showAlert('Fecha inválida', 'Usá el formato DD-MM-AAAA con día y mes válidos.');
      return;
    }
    if (!isValidTimeHHMM(editHoraInicio) || !isValidTimeHHMM(editHoraFin)) {
      showAlert('Horario inválido', 'Usá HH:MM en 24 h (ej. 18:00 y 19:30).');
      return;
    }
    if (session.tipo === 'consulta_nutricion' || session.tipo === 'consulta_psicologia') {
      setSavingSessionMeta(true);
      try {
        const h = await headers();
        const payload = {
          nuevaFecha: new Date(`${fechaIso}T12:00:00.000Z`).toISOString(),
          nuevaHoraInicio: editHoraInicio,
          nuevaHoraFin: editHoraFin,
          nuevoLugarLibre: editLugarLibre.trim(),
        };
        if (session.tipo === 'consulta_psicologia') {
          payload.informeSesion = editInformeSesion;
          payload.informeVisibleParaAtleta = editInformeVisAtleta;
          payload.informeVisibleParaTutor = editInformeVisTutor;
        }
        await clubApi.patch(`/sessions/${sessionId}/reprogramar`, payload, { headers: h });
        await reload({ background: true });
        showAlert('Listo', 'Datos de la consulta actualizados.');
      } catch (e) {
        showAlert('Error', e.response?.data?.message || 'No se pudo actualizar.');
      } finally {
        setSavingSessionMeta(false);
      }
      return;
    }
    const usandoLugarExterno = Boolean((session.lugarExterno || '').trim());
    const needsRelocation = Boolean(session.reubicacionPendiente);
    const payload = {
      nuevaFecha: new Date(`${fechaIso}T12:00:00.000Z`).toISOString(),
      nuevaHoraInicio: editHoraInicio,
      nuevaHoraFin: editHoraFin,
    };
    if (needsRelocation) {
      const ext = (editLugarExterno || '').trim();
      if (ext.length >= 3) {
        payload.lugarExterno = ext;
      } else if (editEspacioId) {
        payload.nuevoEspacioId = editEspacioId;
      } else {
        showAlert('Lugar', 'Elegí un espacio del club o escribí una sede externa (mín. 3 caracteres).');
        return;
      }
    } else if (usandoLugarExterno) {
      const t = (editLugarExterno || '').trim();
      if (t.length < 3) {
        showAlert('Sede', 'Escribí dónde se juega (al menos 3 caracteres).');
        return;
      }
      payload.lugarExterno = t;
    } else {
      if (!editEspacioId) {
        showAlert('Espacio', 'Elegí un espacio del club.');
        return;
      }
      payload.nuevoEspacioId = editEspacioId;
    }

    setSavingSessionMeta(true);
    try {
      const h = await headers();
      await clubApi.patch(`/sessions/${sessionId}/reprogramar`, payload, { headers: h });
      await reload({ background: true });
      showAlert('Listo', 'Datos de la sesión actualizados.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo actualizar la sesión.');
    } finally {
      setSavingSessionMeta(false);
    }
  };

  const savePsychInformeVisibility = async () => {
    if (!sessionId || session?.tipo !== 'consulta_psicologia') return;
    setSavingPsychVis(true);
    try {
      const h = await headers();
      await clubApi.patch(
        `/sessions/${sessionId}/reprogramar`,
        {
          informeVisibleParaAtleta: editInformeVisAtleta,
          informeVisibleParaTutor: editInformeVisTutor,
        },
        { headers: h },
      );
      await reload({ background: true });
      showAlert('Listo', 'Visibilidad del informe actualizada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSavingPsychVis(false);
    }
  };

  const confirmReopenSession = () => {
    showAlert(
      'Reabrir sesión',
      'La sesión volverá a estar abierta y se borrarán los tiempos por bloque. Se mantienen el plan de entrenamiento y la asistencia. ¿Continuar?',
      {
        showCancel: true,
        onConfirm: () => {
          (async () => {
            setReopeningSession(true);
            try {
              const h = await headers();
              await clubApi.patch(`/sessions/${sessionId}/reopen`, {}, { headers: h });
              await reload({ background: true });
              setDetailTab((prev) =>
                session?.tipo === 'consulta_nutricion' || session?.tipo === 'consulta_psicologia' ? prev : 'entreno',
              );
              showAlert('Listo', 'Sesión reabierta. Podés corregir horarios y cronometrar de nuevo.');
            } catch (e) {
              showAlert('Error', e.response?.data?.message || 'No se pudo reabrir.');
            } finally {
              setReopeningSession(false);
            }
          })();
        },
      },
    );
  };

  const finishTraining = () => {
    if (completed) return;
    showAlert('Finalizar', '¿Guardar tiempos por bloque y marcar la sesión como completada?', {
      showCancel: true,
      onConfirm: () => {
        (async () => {
          try {
            const h = await headers();
            await clubApi.patch(`/sessions/${sessionId}/finish`, { bloquesEjecutados: executedBlocks }, { headers: h });
            await reload({ background: true });
            showAlert('Listo', 'Sesión finalizada. Podés ver el resumen abajo.');
          } catch (e) {
            showAlert('Error', e.response?.data?.message || 'No se pudo finalizar.');
          }
        })();
      },
    });
  };

  const totalPlanMin = executedBlocks.reduce((acc, b) => acc + (Number(b.duracionPlanificada) || 0), 0);
  const totalRealMin = executedBlocks.reduce((acc, b) => acc + (Number(b.duracionRealMinutos) || 0), 0);

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];
  const timerLocked = timerStartedAt != null;

  if (!session) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ActivityIndicator color={colorMarca} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const isConsultaNutricion = session.tipo === 'consulta_nutricion';
  const isConsultaPsicologia = session.tipo === 'consulta_psicologia';

  if (isConsultaNutricion || isConsultaPsicologia) {
    const atleta = session.atletaIndividual;
    const nombreAtleta =
      atleta && typeof atleta === 'object'
        ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim()
        : 'Atleta';
    const lugarLine = (session.lugarLibre || '').trim() || 'Sin lugar indicado';
    const confirmEstado = consultaConfirmacionEstado(session);

    const finishConsulta = () => {
      if (completed) return;
      showAlert('Finalizar', '¿Marcar esta consulta como realizada?', {
        showCancel: true,
        onConfirm: () => {
          (async () => {
            try {
              const h = await headers();
              const body = { bloquesEjecutados: [] };
              if (isConsultaPsicologia) {
                body.informeSesion = editInformeSesion;
                body.informeVisibleParaAtleta = editInformeVisAtleta;
                body.informeVisibleParaTutor = editInformeVisTutor;
              }
              await clubApi.patch(`/sessions/${sessionId}/finish`, body, { headers: h });
              await reload({ background: true });
              showAlert('Listo', 'Consulta cerrada.');
            } catch (e) {
              showAlert('Error', e.response?.data?.message || 'No se pudo finalizar.');
            }
          })();
        },
      });
    };

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
          kicker={isConsultaPsicologia ? 'Consulta psicología' : 'Consulta nutrición'}
          title={nombreAtleta}
          subtitle={`${isoCalendarDateToDisplay(session.fecha)} · ${session.horaInicio}–${session.horaFin} · ${lugarLine}`}
          onBack={() => navigation.goBack()}
        />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Categoría: {session.categoria?.nombre || '—'}
          </Text>
          {confirmEstado ? (
            <View
              style={[
                styles.reopenBanner,
                {
                  borderColor:
                    confirmEstado === 'confirmada'
                      ? '#22c55e'
                      : confirmEstado === 'rechazada'
                        ? '#ef4444'
                        : '#f59e0b',
                  backgroundColor: theme.surface,
                  marginTop: 8,
                },
              ]}
            >
              <Ionicons
                name={
                  confirmEstado === 'confirmada'
                    ? 'checkmark-circle-outline'
                    : confirmEstado === 'rechazada'
                      ? 'close-circle-outline'
                      : 'time-outline'
                }
                size={22}
                color={
                  confirmEstado === 'confirmada'
                    ? '#22c55e'
                    : confirmEstado === 'rechazada'
                      ? '#ef4444'
                      : '#f59e0b'
                }
              />
              <Text style={[styles.reopenBannerTxt, { color: theme.text }]}>
                {consultaConfirmacionLabel(confirmEstado)}
                {confirmEstado === 'rechazada' && session.confirmacionAtleta?.motivoRechazo
                  ? `\nMotivo: ${session.confirmacionAtleta.motivoRechazo}`
                  : ''}
              </Text>
            </View>
          ) : null}
          {completed ? (
            <>
              <View style={[styles.reopenBanner, { borderColor: '#f59e0b', backgroundColor: theme.surface }]}>
                <Ionicons name="information-circle-outline" size={22} color="#f59e0b" />
                <Text style={[styles.reopenBannerTxt, { color: theme.text }]}>
                  Consulta cerrada. Reabrila para editar fecha, horario o lugar.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#b45309', marginBottom: 8 }]}
                onPress={confirmReopenSession}
                disabled={reopeningSession}
              >
                <Text style={styles.primaryBtnTxt}>{reopeningSession ? 'Procesando…' : 'Reabrir consulta'}</Text>
              </TouchableOpacity>
              {isConsultaPsicologia ? (
                <>
                  <Text style={[styles.section, { color: theme.text, marginTop: 16 }]}>
                    Visibilidad del informe
                  </Text>
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    Podés ocultar el texto del informe al atleta o al tutor sin reabrir la consulta.
                  </Text>
                  <View style={[styles.switchRow, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.text, flex: 1 }}>Visible para el atleta</Text>
                    <Switch
                      value={editInformeVisAtleta}
                      onValueChange={setEditInformeVisAtleta}
                      trackColor={{ true: `${colorMarca}88` }}
                    />
                  </View>
                  <View style={[styles.switchRow, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.text, flex: 1 }}>Visible para el tutor</Text>
                    <Switch
                      value={editInformeVisTutor}
                      onValueChange={setEditInformeVisTutor}
                      trackColor={{ true: `${colorMarca}88` }}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.secondaryOutlineBtn, { borderColor: colorMarca, marginBottom: 8 }]}
                    onPress={savePsychInformeVisibility}
                    disabled={savingPsychVis}
                  >
                    <Text style={{ color: colorMarca, fontWeight: '800' }}>
                      {savingPsychVis ? 'Guardando…' : 'Guardar visibilidad'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.section, { color: theme.text }]}>Datos</Text>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Fecha (DD-MM-AAAA)</Text>
              <TextInput
                style={inputStyle}
                value={editFecha}
                onChangeText={(t) => setEditFecha(maskDateDDMMAAAA(t))}
                placeholder="DD-MM-AAAA"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={10}
              />
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Hora inicio / fin</Text>
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <TextInput
                  style={[inputStyle, { flex: 1, marginRight: 8 }]}
                  value={editHoraInicio}
                  onChangeText={(t) => setEditHoraInicio(maskTimeHHMM(t))}
                  placeholder="09:00"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={editHoraFin}
                  onChangeText={(t) => setEditHoraFin(maskTimeHHMM(t))}
                  placeholder="09:45"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Lugar (texto libre)</Text>
              <TextInput
                style={[inputStyle, { minHeight: 72 }]}
                multiline
                value={editLugarLibre}
                onChangeText={setEditLugarLibre}
                placeholder="Consultorio, domicilio, videollamada…"
                placeholderTextColor={theme.textMuted}
              />
              {isConsultaPsicologia ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Qué pasó en la sesión</Text>
                  <Text style={[styles.hint, { color: theme.textMuted, marginTop: -4 }]}>
                    Resumen clínico / acuerdos / observaciones. Marcá abajo si el atleta o el tutor pueden ver este
                    texto en la app.
                  </Text>
                  <TextInput
                    style={[inputStyle, { minHeight: 140 }]}
                    multiline
                    value={editInformeSesion}
                    onChangeText={setEditInformeSesion}
                    placeholder="Evolución, temas trabajados, derivaciones…"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Visibilidad del informe</Text>
                  <View style={[styles.switchRow, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.text, flex: 1 }}>Visible para el atleta</Text>
                    <Switch
                      value={editInformeVisAtleta}
                      onValueChange={setEditInformeVisAtleta}
                      trackColor={{ true: `${colorMarca}88` }}
                    />
                  </View>
                  <View style={[styles.switchRow, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.text, flex: 1 }}>Visible para el tutor</Text>
                    <Switch
                      value={editInformeVisTutor}
                      onValueChange={setEditInformeVisTutor}
                      trackColor={{ true: `${colorMarca}88` }}
                    />
                  </View>
                </>
              ) : null}
              <TouchableOpacity
                style={[styles.secondaryOutlineBtn, { borderColor: colorMarca, marginBottom: 16 }]}
                onPress={saveSessionMeta}
                disabled={savingSessionMeta}
              >
                <Text style={{ color: colorMarca, fontWeight: '800' }}>
                  {savingSessionMeta ? 'Guardando…' : 'Guardar cambios'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colorMarca }]} onPress={finishConsulta}>
                <Text style={styles.primaryBtnTxt}>Marcar consulta como realizada</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryOutlineBtn, { borderColor: '#ef4444', marginTop: 12 }]}
                onPress={() =>
                  navigation.navigate('CoachCancelSession', { sessionId, session })
                }
              >
                <Text style={{ color: '#ef4444', fontWeight: '800' }}>Cancelar consulta</Text>
              </TouchableOpacity>
            </>
          )}
          {completed && isConsultaPsicologia && (session.informeSesion || '').trim() ? (
            <>
              <Text style={[styles.section, { color: theme.text, marginTop: 16 }]}>Registro de la sesión</Text>
              <Text style={[styles.hint, { color: theme.text }]}>{session.informeSesion}</Text>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const showPlanBuilder = !hasPlan || editingPlanDraft;

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
        kicker={
          sessionEsOpcional(session)
            ? `${sessionTipoLabel(session.tipo)} · Opcional`
            : sessionTipoLabel(session.tipo)
        }
        title={sessionDisplayName(session)}
        subtitle={`${session.categoria?.nombre || ''} · ${isoCalendarDateToDisplay(session.fecha)} · ${session.horaInicio}–${session.horaFin} · ${
          needsRelocation
            ? 'Lugar pendiente'
            : (session.lugarExterno || '').trim() || session.espacio?.nombre || 'Sin lugar'
        }`}
        onBack={() => navigation.goBack()}
      />

      <View style={[styles.tabBar, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        {[
          { key: 'checkin', label: 'Check-in', icon: 'checkbox-outline' },
          { key: 'entreno', label: 'Entreno', icon: 'football-outline' },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, detailTab === t.key && { borderBottomColor: colorMarca }]}
            onPress={() => setDetailTab(t.key)}
          >
            <Ionicons name={t.icon} size={18} color={detailTab === t.key ? colorMarca : theme.icon} />
            <Text
              style={{
                color: detailTab === t.key ? colorMarca : theme.textMuted,
                fontWeight: '800',
                marginLeft: 8,
                fontSize: 15,
              }}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {detailTab === 'checkin' ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {needsRelocation ? (
            <View style={[styles.relocationBanner, { backgroundColor: '#f59e0b22', borderColor: '#f59e0b' }]}>
              <Ionicons name="warning-outline" size={20} color="#f59e0b" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: theme.text, fontWeight: '800' }}>Definí el nuevo lugar</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  {session.espacioSuspendido?.nombre
                    ? `${session.espacioSuspendido.nombre} no está disponible. `
                    : 'El espacio original no está disponible. '}
                  {session.reubicacionMotivo || 'Elegí otro espacio del club o una sede externa.'}
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 10 }}
                  onPress={() => navigation.navigate('CoachRelocateSessions')}
                >
                  <Text style={{ color: colorMarca, fontWeight: '800' }}>
                    Gestionar todas las sesiones pendientes →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {canRestoreHome ? (
            <View style={[styles.relocationBanner, { backgroundColor: '#22c55e22', borderColor: '#22c55e' }]}>
              <Ionicons name="home-outline" size={20} color="#22c55e" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: theme.text, fontWeight: '800' }}>Espacio original disponible</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  {session.espacioSuspendido?.nombre} ya está disponible. Podés devolver esta sesión a su lugar habitual.
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 10, opacity: restoringHome ? 0.7 : 1 }}
                  onPress={restoreHomeSpace}
                  disabled={restoringHome}
                >
                  <Text style={{ color: '#22c55e', fontWeight: '800' }}>
                    {restoringHome ? 'Restaurando…' : `Volver a ${session.espacioSuspendido?.nombre}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Asistencia del plantel. El ícono wellness aparece si falta el pre del día (se renueva cada mañana).
          </Text>

          <Text style={[styles.section, { color: theme.text }]}>Asistencia</Text>
          {roster.map((a) => {
            const aid = String(a._id);
            const needsWellness = !wellnessPreDoneToday.has(aid);
            const catId = session?.categoria?._id || session?.categoria;
            return (
            <View key={a._id} style={[styles.rowAth, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.rowAthTop}>
                <Text style={[styles.athName, { color: theme.text }]} numberOfLines={1}>
                  {a.nombre} {a.apellido}
                </Text>
                {needsWellness ? (
                  <TouchableOpacity
                    style={[styles.wellnessBtn, { borderColor: colorMarca, backgroundColor: colorMarca + '18' }]}
                    onPress={() =>
                      navigation.navigate('CoachWellness', {
                        atletaId: a._id,
                        atletaNombre: `${a.nombre} ${a.apellido}`,
                        categoriaId: catId,
                        sesion: sessionId,
                      })
                    }
                    accessibilityLabel="Cargar wellness pre"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="fitness-outline" size={22} color={colorMarca} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.pills}>
                {ASIST_OPTS.map((o) => {
                  const on = attendance[a._id] === o.key;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      disabled={completed}
                      style={[
                        styles.pill,
                        { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca + '22' : 'transparent' },
                      ]}
                      onPress={() => setAttendance((prev) => ({ ...prev, [a._id]: o.key }))}
                    >
                      <Text style={{ color: on ? colorMarca : theme.textMuted, fontSize: 12, fontWeight: '600' }}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            );
          })}
          {!completed ? (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colorMarca }]} onPress={saveAttendance} disabled={saving}>
              <Text style={styles.primaryBtnTxt}>{saving ? 'Guardando…' : 'Guardar asistencia'}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.hint, { color: theme.textMuted, marginTop: 8 }]}>
              Sesión cerrada — la asistencia ya no se puede editar desde aquí.
            </Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.section, { color: theme.text }]}>Datos de la sesión</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Corregí fecha, horario o espacio si hubo un error. Con la sesión cerrada primero tenés que reabrirla.
          </Text>
          {completed ? (
            <View style={[styles.reopenBanner, { borderColor: '#f59e0b', backgroundColor: theme.surface }]}>
              <Ionicons name="information-circle-outline" size={22} color="#f59e0b" />
              <Text style={[styles.reopenBannerTxt, { color: theme.text }]}>
                Sesión cerrada. Reabrila para poder reprogramar o cargar tiempos otra vez.
              </Text>
            </View>
          ) : null}
          {completed ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#b45309', marginBottom: 8 }]}
              onPress={confirmReopenSession}
              disabled={reopeningSession}
            >
              <Text style={styles.primaryBtnTxt}>{reopeningSession ? 'Procesando…' : 'Reabrir sesión para corregir'}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Fecha (DD-MM-AAAA)</Text>
              <TextInput
                style={inputStyle}
                value={editFecha}
                onChangeText={(t) => setEditFecha(maskDateDDMMAAAA(t))}
                placeholder="DD-MM-AAAA"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                autoCapitalize="none"
                editable={!completed}
              />
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Hora inicio / fin (HH:MM)</Text>
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <TextInput
                  style={[inputStyle, { flex: 1, marginRight: 8 }]}
                  value={editHoraInicio}
                  onChangeText={(t) => setEditHoraInicio(maskTimeHHMM(t))}
                  placeholder="18:00"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                  editable={!completed}
                />
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={editHoraFin}
                  onChangeText={(t) => setEditHoraFin(maskTimeHHMM(t))}
                  placeholder="19:30"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                  editable={!completed}
                />
              </View>
              {(session.lugarExterno || '').trim() && !needsRelocation ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Sede (partido fuera)</Text>
                  <TextInput
                    style={[inputStyle, { minHeight: 48, marginBottom: 12 }]}
                    value={editLugarExterno}
                    onChangeText={setEditLugarExterno}
                    placeholder="Dónde se juega"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    editable={!completed}
                  />
                </>
              ) : needsRelocation ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Nuevo espacio del club</Text>
                  {availableSpaces.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      {availableSpaces.map((s) => (
                        <TouchableOpacity
                          key={s._id}
                          style={[
                            styles.chipEspacio,
                            {
                              borderColor: editEspacioId === s._id ? colorMarca : theme.border,
                              backgroundColor: editEspacioId === s._id ? colorMarca + '22' : theme.surface,
                            },
                          ]}
                          onPress={() => setEditEspacioId(s._id)}
                        >
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{s.nombre}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12, fontStyle: 'italic' }}>
                      No hay espacios libres en ese horario.
                    </Text>
                  )}
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>O sede externa</Text>
                  <TextInput
                    style={[inputStyle, { minHeight: 48, marginBottom: 12 }]}
                    value={editLugarExterno}
                    onChangeText={setEditLugarExterno}
                    placeholder="Ej. cancha municipal, club visitante…"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    editable={!completed}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Espacio</Text>
                  {availableSpaces.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      {availableSpaces.map((s) => (
                        <TouchableOpacity
                          key={s._id}
                          style={[
                            styles.chipEspacio,
                            {
                              borderColor: editEspacioId === s._id ? colorMarca : theme.border,
                              backgroundColor: editEspacioId === s._id ? colorMarca + '22' : theme.surface,
                            },
                          ]}
                          onPress={() => setEditEspacioId(s._id)}
                        >
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{s.nombre}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12, fontStyle: 'italic' }}>
                      No hay espacios libres en ese horario.
                    </Text>
                  )}
                </>
              )}
              <TouchableOpacity
                style={[styles.secondaryOutlineBtn, { borderColor: colorMarca, marginBottom: 16 }]}
                onPress={saveSessionMeta}
                disabled={savingSessionMeta}
              >
                <Text style={{ color: colorMarca, fontWeight: '800' }}>
                  {savingSessionMeta ? 'Guardando…' : 'Guardar cambios de fecha / lugar'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryOutlineBtn, { borderColor: '#ef4444', marginBottom: 16 }]}
                onPress={() =>
                  navigation.navigate('CoachCancelSession', { sessionId, session })
                }
              >
                <Text style={{ color: '#ef4444', fontWeight: '800' }}>Cancelar sesión</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.section, { color: theme.text, marginTop: 8 }]}>Plan de entrenamiento</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Primero definí los bloques. Después podés medir el tiempo real de cada uno con el cronómetro.
        </Text>

        {showPlanBuilder ? (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Nombre del plan</Text>
            <TextInput
              style={inputStyle}
              value={planNombre}
              onChangeText={setPlanNombre}
              placeholder="Ej. Práctica pre-partido"
              placeholderTextColor={theme.textMuted}
              editable={!completed}
            />
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Objetivo de la sesión (opcional)</Text>
            <TextInput
              style={[inputStyle, { minHeight: 72 }]}
              multiline
              value={planObjetivo}
              onChangeText={setPlanObjetivo}
              placeholder="Ej. Priorizar salida limpia desde atrás"
              placeholderTextColor={theme.textMuted}
              editable={!completed}
            />

            {draftBlocks.map((d, i) => (
              <View key={`draft-${i}`} style={[styles.draftCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.draftTitle, { color: theme.text }]}>Bloque {i + 1}</Text>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Título</Text>
                <TextInput
                  style={inputStyle}
                  value={d.tituloBloque}
                  onChangeText={(v) => updateDraft(i, 'tituloBloque', v)}
                  placeholder="Ej. Partido condicionado"
                  placeholderTextColor={theme.textMuted}
                  editable={!completed}
                />
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Formato</Text>
                <TextInput
                  style={inputStyle}
                  value={d.formato}
                  onChangeText={(v) => updateDraft(i, 'formato', v)}
                  placeholder="Ej. 5vs5, ruedas…"
                  placeholderTextColor={theme.textMuted}
                  editable={!completed}
                />
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Enfoque</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {ENFOQUE_OPTS.map((o) => (
                    <TouchableOpacity
                      key={o.key}
                      style={[
                        styles.chip,
                        {
                          borderColor: d.enfoque === o.key ? colorMarca : theme.border,
                          backgroundColor: d.enfoque === o.key ? colorMarca + '22' : 'transparent',
                        },
                      ]}
                      onPress={() => updateDraft(i, 'enfoque', o.key)}
                      disabled={completed}
                    >
                      <Text style={{ color: d.enfoque === o.key ? colorMarca : theme.textMuted, fontSize: 12, fontWeight: '700' }}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Duración planificada (min)</Text>
                <TextInput
                  style={inputStyle}
                  value={d.duracionMinutos}
                  onChangeText={(v) => updateDraft(i, 'duracionMinutos', v)}
                  keyboardType="number-pad"
                  editable={!completed}
                />
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Detalle / reglas (opcional)</Text>
                <TextInput
                  style={[inputStyle, { minHeight: 56 }]}
                  multiline
                  value={d.descripcionDetallada}
                  onChangeText={(v) => updateDraft(i, 'descripcionDetallada', v)}
                  placeholder="Ej. A dos toques en campo propio"
                  placeholderTextColor={theme.textMuted}
                  editable={!completed}
                />
                {draftBlocks.length > 1 ? (
                  <TouchableOpacity
                    style={styles.removeDraftBtn}
                    onPress={() => setDraftBlocks((prev) => prev.filter((_, j) => j !== i))}
                    disabled={completed}
                  >
                    <Text style={{ color: '#ef4444', fontWeight: '700' }}>Quitar bloque</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            {!completed ? (
              <TouchableOpacity
                style={[styles.secondaryOutlineBtn, { borderColor: colorMarca }]}
                onPress={() => setDraftBlocks((prev) => [...prev, emptyDraftBlock()])}
              >
                <Text style={{ color: colorMarca, fontWeight: '800' }}>+ Agregar bloque</Text>
              </TouchableOpacity>
            ) : null}

            {!completed ? (
              <View style={{ flexDirection: 'row', marginTop: 12 }}>
                {hasPlan && editingPlanDraft ? (
                  <TouchableOpacity style={[styles.secondaryOutlineBtn, { borderColor: theme.border, flex: 1, marginRight: 8 }]} onPress={cancelEditingPlan}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Cancelar edición</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colorMarca, flex: 1 }]}
                  onPress={persistTrainingPlan}
                  disabled={savingPlan}
                >
                  <Text style={styles.primaryBtnTxt}>{savingPlan ? 'Guardando…' : 'Guardar plan en la sesión'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={[styles.planBanner, { backgroundColor: colorMarca + '18', borderColor: colorMarca }]}>
              <Ionicons name="clipboard-outline" size={22} color={colorMarca} />
              <Text style={[styles.planBannerTxt, { color: theme.text }]}>
                {plan?.nombre || 'Plan cargado'} · {plan.bloques.length} bloques · {totalPlanMin} min planificados
              </Text>
            </View>
            {!completed ? (
              <TouchableOpacity style={[styles.secondaryOutlineBtn, { borderColor: theme.border, marginBottom: 12 }]} onPress={startEditingPlan}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Modificar plan</Text>
              </TouchableOpacity>
            ) : null}

            {executedBlocks.map((b, i) => (
              <View key={`ex-${i}`} style={[styles.execRow, { borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{b.tituloBloque}</Text>
                  <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 13 }}>
                    {b.formato} · {ENFOQUE_OPTS.find((x) => x.key === b.enfoque)?.label || b.enfoque} · plan {b.duracionPlanificada} min
                  </Text>
                </View>
                {!completed ? (
                  <View style={styles.realMinWrap}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 4 }]}>Real</Text>
                    <TextInput
                      style={[styles.realMinInput, { color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={String(b.duracionRealMinutos ?? 0)}
                      onChangeText={(t) => setRealMinutesAt(i, t)}
                    />
                  </View>
                ) : (
                  <Text style={{ color: theme.text, fontWeight: '800' }}>{b.duracionRealMinutos || 0}′</Text>
                )}
              </View>
            ))}
          </>
        )}

        {hasPlan && !editingPlanDraft && executedBlocks.length > 0 ? (
          <>
            <Text style={[styles.section, { color: theme.text, marginTop: 22 }]}>Cronómetro por bloque</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Elegí el bloque, iniciá el cronómetro y al detener se guardan los minutos en “Real” (podés ajustarlos a mano).
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {executedBlocks.map((_, i) => (
                <TouchableOpacity
                  key={`tb-${i}`}
                  style={[
                    styles.timerChip,
                    {
                      borderColor: selectedTimerIndex === i ? colorMarca : theme.border,
                      backgroundColor: selectedTimerIndex === i ? colorMarca + '28' : theme.surface,
                    },
                  ]}
                  onPress={() => !timerLocked && !completed && setSelectedTimerIndex(i)}
                  disabled={completed || timerLocked}
                >
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.timerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.timerSub, { color: theme.textMuted }]}>
                Bloque {selectedTimerIndex + 1}: {executedBlocks[selectedTimerIndex]?.tituloBloque}
              </Text>
              <Text style={[styles.timerTxt, { color: theme.text }]}>
                {timerStartedAt == null
                  ? 'Listo para iniciar'
                  : `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`}
              </Text>
              {!completed ? (
                <View style={{ flexDirection: 'row', marginTop: 12 }}>
                  <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colorMarca }]} onPress={startTimer} disabled={timerLocked}>
                    <Text style={{ color: colorMarca, fontWeight: '700' }}>Iniciar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: theme.border }]}
                    onPress={stopTimerAndAssign}
                    disabled={timerStartedAt == null}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Detener y asignar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {!completed ? (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#0f766e', marginTop: 16 }]} onPress={finishTraining}>
            <Text style={styles.primaryBtnTxt}>Finalizar entrenamiento</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.section, { color: theme.text, marginTop: 24 }]}>Resumen de tiempos</Text>
        <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
            Total real: {totalRealMin} min{hasPlan ? ` · Plan: ${totalPlanMin} min` : ''}
          </Text>
          {executedBlocks.map((b, i) => (
            <Text key={`sum-${i}`} style={{ color: theme.textMuted, marginTop: 8 }}>
              · {b.tituloBloque}: {b.duracionRealMinutos || 0} min real
              {hasPlan ? ` (${b.duracionPlanificada} min plan)` : ''}
            </Text>
          ))}
          {executedBlocks.length === 0 ? (
            <Text style={{ color: theme.textMuted, marginTop: 8 }}>
              {hasPlan ? 'Guardá tiempos con el cronómetro o editando la columna Real.' : 'Creá el plan de entrenamiento para ver el desglose por bloque.'}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  reopenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  reopenBannerTxt: { flex: 1, fontSize: 14, lineHeight: 20 },
  chipEspacio: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  relocationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  section: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  rowAth: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowAthTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  athName: { flex: 1, fontSize: 15, fontWeight: '700' },
  wellnessBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryOutlineBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  draftCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  draftTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  removeDraftBtn: { marginTop: 8, alignSelf: 'flex-start' },
  chipsScroll: { marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 8 },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  planBannerTxt: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  execRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  realMinWrap: { alignItems: 'flex-end' },
  realMinInput: {
    borderWidth: 1,
    borderRadius: 8,
    width: 56,
    paddingVertical: 8,
    textAlign: 'center',
    fontWeight: '800',
  },
  timerChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  timerCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  timerSub: { fontSize: 13, marginBottom: 8 },
  timerTxt: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summary: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 8 },
});
