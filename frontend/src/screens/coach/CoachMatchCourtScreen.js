import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import { useLandscapeLock } from '../../hooks/useLandscapeLock';
import MatchCourtBoard from '../../components/MatchCourtBoard';
import UserAvatar from '../../components/UserAvatar';
import { MatchMark } from '../../components/MatchMark';
import { SCREEN_FADE_MS } from '../../navigation/screenFade';
import { clockFromEvents, countsFor, courtNow, idOf, isCounterTotal, isLimitStat, porcentajeIdsOf, scorePoints, sumsOnlyTotals, suspendedNow } from '../../utils/matchDerive';

function clockLabel(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function personName(user) {
  if (!user || typeof user !== 'object') return 'Jugador';
  return `${user.nombre || ''} ${user.apellido || ''}`.trim() || 'Jugador';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FadeAlert({ onPress, style, children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: SCREEN_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <AnimatedPressable onPress={onPress} style={[style, { opacity }]}>
      {children}
    </AnimatedPressable>
  );
}

function Scoreboard({ ours, theirs, rivalOn, away, color }) {
  const cells = rivalOn
    ? (away
      ? [
        { key: 'local', label: 'Local', value: theirs, ours: false },
        { key: 'visita', label: 'Visita', value: ours, ours: true },
      ]
      : [
        { key: 'local', label: 'Local', value: ours, ours: true },
        { key: 'visita', label: 'Visita', value: theirs, ours: false },
      ])
    : [{ key: 'nosotros', label: 'Nosotros', value: ours, ours: true }];
  return (
    <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden' }}>
      {cells.map((cell) => (
        <View
          key={cell.key}
          style={{ minWidth: 58, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, backgroundColor: cell.ours ? color : '#9ca3af' }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{cell.label}</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 }}>{cell.value}</Text>
        </View>
      ))}
    </View>
  );
}

function BarButton({ label, onPress, active, tone = 'default', theme, color, icon }) {
  const filled = tone === 'send' || active;
  const backgroundColor = tone === 'send' ? '#16a34a' : active ? color : theme.surface;
  const borderColor = tone === 'send' ? '#16a34a' : active ? color : theme.border;
  const textColor = filled ? '#ffffff' : tone === 'brand' ? color : theme.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: 10,
        borderWidth: 1,
        backgroundColor,
        borderColor,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={textColor} /> : null}
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CoachMatchCourtScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sessionId = route.params?.sessionId;
  useLandscapeLock();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState([]);
  const [roster, setRoster] = useState([]);
  const [staff, setStaff] = useState([]);
  const [picked, setPicked] = useState([]);
  const [sheetId, setSheetId] = useState('');
  const [step, setStep] = useState(null);
  const [courtMarks, setCourtMarks] = useState([]);
  const [clock, setClock] = useState({ running: false, periodo: 1, remainingMs: 0, anchor: 0, anchorMs: 0 });
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState('');
  const [openStatId, setOpenStatId] = useState(null);
  const [sale, setSale] = useState('');
  const [fuera, setFuera] = useState('');
  const [extraOpen, setExtraOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [extraMinutos, setExtraMinutos] = useState('');
  const [rivalDraft, setRivalDraft] = useState(null);
  const [rivalDorsal, setRivalDorsal] = useState('');
  const [rivalNombre, setRivalNombre] = useState('');
  const [inicialSide, setInicialSide] = useState('nosotros');
  const [cambioSide, setCambioSide] = useState('nosotros');
  const [error, setError] = useState('');
  const [valores, setValores] = useState({});
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const promptedCambioRef = useRef('');

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
  }, [clubData?.urlIdentifier]);

  const load = useCallback(async () => {
    const h = await headers();
    const { data } = await clubApi.get(`/sessions/${sessionId}`, { headers: h });
    setSession(data);
    const partido = data?.planillaValores?.partido || {};
    setValores(partido);
    const full = (data?.planilla?.reloj?.minutosPorPeriodo || 10) * 60000;
    setClock(clockFromEvents(data?.relojEventos || [], full));
    const catId = data?.categoria?._id || data?.categoria;
    if (catId) {
      const [sheetsRes, enrRes, catsRes] = await Promise.all([
        clubApi.get('/sessions/match-sheets', { headers: h }),
        clubApi.get(`/enrollments/categoria/${catId}`, { headers: h }),
        clubApi.get('/categories', { headers: h }),
      ]);
      setSheets(sheetsRes.data || []);
      setRoster((enrRes.data || []).map((row) => row.atleta).filter(Boolean));
      const cat = (catsRes.data || []).find((item) => String(item._id) === String(catId)) || {};
      const people = [...(cat.profesores || []), ...(cat.preparadoresFisicos || [])];
      const seen = new Set();
      setStaff(people.filter((person) => person?._id && !seen.has(String(person._id)) && seen.add(String(person._id))));
      if (!data?.listaBuenaFe?.length) {
        const me = await getToken('userId');
        const mine = people.find((person) => String(person._id) === String(me));
        if (mine) {
          setPicked((rows) => (rows.length ? rows : [{ usuario: mine._id, tipoPersona: 'staff', dorsal: '' }]));
        }
      }
    }
    setLoading(false);
  }, [headers, sessionId]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => {
        setError(e.response?.data?.message || 'No se pudo abrir el partido.');
        setLoading(false);
      });
    }, [load]),
  );

  useEffect(() => {
    if (!session?.listaBuenaFe?.length) return;
    setPicked((rows) =>
      rows.length
        ? rows
        : session.listaBuenaFe.map((row) => ({
            usuario: idOf(row.usuario),
            tipoPersona: row.tipoPersona || 'jugador',
            dorsal: row.dorsal || '',
          })),
    );
  }, [session]);

  useEffect(() => {
    if (!courtMarks.length) return undefined;
    const timer = setInterval(() => {
      const cutoff = Date.now() - 3000;
      setCourtMarks((rows) => (rows.some((mark) => mark.at <= cutoff) ? rows.filter((mark) => mark.at > cutoff) : rows));
    }, 250);
    return () => clearInterval(timer);
  }, [courtMarks.length]);

  useEffect(() => {
    if (!clock.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [clock.running]);

  const remainingMs = clock.running
    ? Math.max(0, clock.anchorMs - (now - clock.anchor))
    : clock.remainingMs;

  const post = async (path, body) => {
    const h = await headers();
    const { data } = await clubApi.post(path, body, { headers: h });
    setSession(data);
    return data;
  };

  const planilla = session?.planilla;
  const reloj = planilla?.reloj;
  const onCourt = courtNow(session?.relojEventos || []);
  const suspended = suspendedNow(session?.relojEventos || [], clock.periodo);
  const expulsadosEnCancha = onCourt.filter((id) => suspended.get(id) === 'expulsado').sort().join(',');
  useEffect(() => {
    if (loading) return;
    if (!expulsadosEnCancha) {
      promptedCambioRef.current = '';
      return;
    }
    if (promptedCambioRef.current === expulsadosEnCancha) return;
    promptedCambioRef.current = expulsadosEnCancha;
    setCambioSide('nosotros');
    setSale(expulsadosEnCancha.split(',')[0]);
    setPanel('cambio');
  }, [expulsadosEnCancha, loading]);
  const askCambio = () => {
    if (!expulsadosEnCancha) return false;
    setCambioSide('nosotros');
    setSale(expulsadosEnCancha.split(',')[0]);
    setPanel('cambio');
    return true;
  };
  const jugadores = (session?.listaBuenaFe || []).filter((row) => row.tipoPersona !== 'staff');
  const choosable = onCourt.length
    ? jugadores.filter((row) => onCourt.includes(idOf(row.usuario)))
    : jugadores;
  const seenOnStat = new Set(choosable.map((row) => idOf(row.usuario)));
  const statPlayers = [
    ...choosable,
    ...jugadores.filter((row) => suspended.has(idOf(row.usuario)) && !seenOnStat.has(idOf(row.usuario))),
  ];
  const actionCampos = (planilla?.campos || []).filter(
    (campo) => campo.tipo === 'porcentaje' || isCounterTotal(campo) || isLimitStat(campo),
  );

  const summary = useMemo(() => {
    const campos = planilla?.campos || [];
    const jugadas = session?.jugadas || [];
    const shots = campos
      .filter((campo) => campo.tipo === 'porcentaje')
      .map((campo) => ({
        id: campo._id,
        etiqueta: campo.etiqueta,
        counter: false,
        campoIds: [String(campo._id)],
        ...countsFor(jugadas, null, [campo._id]),
      }));
    const totals = campos
      .filter((campo) => campo.tipo === 'total')
      .map((campo) => ({
        id: campo._id,
        etiqueta: campo.etiqueta,
        total: true,
        counter: sumsOnlyTotals(campo, campos),
        campoIds: isCounterTotal(campo)
          ? [String(campo._id)]
          : [...porcentajeIdsOf(campo, campos)].map(String),
        ...countsFor(jugadas, null, isCounterTotal(campo) ? [campo._id] : [...porcentajeIdsOf(campo, campos)]),
      }));
    const limits = campos
      .filter((campo) => isLimitStat(campo))
      .map((campo) => ({
        id: campo._id,
        etiqueta: campo.etiqueta,
        counter: true,
        limite: Number(campo.limite) || 5,
        campoIds: [String(campo._id)],
        ...countsFor(jugadas, null, [campo._id]),
      }));
    return [...shots, ...totals, ...limits];
  }, [planilla?.campos, session?.jugadas]);

  const possessionRows = [...(session?.posesiones || [])].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const ball = possessionRows.length ? possessionRows[possessionRows.length - 1]?.equipo || '' : '';

  const persistLista = async () => {
    const h = await headers();
    const lista = picked.map((row) => ({
      usuario: row.usuario,
      tipoPersona: row.tipoPersona,
      dorsal: row.dorsal || '',
    }));
    const { data } = await clubApi.put(`/sessions/${sessionId}/lista`, { lista }, { headers: h });
    setSession(data);
    return data;
  };

  const saveSetup = async () => {
    setError('');
    try {
      const hasLista = (session?.listaBuenaFe || []).length > 0;
      if (!hasLista && !picked.some((row) => row.tipoPersona !== 'staff')) {
        setError('Elegí al menos un jugador.');
        return;
      }
      const h = await headers();
      if (sheetId) {
        const { data } = await clubApi.put(`/sessions/${sessionId}/planilla`, { planillaId: sheetId }, { headers: h });
        setSession(data);
      } else if (hasLista) {
        setError('Elegí una planilla para este partido.');
        return;
      }
      if (!hasLista) await persistLista();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar.');
    }
  };

  const togglePick = (usuario, tipoPersona) => {
    setPicked((rows) => {
      const exists = rows.some((row) => row.usuario === usuario);
      if (exists) return rows.filter((row) => row.usuario !== usuario);
      return [...rows, { usuario, tipoPersona, dorsal: '' }];
    });
  };

  const logPlay = async ({ usuario = '', rivalJugador = '', equipo = 'nosotros' } = {}) => {
    if (!step?.campo) return;
    if (equipo !== 'rival' && suspendedNow(session?.relojEventos || [], clock.periodo).has(String(usuario))) return;
    try {
      await post(`/sessions/${sessionId}/jugadas`, {
        x: step.x,
        y: step.y,
        campoId: step.campo._id,
        resultado: step.resultado,
        equipo,
        ...(usuario ? { usuario } : {}),
        ...(rivalJugador ? { rivalJugador } : {}),
        periodo: clock.periodo,
        relojMs: remainingMs,
      });
      const counter = isCounterTotal(step.campo) || isLimitStat(step.campo);
      const icono = counter ? 'circulo' : step.resultado === 'anoto' ? step.campo.iconoAnoto : step.campo.iconoErro;
      setCourtMarks((rows) => [
        ...rows,
        {
          x: step.x,
          y: step.y,
          icono,
          color: counter ? colorMarca : step.resultado === 'anoto' ? '#22c55e' : '#ef4444',
          at: Date.now(),
        },
      ]);
      setStep(null);
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo anotar la jugada.');
    }
  };

  const clockBody = (tipo, extra = {}) => ({
    tipo,
    periodo: clock.periodo,
    relojMs: remainingMs,
    ...extra,
  });

  const startClock = async () => {
    if (!onCourt.length) {
      setPanel('quinteto');
      return;
    }
    try {
      await post(`/sessions/${sessionId}/reloj`, clockBody('inicio'));
      setClock((prev) => ({ ...prev, running: true, anchor: Date.now(), anchorMs: remainingMs }));
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo iniciar el reloj.');
    }
  };

  const pauseClock = async () => {
    const ms = remainingMs;
    try {
      await post(`/sessions/${sessionId}/reloj`, { tipo: 'pausa', periodo: clock.periodo, relojMs: ms });
      setClock((prev) => ({ ...prev, running: false, remainingMs: ms }));
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo pausar.');
    }
  };

  const nextPeriod = async (siguienteMs = 0) => {
    const plannedMs = (reloj?.minutosPorPeriodo || 10) * 60000;
    const full = siguienteMs > 0 ? siguienteMs : plannedMs;
    try {
      if (clock.running) await pauseClock();
      await post(`/sessions/${sessionId}/reloj`, {
        tipo: 'fin_periodo',
        periodo: clock.periodo,
        relojMs: remainingMs,
        ...(siguienteMs > 0 ? { siguienteMs } : {}),
      });
      setClock({ running: false, periodo: clock.periodo + 1, remainingMs: full, anchor: 0, anchorMs: full });
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo cerrar el período.');
    }
  };

  const onSiguiente = () => {
    const planned = reloj?.periodos || 4;
    if (clock.periodo >= planned) {
      setExtraMinutos(String(reloj?.minutosPorPeriodo || 10));
      setExtraOpen(true);
      return;
    }
    nextPeriod();
  };

  const confirmExtra = () => {
    const minutes = Number(extraMinutos);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      setError('Elegí entre 1 y 60 minutos.');
      return;
    }
    setError('');
    setExtraOpen(false);
    nextPeriod(minutes * 60000);
  };

  const markOut = async (alcance) => {
    if (!fuera) return;
    try {
      await post(`/sessions/${sessionId}/reloj`, clockBody(alcance ? 'sancion' : 'habilitar', {
        sancionado: fuera,
        ...(alcance ? { alcance } : {}),
      }));
      setFuera('');
      setPanel('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo actualizar al jugador.');
    }
  };

  const saveLineup = async (ids) => {
    try {
      await post(`/sessions/${sessionId}/reloj`, clockBody('quinteto', { enCancha: ids }));
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la cancha.');
    }
  };

  const openRival = () => {
    setRivalDraft({
      rows: (session?.rivalAlineacion || []).map((row) => ({
        id: String(row._id),
        dorsal: row.dorsal || '',
        nombre: row.nombre || '',
      })),
      on: (session?.rivalEnCancha || []).map(String),
    });
    setRivalDorsal('');
    setRivalNombre('');
    setPanel('rival');
  };

  const addRivalPlayer = () => {
    const dorsal = rivalDorsal.trim();
    if (!dorsal) return;
    setRivalDraft((draft) => {
      const rows = draft?.rows || [];
      if (rows.some((row) => row.dorsal === dorsal)) return draft;
      return {
        rows: [...rows, { id: `new_${Date.now()}`, dorsal, nombre: rivalNombre.trim() }],
        on: draft?.on || [],
      };
    });
    setRivalDorsal('');
    setRivalNombre('');
  };

  const saveRivalLineup = async () => {
    if (!rivalDraft?.rows?.length) {
      setError('Agregá al menos un jugador del rival.');
      return;
    }
    try {
      const h = await headers();
      const { data } = await clubApi.put(`/sessions/${sessionId}/rival`, {
        alineacion: rivalDraft.rows.map((row) => ({ id: row.id, dorsal: row.dorsal, nombre: row.nombre })),
        enCancha: rivalDraft.on,
      }, { headers: h });
      setSession(data);
      setRivalDraft(null);
      const on = (data?.rivalEnCancha || []).length;
      const max = data?.planilla?.reloj?.jugadoresEnCancha || 5;
      if (on < max) {
        setInicialSide('rival');
        setPanel('quinteto');
      } else {
        setPanel('');
      }
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la alineación del rival.');
    }
  };

  const saveRivalCourt = async (ids) => {
    const rows = session?.rivalAlineacion || [];
    if (!rows.length) return;
    try {
      const h = await headers();
      const { data } = await clubApi.put(`/sessions/${sessionId}/rival`, {
        alineacion: rows.map((row) => ({ id: String(row._id), dorsal: row.dorsal, nombre: row.nombre || '' })),
        enCancha: ids,
      }, { headers: h });
      setSession(data);
      if (ids.length >= (reloj?.jugadoresEnCancha || 5)) {
        if (onCourt.length < (reloj?.jugadoresEnCancha || 5)) setInicialSide('nosotros');
        else setPanel('');
      }
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la cancha del rival.');
    }
  };

  const giveBall = async (equipo) => {
    try {
      await post(`/sessions/${sessionId}/posesiones`, { equipo, periodo: clock.periodo, relojMs: remainingMs });
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo marcar la posesión.');
    }
  };

  const finish = async () => {
    setEndOpen(false);
    try {
      await post(`/sessions/${sessionId}/informe`, {
        accion: 'enviar',
        relojAhora: { corriendo: clock.running, periodo: clock.periodo, relojMs: remainingMs },
      });
      setOpenStatId(null);
      setEnded(true);
      setPanel('stats');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo enviar el informe.');
    }
  };

  const saveDatos = async () => {
    try {
      const h = await headers();
      const { data } = await clubApi.put(`/sessions/${sessionId}/planilla-valores`, { partido: valores }, { headers: h });
      setSession(data);
      setPanel('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron guardar los datos.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <ClubSpinLoader size={40} />
      </SafeAreaView>
    );
  }

  const needsSetup = !planilla?.campos?.length;
  const rivalActivo = planilla?.rival?.activo === true;
  const rivalLineup = rivalActivo && planilla?.rival?.modo === 'alineacion';
  const contarPosesion = reloj?.posesion !== false;
  const nuestroScore = scorePoints(session?.jugadas, planilla?.campos, 'nosotros');
  const rivalScore = scorePoints(session?.jugadas, planilla?.campos, 'rival');
  const maxOn = reloj?.jugadoresEnCancha || 5;
  const courtAspect = 200 / 120;
  const stageW = stage.w || Math.max(120, windowWidth - 16);
  const stageH = stage.h || Math.max(80, windowHeight - 88);
  let courtW = stageW;
  let courtH = courtW / courtAspect;
  if (courtH > stageH) {
    courtH = stageH;
    courtW = courtH * courtAspect;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
        <View style={{ position: 'absolute', left: 8 }}>
          <BarButton label="Volver" icon="chevron-back" tone="brand" onPress={() => navigation.goBack()} theme={theme} color={colorMarca} />
        </View>
        {reloj?.activo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BarButton
              label={clock.running ? 'Pausa' : 'Inicio'}
              icon={clock.running ? 'pause' : 'play'}
              active={clock.running}
              onPress={() => {
                if (askCambio()) return;
                if (clock.running) pauseClock();
                else startClock();
              }}
              theme={theme}
              color={colorMarca}
            />
            <View style={{ minWidth: 92, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{clockLabel(remainingMs)} · P{clock.periodo}</Text>
            </View>
            <BarButton label="Siguiente" onPress={() => { if (!askCambio()) onSiguiente(); }} theme={theme} color={colorMarca} />
            <Scoreboard
              ours={nuestroScore}
              theirs={rivalScore}
              rivalOn={rivalActivo}
              away={Boolean(String(session?.lugarExterno || '').trim()) && !session?.espacio}
              color={colorMarca}
            />
          </View>
        ) : (
          <Scoreboard
            ours={nuestroScore}
            theirs={rivalScore}
            rivalOn={rivalActivo}
            away={Boolean(String(session?.lugarExterno || '').trim()) && !session?.espacio}
            color={colorMarca}
          />
        )}
      </View>
      {error ? <Text style={{ color: '#ef4444', paddingHorizontal: 12, paddingBottom: 4, fontSize: 13 }}>{error}</Text> : null}
      {extraOpen ? (
        <FadeAlert
          onPress={() => setExtraOpen(false)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 5,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>
              Ya se completaron los períodos
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
              ¿Querés agregar otro período?
            </Text>
            <TextInput
              value={extraMinutos}
              onChangeText={(text) => setExtraMinutos(text.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="Minutos"
              placeholderTextColor={theme.textMuted}
              style={{
                color: theme.text,
                fontWeight: '800',
                fontSize: 22,
                textAlign: 'center',
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingVertical: 10,
                backgroundColor: theme.background,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setExtraOpen(false)}
                style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmExtra}
                style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colorMarca }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </FadeAlert>
      ) : null}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch' }}>
        <View style={{ width: 136, justifyContent: 'center', gap: 8, paddingLeft: 8, paddingVertical: 8 }}>
          {onCourt.length < maxOn || (rivalLineup && (session?.rivalEnCancha || []).length < maxOn) ? (
            <BarButton
              label="Inicial"
              active={panel === 'quinteto'}
              onPress={() => {
                if (askCambio()) return;
                setInicialSide(onCourt.length >= maxOn && rivalLineup ? 'rival' : 'nosotros');
                setPanel('quinteto');
              }}
              theme={theme}
              color={colorMarca}
            />
          ) : null}
          <BarButton
            label="Cambio"
            active={panel === 'cambio'}
            onPress={() => {
              setSale('');
              setCambioSide('nosotros');
              setPanel(panel === 'cambio' ? '' : 'cambio');
            }}
            theme={theme}
            color={colorMarca}
          />
          {rivalLineup ? (
            <BarButton
              label="Al. Rival"
              active={panel === 'rival'}
              onPress={() => { if (!askCambio()) openRival(); }}
              theme={theme}
              color={colorMarca}
            />
          ) : null}
          <BarButton
            label="Expulsados"
            active={panel === 'fuera'}
            onPress={() => {
              if (askCambio()) return;
              setFuera('');
              setPanel(panel === 'fuera' ? '' : 'fuera');
            }}
            theme={theme}
            color={colorMarca}
          />
        </View>
        <View style={{ flex: 1 }}>
      {needsSetup ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 8 }}>Planilla</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {sheets.map((sheet) => (
              <BarButton
                key={sheet._id}
                label={sheet.nombre}
                active={sheetId === sheet._id}
                onPress={() => setSheetId(sheet._id)}
                theme={theme}
                color={colorMarca}
              />
            ))}
            {sheetId ? (
              <BarButton
                label="Editar"
                tone="brand"
                onPress={() => navigation.navigate('CoachMatchSheet', { sheetId })}
                theme={theme}
                color={colorMarca}
              />
            ) : null}
            <BarButton label="Nuevo" tone="brand" onPress={() => navigation.navigate('CoachMatchSheet')} theme={theme} color={colorMarca} />
          </View>
          {(session?.listaBuenaFe || []).length ? (
            <Text style={{ color: theme.textMuted, marginBottom: 8 }}>
              La lista de buena fe ya quedó armada al crear el partido. Desde Lista podés sumar o sacar gente el día del partido.
            </Text>
          ) : (
            <>
              <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 8 }}>Lista de buena fe</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {roster.map((athlete) => (
                  <BarButton
                    key={athlete._id}
                    label={personName(athlete)}
                    active={picked.some((row) => row.usuario === athlete._id)}
                    onPress={() => togglePick(athlete._id, 'jugador')}
                    theme={theme}
                    color={colorMarca}
                  />
                ))}
                {staff.map((person) => (
                  <BarButton
                    key={person._id}
                    label={`${personName(person)} · staff`}
                    active={picked.some((row) => row.usuario === person._id)}
                    onPress={() => togglePick(person._id, 'staff')}
                    theme={theme}
                    color={colorMarca}
                  />
                ))}
              </View>
            </>
          )}
          <View style={{ alignSelf: 'flex-start', marginTop: 12 }}>
            <BarButton
              label={(session?.listaBuenaFe || []).length ? 'Usar esta planilla' : 'Usar en este partido'}
              active
              onPress={saveSetup}
              theme={theme}
              color={colorMarca}
            />
          </View>
        </ScrollView>
      ) : (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setStage({ w: Math.max(0, width - 8), h: Math.max(0, height - 8) });
          }}
        >
          <MatchCourtBoard
            imagenUrl={planilla?.cancha?.imagenUrl}
            deporte={planilla?.cancha?.deporte}
            horizontal
            width={courtW}
            height={courtH}
            theme={theme}
            marks={courtMarks}
            logoUrl={clubData?.logoUrl || ''}
            onTap={(spot) => { if (!askCambio()) setStep({ ...spot }); }}
          />
        </View>
      )}
        </View>
        <View style={{ width: 118, justifyContent: 'center', alignItems: 'flex-end', gap: 8, paddingRight: 8, paddingVertical: 8 }}>
          {contarPosesion ? (
            <BarButton
              label={ball === 'rival' ? 'Rival' : 'Nosotros'}
              active={Boolean(ball)}
              onPress={() => { if (!askCambio()) giveBall(ball === 'nosotros' ? 'rival' : 'nosotros'); }}
              theme={theme}
              color={colorMarca}
            />
          ) : null}
          <BarButton
            label="Stats"
            active={panel === 'stats'}
            onPress={() => {
              if (askCambio()) return;
              setOpenStatId(null);
              setPanel(panel === 'stats' ? '' : 'stats');
            }}
            theme={theme}
            color={colorMarca}
          />
          <BarButton label="Acciones" onPress={() => { if (!askCambio()) navigation.navigate('CoachMatchActions', { sessionId }); }} theme={theme} color={colorMarca} />
          <BarButton label="Enviar" tone="send" onPress={() => { if (!askCambio()) setEndOpen(true); }} theme={theme} color={colorMarca} />
        </View>
      </View>
      {step ? (
        <FadeAlert
          onPress={() => setStep(null)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 36,
            paddingVertical: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 820,
              maxHeight: '100%',
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 12 }}>
              {step.campo ? 'Quién hizo la jugada' : 'Qué pasó'}
            </Text>
            {step.campo ? (
              <>
                {rivalActivo ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                    {[
                      { id: 'nosotros', label: 'Nosotros' },
                      { id: 'rival', label: 'Rival' },
                    ].map((option) => {
                      const on = (step.equipo || 'nosotros') === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() => setStep((prev) => ({ ...prev, equipo: option.id }))}
                          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca : theme.background }}
                        >
                          <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800', fontSize: 14 }}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                <ScrollView
                  style={{ flexGrow: 0, maxHeight: Math.max(160, windowHeight - 220) }}
                  contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}
                >
                  {(step.equipo || 'nosotros') === 'rival' ? (
                    rivalLineup ? (
                      (session?.rivalEnCancha || []).length ? (session?.rivalAlineacion || []).filter((row) => (session?.rivalEnCancha || []).map(String).includes(String(row._id))).map((row) => (
                        <TouchableOpacity
                          key={row._id}
                          activeOpacity={0.75}
                          onPress={() => logPlay({ equipo: 'rival', rivalJugador: String(row._id) })}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 20,
                            paddingVertical: 16,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colorMarca,
                            backgroundColor: theme.background,
                          }}
                        >
                          <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{row.nombre?.trim() || 'Jugador'}</Text>
                        </TouchableOpacity>
                      )) : (
                        <Text style={{ color: theme.textMuted, fontWeight: '700', paddingVertical: 12 }}>No hay jugadores del rival en cancha.</Text>
                      )
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => logPlay({ equipo: 'rival' })}
                        style={{
                          paddingHorizontal: 20,
                          paddingVertical: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colorMarca,
                          backgroundColor: theme.background,
                        }}
                      >
                        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Rival</Text>
                      </TouchableOpacity>
                    )
                  ) : statPlayers.map((row) => {
                    const id = idOf(row.usuario);
                    const out = suspended.has(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        disabled={out}
                        activeOpacity={0.75}
                        onPress={() => logPlay({ usuario: id })}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 20,
                          paddingVertical: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: out ? '#9ca3af' : colorMarca,
                          backgroundColor: theme.background,
                        }}
                      >
                        <UserAvatar user={row.usuario} size={36} colorMarca={out ? '#9ca3af' : colorMarca} />
                        <Text style={{ color: out ? '#9ca3af' : colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                        <Text style={{ color: out ? '#9ca3af' : theme.text, fontWeight: '800', fontSize: 16 }}>{personName(row.usuario)}</Text>
                        {out ? <Text style={{ color: '#9ca3af', fontWeight: '700', fontSize: 13 }}>Afuera</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <ScrollView
                style={{ width: '100%', flexGrow: 0, maxHeight: Math.max(160, windowHeight - 180) }}
                contentContainerStyle={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}
              >
                {actionCampos.map((campo) => (
                  <View key={campo._id} style={{ width: 210, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background, paddingHorizontal: 8, paddingVertical: 8, gap: 6 }}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14, textAlign: 'center' }} numberOfLines={1}>{campo.etiqueta}</Text>
                    {campo.tipo === 'porcentaje' && Number(campo.puntos) > 0 ? (
                      <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>Suma {campo.puntos}</Text>
                    ) : null}
                    {isCounterTotal(campo) || isLimitStat(campo) ? (
                      <TouchableOpacity
                        onPress={() => setStep((prev) => ({ ...prev, campo, resultado: 'anoto' }))}
                        style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: colorMarca }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>+1</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 6, width: '100%', justifyContent: 'center' }}>
                        <TouchableOpacity
                          onPress={() => setStep((prev) => ({ ...prev, campo, resultado: 'anoto' }))}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 8, backgroundColor: '#16a34a' }}
                        >
                          <MatchMark tipo={campo.iconoAnoto} size={14} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Anotó</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setStep((prev) => ({ ...prev, campo, resultado: 'erro' }))}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 8, backgroundColor: '#dc2626' }}
                        >
                          <MatchMark tipo={campo.iconoErro} size={14} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Erró</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </FadeAlert>
      ) : null}
      {panel === 'quinteto' || panel === 'cambio' ? (
        <FadeAlert
          onPress={() => { setPanel(''); setSale(''); }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 760,
              maxHeight: '86%',
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
            }}
          >
            {panel === 'quinteto' ? (
              <>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>Inicial</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                  Elegí {maxOn} para empezar.
                </Text>
                {rivalLineup ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                    {[
                      { id: 'nosotros', label: 'Nosotros' },
                      { id: 'rival', label: 'Rival' },
                    ].map((option) => {
                      const on = inicialSide === option.id;
                      const count = option.id === 'rival' ? (session?.rivalEnCancha || []).length : onCourt.length;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() => setInicialSide(option.id)}
                          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca : theme.background }}
                        >
                          <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800', fontSize: 14 }}>{option.label} {count}/{maxOn}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{onCourt.length}/{maxOn}</Text>
                )}
                <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {inicialSide === 'rival' && rivalLineup ? (
                    (session?.rivalAlineacion || []).length ? (session.rivalAlineacion || []).map((row) => {
                      const id = String(row._id);
                      const selected = (session?.rivalEnCancha || []).map(String).includes(id);
                      return (
                        <TouchableOpacity
                          key={id}
                          activeOpacity={0.75}
                          onPress={() => {
                            const current = (session?.rivalEnCancha || []).map(String);
                            if (selected) saveRivalCourt(current.filter((item) => item !== id));
                            else if (current.length < maxOn) saveRivalCourt([...current, id]);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 20,
                            paddingVertical: 16,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: selected ? colorMarca : theme.border,
                            backgroundColor: selected ? colorMarca : theme.background,
                          }}
                        >
                          <Text style={{ color: selected ? '#fff' : colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                          <Text style={{ color: selected ? '#fff' : theme.text, fontWeight: '800', fontSize: 16 }}>{row.nombre?.trim() || 'Jugador'}</Text>
                        </TouchableOpacity>
                      );
                    }) : (
                      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                        <Text style={{ color: theme.textMuted, fontWeight: '700', textAlign: 'center' }}>Primero cargá los números del rival.</Text>
                        <TouchableOpacity
                          onPress={openRival}
                          style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colorMarca }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Alineación</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  ) : jugadores.map((row) => {
                    const id = idOf(row.usuario);
                    const inside = onCourt.includes(id);
                    const out = suspended.has(id) && !inside;
                    return (
                      <TouchableOpacity
                        key={id}
                        disabled={out}
                        activeOpacity={0.75}
                        onPress={async () => {
                          if (out) return;
                          const next = inside ? onCourt.filter((item) => item !== id) : [...onCourt, id];
                          if (!inside && onCourt.length >= maxOn) return;
                          await saveLineup(next);
                          if (next.length >= maxOn) {
                            if (rivalLineup && (session?.rivalEnCancha || []).length < maxOn) setInicialSide('rival');
                            else setPanel('');
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 20,
                          paddingVertical: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: out ? '#9ca3af' : colorMarca,
                          backgroundColor: inside ? colorMarca : theme.background,
                        }}
                      >
                        <UserAvatar user={row.usuario} size={36} colorMarca={out ? '#9ca3af' : inside ? '#fff' : colorMarca} />
                        <Text style={{ color: out ? '#9ca3af' : inside ? '#fff' : colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                        <Text style={{ color: out ? '#9ca3af' : inside ? '#fff' : theme.text, fontWeight: '800', fontSize: 16 }}>{personName(row.usuario)}</Text>
                        {out ? <Text style={{ color: '#9ca3af', fontWeight: '700', fontSize: 13 }}>Afuera</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
            {(() => {
              const rivalRows = session?.rivalAlineacion || [];
              const rivalOn = (session?.rivalEnCancha || []).map(String);
              const rivalPick = rivalRows.filter((row) => (sale ? !rivalOn.includes(String(row._id)) : rivalOn.includes(String(row._id))));
              const leavingRival = rivalRows.find((row) => String(row._id) === sale);
              const leavingName = cambioSide === 'rival'
                ? (leavingRival?.nombre?.trim()
                  ? `${leavingRival.dorsal || '–'} ${leavingRival.nombre.trim()}`
                  : `Jugador ${leavingRival?.dorsal || '–'}`)
                : personName(jugadores.find((row) => idOf(row.usuario) === sale)?.usuario);
              const forcedOut = cambioSide !== 'rival' && sale && suspended.get(sale) === 'expulsado';
              return (
                <>
                  {forcedOut ? (
                    <>
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>{leavingName}</Text>
                      <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>Expulsado</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, textAlign: 'center', marginBottom: 4 }}>
                        {sale ? 'Quién entra' : 'Quién sale'}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
                        {sale ? `${leavingName} sale. Elegí quién entra.` : 'Elegí quién sale de la cancha.'}
                      </Text>
                    </>
                  )}
                  {rivalLineup && !forcedOut ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                      {[
                        { id: 'nosotros', label: 'Nosotros' },
                        { id: 'rival', label: 'Rival' },
                      ].map((option) => {
                        const on = cambioSide === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            onPress={() => { setSale(''); setCambioSide(option.id); }}
                            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? colorMarca : theme.border, backgroundColor: on ? colorMarca : theme.background }}
                          >
                            <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800', fontSize: 14 }}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                  <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {cambioSide === 'rival' && rivalLineup ? (
                      rivalPick.length ? rivalPick.map((row) => {
                        const id = String(row._id);
                        return (
                          <TouchableOpacity
                            key={id}
                            activeOpacity={0.75}
                            onPress={() => {
                              if (!sale) {
                                setSale(id);
                                return;
                              }
                              saveRivalCourt(rivalOn.filter((item) => item !== sale).concat(id));
                              setSale('');
                              setPanel('');
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              paddingHorizontal: 20,
                              paddingVertical: 16,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: colorMarca,
                              backgroundColor: theme.background,
                            }}
                          >
                            <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{row.nombre?.trim() || 'Jugador'}</Text>
                          </TouchableOpacity>
                        );
                      }) : (
                        <Text style={{ color: theme.textMuted, fontWeight: '700', textAlign: 'center', paddingVertical: 12 }}>
                          {sale ? 'No hay jugadores en el banco.' : 'Primero armá el inicial del rival.'}
                        </Text>
                      )
                    ) : jugadores.filter((row) => {
                      const on = onCourt.includes(idOf(row.usuario));
                      return sale ? !on : on;
                    }).map((row) => {
                      const id = idOf(row.usuario);
                      const out = suspended.has(id);
                      const blocked = Boolean(out) && Boolean(sale);
                      return (
                        <TouchableOpacity
                          key={id}
                          disabled={blocked}
                          activeOpacity={0.75}
                          onPress={async () => {
                            if (blocked) return;
                            if (!sale) {
                              setSale(id);
                              return;
                            }
                            try {
                              await post(`/sessions/${sessionId}/reloj`, clockBody('cambio', { sale, entra: id }));
                              setSale('');
                              setPanel('');
                            } catch (e) {
                              setError(e.response?.data?.message || 'No se pudo hacer el cambio.');
                            }
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 20,
                            paddingVertical: 16,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: blocked ? '#9ca3af' : colorMarca,
                            backgroundColor: theme.background,
                          }}
                        >
                          <UserAvatar user={row.usuario} size={36} colorMarca={blocked ? '#9ca3af' : colorMarca} />
                          <Text style={{ color: blocked ? '#9ca3af' : colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                          <Text style={{ color: blocked ? '#9ca3af' : theme.text, fontWeight: '800', fontSize: 16 }}>{personName(row.usuario)}</Text>
                          {blocked ? <Text style={{ color: '#9ca3af', fontWeight: '700', fontSize: 13 }}>Afuera</Text> : null}
                          {!blocked && !sale && suspended.get(id) === 'expulsado' ? <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13 }}>Expulsado</Text> : null}
                        </TouchableOpacity>
                      );
                    })}
                    {cambioSide !== 'rival' && !onCourt.length ? (
                      <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 12 }}>Primero armá el quinteto inicial.</Text>
                    ) : null}
                    {cambioSide !== 'rival' && sale && !jugadores.some((row) => !onCourt.includes(idOf(row.usuario))) ? (
                      <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 12 }}>No hay jugadores en el banco.</Text>
                    ) : null}
                  </ScrollView>
                </>
              );
            })()}
              </>
            )}
          </Pressable>
        </FadeAlert>
      ) : null}
      {panel === 'fuera' ? (
        <FadeAlert
          onPress={() => { setPanel(''); setFuera(''); }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: fuera ? 420 : 760,
              maxHeight: '86%',
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 4 }}>
              {fuera ? (suspended.get(fuera) === 'temporal' ? 'Volver' : 'Cómo queda fuera') : 'Quién queda fuera'}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {fuera
                ? personName(jugadores.find((row) => idOf(row.usuario) === fuera)?.usuario)
                : 'Mientras esté afuera no puede sumar estadísticas.'}
            </Text>
            {fuera ? (
              <View style={{ gap: 10 }}>
                {suspended.get(fuera) === 'temporal' ? (
                  <TouchableOpacity
                    onPress={() => markOut('')}
                    style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: colorMarca }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Vuelve a poder jugar</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => markOut('temporal')}
                      style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colorMarca }}
                    >
                      <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 16 }}>Temporal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => markOut('expulsado')}
                      style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: colorMarca }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Expulsado</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <ScrollView
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}
              >
                {jugadores.map((row) => {
                  const id = idOf(row.usuario);
                  const out = suspended.get(id);
                  const blocked = out === 'expulsado';
                  return (
                    <TouchableOpacity
                      key={id}
                      disabled={blocked}
                      activeOpacity={0.75}
                      onPress={() => setFuera(id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 20,
                        paddingVertical: 16,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: out ? '#9ca3af' : colorMarca,
                        backgroundColor: theme.background,
                      }}
                    >
                      <UserAvatar user={row.usuario} size={36} colorMarca={out ? '#9ca3af' : colorMarca} />
                      <Text style={{ color: out ? '#9ca3af' : colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal || '–'}</Text>
                      <Text style={{ color: out ? '#9ca3af' : theme.text, fontWeight: '800', fontSize: 16 }}>{personName(row.usuario)}</Text>
                      {out ? (
                        <Text style={{ color: '#9ca3af', fontWeight: '700', fontSize: 13 }}>
                          {out === 'expulsado' ? 'Expulsado' : 'Temporal'}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </FadeAlert>
      ) : null}
      {endOpen ? (
        <FadeAlert
          onPress={() => setEndOpen(false)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 6,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>
              ¿Estás seguro de que querés terminar la sesión?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setEndOpen(false)}
                style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={finish}
                style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#16a34a' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Sí</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </FadeAlert>
      ) : null}
      {panel === 'stats' ? (
        <FadeAlert
          onPress={() => {
            if (ended) {
              navigation.goBack();
              return;
            }
            setPanel('');
            setOpenStatId(null);
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '86%',
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
            }}
          >
            {(() => {
              const openStat = summary.find((row) => String(row.id) === String(openStatId));
              const statValue = (row) => (
                row.limite
                  ? `${row.anoto}/${row.limite}`
                  : row.counter
                    ? String(row.anoto)
                    : `${row.anoto}/${row.anoto + row.erro}${row.porcentaje == null ? '' : `  ${row.porcentaje}%`}`
              );
              if (openStat) {
                const people = jugadores.map((person) => {
                  const counts = countsFor(session?.jugadas, idOf(person.usuario), openStat.campoIds);
                  return {
                    id: idOf(person.usuario),
                    dorsal: person.dorsal,
                    nombre: personName(person.usuario),
                    counter: openStat.counter,
                    limite: openStat.limite,
                    ...counts,
                  };
                }).sort((a, b) => (b.anoto + b.erro) - (a.anoto + a.erro) || a.nombre.localeCompare(b.nombre, 'es'));
                return (
                  <>
                    <TouchableOpacity
                      onPress={() => setOpenStatId(null)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}
                    >
                      <Ionicons name="chevron-back" size={18} color={colorMarca} />
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{openStat.etiqueta}</Text>
                    </TouchableOpacity>
                    <ScrollView style={{ flexGrow: 0 }}>
                      {people.length === 0 ? (
                        <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 12 }}>
                          No hay jugadores en la lista.
                        </Text>
                      ) : (
                        people.map((person) => (
                          <View
                            key={person.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 12,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: theme.border,
                            }}
                          >
                            <Text style={{ width: 32, color: colorMarca, fontWeight: '800', fontSize: 16 }}>{person.dorsal || ''}</Text>
                            <Text style={{ flex: 1, color: theme.text, fontWeight: '700', fontSize: 16 }}>{person.nombre}</Text>
                            <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 16 }}>{statValue(person)}</Text>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </>
                );
              }
              return (
                <>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 12 }}>
                    Estadísticas
                  </Text>
                  <ScrollView style={{ flexGrow: 0 }}>
                    {summary.length === 0 ? (
                      <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 12 }}>
                        Todavía no hay estadísticas.
                      </Text>
                    ) : (
                      summary.map((row) => (
                        <TouchableOpacity
                          key={row.id}
                          activeOpacity={0.75}
                          onPress={() => setOpenStatId(row.id)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: theme.border,
                          }}
                        >
                          <Text style={{ flex: 1, color: theme.text, fontWeight: '700', fontSize: 16 }}>{row.etiqueta}</Text>
                          <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 16 }}>{statValue(row)}</Text>
                          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                  {ended && !openStat ? (
                    <TouchableOpacity
                      onPress={() => navigation.goBack()}
                      style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colorMarca }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Listo</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              );
            })()}
          </Pressable>
        </FadeAlert>
      ) : null}
      {panel === 'rival' && rivalDraft ? (
        <FadeAlert
          onPress={() => { setPanel(''); setRivalDraft(null); }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 52,
            bottom: insets.bottom,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 760,
              maxHeight: '86%',
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
              gap: 10,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>Alineación del rival</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>Número obligatorio. El nombre es opcional. Después, en Inicial, elegí quiénes entran.</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={rivalDorsal}
                onChangeText={(text) => setRivalDorsal(text.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                placeholder="Nº"
                placeholderTextColor={theme.textMuted}
                style={{ width: 64, color: theme.text, fontWeight: '800', textAlign: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, backgroundColor: theme.background }}
              />
              <TextInput
                value={rivalNombre}
                onChangeText={setRivalNombre}
                placeholder="Nombre"
                placeholderTextColor={theme.textMuted}
                style={{ flex: 1, color: theme.text, fontWeight: '700', borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.background }}
              />
              <TouchableOpacity onPress={addRivalPlayer} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colorMarca }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Agregar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {rivalDraft.rows.map((row) => (
                <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    }}
                  >
                    <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 16 }}>{row.dorsal}</Text>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{row.nombre?.trim() || 'Jugador'}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setRivalDraft((draft) => ({
                      rows: draft.rows.filter((item) => item.id !== row.id),
                      on: draft.on.filter((id) => id !== row.id),
                    }))}
                  >
                    <Text style={{ color: '#ef4444', fontWeight: '800' }}>Quitar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              <TouchableOpacity onPress={() => { setPanel(''); setRivalDraft(null); }} style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontWeight: '800' }}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveRivalLineup} style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colorMarca }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </FadeAlert>
      ) : null}
      {panel === 'datos' ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: theme.surface, borderRadius: 12, padding: 12 }}>
          {(planilla?.campos || [])
            .filter((campo) => campo.tipo !== 'porcentaje' && campo.tipo !== 'total' && campo.alcance === 'partido')
            .map((campo) => (
              <TextInput
                key={campo._id}
                value={String(valores[campo._id] ?? '')}
                onChangeText={(text) => setValores((prev) => ({ ...prev, [campo._id]: campo.tipo === 'numero' ? text : text }))}
                placeholder={campo.etiqueta}
                placeholderTextColor={theme.textMuted}
                style={{ color: theme.text, borderBottomWidth: 1, borderColor: theme.border, marginBottom: 8 }}
              />
            ))}
          <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <BarButton label="Guardar" active onPress={saveDatos} theme={theme} color={colorMarca} />
          </View>
        </View>
      ) : null}
      {session?.informeEnviadoEn ? (
        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingBottom: 8 }}>
          <BarButton
            label="Corregir y reenviar"
            tone="brand"
            onPress={async () => {
              try {
                await post(`/sessions/${sessionId}/informe`, { accion: 'corregir' });
              } catch (e) {
                setError(e.response?.data?.message || 'No se pudo reabrir.');
              }
            }}
            theme={theme}
            color={colorMarca}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
