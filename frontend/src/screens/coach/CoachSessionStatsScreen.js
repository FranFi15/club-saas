import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { sortByNombre } from '../../utils/listSort';
import CoachCategoryFilter from '../../components/CoachCategoryFilter';
import CoachStatsBarChart from '../../components/CoachStatsBarChart';
import EnfoqueBarChart from '../../components/EnfoqueBarChart';
import DesignCard from '../../components/DesignCard';
import MatchCourtBoard from '../../components/MatchCourtBoard';
import Foldable, { FoldableChevron } from '../../components/Foldable';
import {
  formatSessionCalendarWhen,
  isoCalendarDateToDisplay,
} from '../../utils/dateDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import {
  countsFor,
  idOf,
  isCounterTotal,
  isLimitStat,
  porcentajeIdsOf,
  scorePoints,
  sumsOnlyTotals,
} from '../../utils/matchDerive';

const PERIOD_KEYS = ['semana', 'mes', 'historico'];
const PERIOD_SHORT = { semana: '7 días', mes: 'Mes', historico: 'Hist.' };

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value}%`;
}

const ENFOQUE_LABEL = {
  ofensivo: 'Ofensivo',
  defensivo: 'Defensivo',
  transicion_ataque: 'Tr. ataque',
  transicion_defensa: 'Tr. defensa',
  fisico: 'Físico',
  tecnico: 'Técnico',
  neutro: 'Neutro',
};

function personName(user) {
  if (!user || typeof user !== 'object') return 'Jugador';
  return `${user.nombre || ''} ${user.apellido || ''}`.trim() || 'Jugador';
}

function statValue(row) {
  if (row.limite) return `${row.anoto}/${row.limite}`;
  if (row.counter) return String(row.anoto);
  return `${row.anoto}/${row.anoto + row.erro}${row.porcentaje == null ? '' : `  ${row.porcentaje}%`}`;
}

function shotMarks(partido, personId, campoIds, side) {
  const ids = new Set((campoIds || []).map(String));
  const campos = partido?.planilla?.campos || [];
  return (partido?.jugadas || [])
    .filter((play) => {
      if (!ids.has(String(play.campoId))) return false;
      if ((play.equipo || 'nosotros') !== side) return false;
      const x = Number(play.x);
      const y = Number(play.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (side === 'rival') return String(play.rivalJugador || '') === String(personId);
      return idOf(play.usuario) === String(personId);
    })
    .map((play) => {
      const campo = campos.find((item) => String(item._id) === String(play.campoId));
      const made = play.resultado !== 'erro';
      return {
        x: Number(play.x),
        y: Number(play.y),
        icono: made ? (campo?.iconoAnoto || 'circulo') : (campo?.iconoErro || 'x'),
        color: made ? '#22c55e' : '#ef4444',
      };
    });
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
    <View style={{ flexDirection: 'row', alignSelf: 'center', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
      {cells.map((cell) => (
        <View
          key={cell.key}
          style={{ minWidth: 88, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: cell.ours ? color : '#9ca3af' }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{cell.label}</Text>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{cell.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function CoachSessionStatsScreen({ navigation, route }) {
  const sessionId = route.params?.sessionId;
  const vistaJugador = route.params?.vistaJugador === true;
  const atletaId = route.params?.atletaId;
  const isSingleSession = Boolean(sessionId);
  const initialCategoryId = route.params?.categoriaId ?? null;
  const isAdminVariant = route.params?.variant === 'admin';

  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const chartWidth = Math.min(Dimensions.get('window').width - 32, 400);

  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);

  const statsCacheKey = clubData?.urlIdentifier
    ? isSingleSession
      ? `coach-session-stats:${clubData.urlIdentifier}:session:${sessionId}`
      : `coach-session-stats:${clubData.urlIdentifier}:cat:${selectedCategoryId || 'all'}${isAdminVariant ? ':admin' : ''}`
    : '';

  const cachedStats = readScreenCache(statsCacheKey);
  const [categories, setCategories] = useState(() => cachedStats?.categories ?? []);
  const [periodos, setPeriodos] = useState(() => cachedStats?.periodos ?? null);
  const [singleStats, setSingleStats] = useState(() => cachedStats?.singleStats ?? null);
  const [partido, setPartido] = useState(() => cachedStats?.partido ?? null);
  const [plan, setPlan] = useState(() => cachedStats?.plan ?? null);
  const [openStatId, setOpenStatId] = useState(null);
  const [openPlayerId, setOpenPlayerId] = useState(null);
  const [statSide, setStatSide] = useState('nosotros');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [period, setPeriod] = useState('semana');

  const fetchStats = useCallback(async () => {
    const h = await clubHeaders(clubData);
    if (isSingleSession) {
      if (vistaJugador) {
        const res = await clubApi.get(`/sessions/${sessionId}/partido-vista`, {
          headers: h,
          params: atletaId ? { atletaId } : undefined,
        });
        return {
          singleStats: {
            sesion: {
              tipo: 'partido',
              fecha: res.data?.fecha,
              estado: 'completada',
              categoria: { nombre: res.data?.nombreSesion || 'Partido' },
            },
          },
          periodos: null,
          categories: [],
          partido: res.data,
        };
      }
      const res = await clubApi.get(`/sessions/${sessionId}/stats`, { headers: h });
      const full = await clubApi.get(`/sessions/${sessionId}`, { headers: h });
      const match = res.data?.sesion?.tipo === 'partido' ? full.data : null;
      return {
        singleStats: res.data,
        periodos: null,
        categories: [],
        partido: match,
        plan: full.data?.planEntrenamiento || null,
      };
    }
    const qs = selectedCategoryId ? `?categoriaId=${selectedCategoryId}` : '';
    const res = await clubApi.get(`/sessions/profe/stats${qs}`, { headers: h });
    return {
      categories: sortByNombre(res.data.categorias || []),
      periodos: res.data.periodos || null,
      singleStats: null,
      partido: null,
      plan: null,
    };
  }, [clubData, isSingleSession, sessionId, selectedCategoryId, vistaJugador, atletaId]);

  const applyStats = useCallback((data) => {
    setCategories(data.categories ?? []);
    setPeriodos(data.periodos ?? null);
    setSingleStats(data.singleStats ?? null);
    setPartido(data.partido ?? null);
    setPlan(data.plan ?? null);
  }, []);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: statsCacheKey,
    enabled: !!statsCacheKey,
    fetchData: fetchStats,
    onFetched: applyStats,
  });

  const onCategoryChange = (id) => {
    setSelectedCategoryId(id);
  };

  const showInitialLoader = loading && !periodos && !singleStats;

  const current = isSingleSession ? singleStats : periodos?.[period];

  const sessionSubtitle = useMemo(() => {
    if (!isSingleSession || !singleStats?.sesion) return '';
    const s = singleStats.sesion;
    return formatSessionCalendarWhen(s.fecha, s.horaInicio, s.horaFin, { weekdayStyle: 'long' });
  }, [isSingleSession, singleStats]);

  const asistenciaItems = useMemo(() => {
    if (isSingleSession && singleStats?.asistenciaDetalle) {
      const d = singleStats.asistenciaDetalle;
      return [
        { label: 'Presente', value: d.presente, color: '#22c55e' },
        { label: 'Tarde', value: d.tarde, color: '#f59e0b' },
        { label: 'Ausente', value: d.ausente, color: '#ef4444' },
      ].filter((it) => it.value > 0);
    }
    const v = current?.promedioAsistenciaPct;
    if (v == null) return [];
    return [{ label: 'Promedio', value: v, color: colorMarca }];
  }, [isSingleSession, singleStats, current, colorMarca]);

  const maxAsistencia = isSingleSession
    ? Math.max(...asistenciaItems.map((i) => i.value), 1)
    : 100;

  const isPartido = isSingleSession && (singleStats?.sesion?.tipo === 'partido' || partido?.tipo === 'partido');
  const matchSummary = useMemo(() => {
    if (!isPartido) return [];
    const campos = partido?.planilla?.campos || [];
    const jugadas = partido?.jugadas || [];
    const shots = campos
      .filter((campo) => campo.tipo === 'porcentaje')
      .map((campo) => ({
        id: campo._id,
        etiqueta: campo.etiqueta,
        counter: false,
        campoIds: [String(campo._id)],
        ours: countsFor(jugadas, null, [campo._id], 'nosotros'),
        rival: countsFor(jugadas, null, [campo._id], 'rival'),
      }));
    const totals = campos
      .filter((campo) => campo.tipo === 'total')
      .map((campo) => ({
        id: campo._id,
        etiqueta: campo.etiqueta,
        counter: isCounterTotal(campo) || sumsOnlyTotals(campo, campos),
        campoIds: isCounterTotal(campo) ? [String(campo._id)] : [...porcentajeIdsOf(campo, campos)].map(String),
        ours: countsFor(jugadas, null, isCounterTotal(campo) ? [campo._id] : [...porcentajeIdsOf(campo, campos)], 'nosotros'),
        rival: countsFor(jugadas, null, isCounterTotal(campo) ? [campo._id] : [...porcentajeIdsOf(campo, campos)], 'rival'),
      }));
    const limits = campos
      .filter((campo) => isLimitStat(campo))
      .map((campo) => ({
        id: campo._id,
        etiqueta: campo.etiqueta,
        counter: true,
        limite: Number(campo.limite) || 5,
        campoIds: [String(campo._id)],
        ours: countsFor(jugadas, null, [campo._id], 'nosotros'),
        rival: countsFor(jugadas, null, [campo._id], 'rival'),
      }));
    return [...shots, ...totals, ...limits];
  }, [isPartido, partido]);
  const rivalOn = partido?.planilla?.rival?.activo === true;
  const away = Boolean(String(partido?.lugarExterno || '').trim()) && !partido?.espacio;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {isAdminVariant ? (
        <AdminScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          kicker="Categoría"
          title={isSingleSession ? 'Estadísticas de la sesión' : 'Estadísticas de sesiones'}
          subtitle={
            isSingleSession
              ? `${singleStats?.sesion?.categoria?.nombre || ''}${sessionSubtitle ? ` · ${sessionSubtitle}` : ''}`.trim() ||
                'Sesión'
              : selectedCategoryId
                ? categories.find((c) => String(c._id) === String(selectedCategoryId))?.nombre ||
                  'Categoría seleccionada'
                : 'Todas las categorías · semana, mes e histórico'
          }
          onBack={() => navigation.goBack()}
        />
      ) : (
        <CoachScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          kicker="Sesiones"
          title={isSingleSession ? 'Estadísticas de la sesión' : 'Estadísticas generales'}
          subtitle={
            isSingleSession
              ? `${singleStats?.sesion?.categoria?.nombre || ''}${sessionSubtitle ? ` · ${sessionSubtitle}` : ''}`.trim() ||
                'Sesión'
              : selectedCategoryId
                ? categories.find((c) => String(c._id) === String(selectedCategoryId))?.nombre ||
                  'Categoría seleccionada'
                : 'Todas las categorías · semana, mes e histórico'
          }
          onBack={() => navigation.goBack()}
        />
      )}

      {showInitialLoader ? (
        <ClubSpinLoader size={56} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
        >
          {isPartido ? (
            <>
              <Text style={[styles.intro, { color: theme.textMuted }]}>
                Números de este partido. Tocá una estadística para ver a cada jugador, y a un jugador para ver en la cancha lo que entró y lo que erró.
              </Text>
              <Scoreboard
                ours={scorePoints(partido?.jugadas, partido?.planilla?.campos, 'nosotros')}
                theirs={scorePoints(partido?.jugadas, partido?.planilla?.campos, 'rival')}
                rivalOn={rivalOn}
                away={away}
                color={colorMarca}
              />
              {rivalOn ? (
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                  {[
                    { id: 'nosotros', label: 'Nosotros' },
                    { id: 'rival', label: 'Rival' },
                  ].map((option) => {
                    const on = statSide === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => { setStatSide(option.id); setOpenStatId(null); setOpenPlayerId(null); }}
                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? (option.id === 'rival' ? '#9ca3af' : colorMarca) : theme.border, backgroundColor: on ? (option.id === 'rival' ? '#9ca3af' : colorMarca) : theme.surface }}
                      >
                        <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '800', fontSize: 14 }}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              {matchSummary.map((row) => {
                const open = String(openStatId) === String(row.id);
                const side = statSide === 'rival' && rivalOn ? 'rival' : 'nosotros';
                const tone = side === 'rival' ? '#9ca3af' : colorMarca;
                const counts = side === 'rival' ? row.rival : row.ours;
                const lineup = partido?.planilla?.rival?.modo === 'alineacion';
                const players = side === 'rival'
                  ? (lineup ? (partido?.rivalAlineacion || []) : [])
                  : (partido?.listaBuenaFe || []).filter((item) => item.tipoPersona !== 'staff');
                return (
                  <View key={row.id} style={[styles.matchRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => { setOpenStatId(open ? null : row.id); setOpenPlayerId(null); }}
                      style={styles.matchHead}
                    >
                      <Text style={{ flex: 1, color: theme.text, fontWeight: '800', fontSize: 16 }}>{row.etiqueta}</Text>
                      <Text style={{ color: tone, fontWeight: '800', fontSize: 16 }}>{statValue({ ...row, ...counts })}</Text>
                      <FoldableChevron open={open} color={theme.textMuted} size={16} />
                    </TouchableOpacity>
                    <Foldable open={open}>
                    {side === 'rival' && !lineup ? (
                      <Text style={{ color: theme.textMuted, fontWeight: '700', paddingHorizontal: 14, paddingBottom: 12 }}>El rival se anota en general.</Text>
                    ) : null}
                    {players.map((person) => {
                      const personId = side === 'rival' ? String(person._id) : idOf(person.usuario);
                      const personCounts = side === 'rival'
                        ? countsFor((partido?.jugadas || []).filter((play) => String(play.rivalJugador) === String(person._id)), null, row.campoIds, 'rival')
                        : countsFor(partido?.jugadas, idOf(person.usuario), row.campoIds);
                      const label = side === 'rival'
                        ? (person.nombre?.trim() || 'Jugador')
                        : personName(person.usuario);
                      const selected = String(openPlayerId) === personId;
                      const marks = selected ? shotMarks(partido, personId, row.campoIds, side) : [];
                      return (
                        <View key={personId} style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setOpenPlayerId(selected ? null : personId)}
                            style={[styles.playerRow, { borderTopWidth: 0 }]}
                          >
                            <Text style={{ width: 32, color: tone, fontWeight: '800' }}>{person.dorsal || ''}</Text>
                            <Text style={{ flex: 1, color: theme.text, fontWeight: '700' }}>{label}</Text>
                            <Text style={{ color: tone, fontWeight: '800' }}>{statValue({ ...row, ...personCounts })}</Text>
                            <FoldableChevron open={selected} color={theme.textMuted} size={16} />
                          </TouchableOpacity>
                          <Foldable open={selected}>
                            <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                              <View style={{ flexDirection: 'row', gap: 14, marginBottom: 8 }}>
                                <Text style={{ color: '#22c55e', fontWeight: '800' }}>Entró</Text>
                                <Text style={{ color: '#ef4444', fontWeight: '800' }}>Erró</Text>
                              </View>
                              {marks.length ? (
                                <MatchCourtBoard
                                  imagenUrl={partido?.planilla?.cancha?.imagenUrl}
                                  deporte={partido?.planilla?.cancha?.deporte}
                                  horizontal
                                  width={Math.min(Dimensions.get('window').width - 60, 520)}
                                  theme={theme}
                                  marks={marks}
                                  logoUrl={clubData?.logoUrl || ''}
                                  onTap={() => {}}
                                />
                              ) : (
                                <Text style={{ color: theme.textMuted, fontWeight: '700' }}>
                                  Este jugador no tiene marcas en la cancha para esta estadística.
                                </Text>
                              )}
                            </View>
                          </Foldable>
                        </View>
                      );
                    })}
                    </Foldable>
                  </View>
                );
              })}
              {!matchSummary.length ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>Este partido todavía no tiene estadísticas.</Text>
              ) : null}
              {vistaJugador ? null : partido?.informeEnviadoEn ? (
                <Text style={{ color: theme.textMuted, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>Enviado a los jugadores</Text>
              ) : (
                <TouchableOpacity
                  disabled={sending}
                  onPress={async () => {
                    setSending(true);
                    setSendError('');
                    try {
                      const h = await clubHeaders(clubData);
                      const { data } = await clubApi.post(`/sessions/${sessionId}/informe`, { accion: 'enviar' }, { headers: h });
                      setPartido(data);
                    } catch (e) {
                      setSendError(e.response?.data?.message || 'No se pudo enviar.');
                    } finally {
                      setSending(false);
                    }
                  }}
                  style={{ marginTop: 8, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#16a34a' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{sending ? 'Enviando…' : 'Enviar a jugadores'}</Text>
                </TouchableOpacity>
              )}
              {sendError ? <Text style={{ color: '#ef4444', textAlign: 'center', marginTop: 8 }}>{sendError}</Text> : null}
              {vistaJugador ? null : (
                <TouchableOpacity
                  onPress={() => navigation.navigate('CoachSessionDetail', { sessionId })}
                  style={{ marginTop: 10, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colorMarca }}
                >
                  <Text style={{ color: colorMarca, fontWeight: '800' }}>Abrir la sesión</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
          <>
          <Text style={[styles.intro, { color: theme.textMuted }]}>
            {isSingleSession
              ? 'Datos de esta sesión: asistencia registrada y minutos por enfoque táctico (bloques ejecutados o plan).'
              : isAdminVariant
                ? 'Elegí el período para ver asistencia y distribución por enfoque.'
                : 'Filtrá por categoría y período para ver asistencia y distribución por enfoque.'}
          </Text>

          {!isSingleSession && !isAdminVariant && categories.length > 0 ? (
            <CoachCategoryFilter
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={onCategoryChange}
              colorMarca={colorMarca}
              theme={theme}
            />
          ) : null}

          {!isSingleSession ? (
            <View style={[styles.tabs, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {PERIOD_KEYS.map((key) => {
                const on = period === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tab, on && { backgroundColor: colorMarca }]}
                    onPress={() => setPeriod(key)}
                  >
                    <Text style={[styles.tabTxt, { color: on ? '#fff' : theme.text }]}>
                      {PERIOD_SHORT[key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {current ? (
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {isSingleSession
                ? `${isoCalendarDateToDisplay(singleStats?.sesion?.fecha)} · ${singleStats?.sesion?.estado || ''}`
                : `${current.totalSesiones} sesiones · ${current.completadas} completadas${
                    current.totalMinutosEnfoque > 0 ? ` · ${current.totalMinutosEnfoque} min por enfoque` : ''
                  }`}
            </Text>
          ) : null}

          <DesignCard
            theme={theme}
            isDarkMode={isDarkMode}
            accent={colorMarca}
            contentStyle={styles.cardInner}
          >
            <View style={styles.cardHead}>
              <Ionicons name="people-outline" size={20} color={colorMarca} />
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                {isSingleSession ? 'Asistencia' : `${current?.etiqueta || 'Período'} — Asistencia`}
              </Text>
            </View>
            <Text style={[styles.kpi, { color: colorMarca }]}>
              {formatPct(current?.promedioAsistenciaPct)}
            </Text>
            {!isSingleSession ? (
              <Text style={[styles.kpiHint, { color: theme.textMuted }]}>
                Tasa completadas: {formatPct(current?.tasaCompletadasPct)} · Prom. duración real:{' '}
                {current?.promedioMinutosReales != null ? `${current.promedioMinutosReales} min` : '—'}
              </Text>
            ) : (
              <Text style={[styles.kpiHint, { color: theme.textMuted }]}>
                Duración real total:{' '}
                {current?.promedioMinutosReales != null ? `${current.promedioMinutosReales} min` : '—'}
              </Text>
            )}
            <CoachStatsBarChart
              items={asistenciaItems}
              width={chartWidth}
              height={isSingleSession ? 180 : 140}
              theme={theme}
              valueSuffix={isSingleSession ? '' : '%'}
              maxValue={maxAsistencia}
            />
          </DesignCard>

          <DesignCard
            theme={theme}
            isDarkMode={isDarkMode}
            accent={colorMarca}
            contentStyle={styles.cardInner}
          >
            <View style={styles.cardHead}>
              <MaterialCommunityIcons name="soccer-field" size={20} color={colorMarca} />
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                {isSingleSession ? 'Enfoque (minutos)' : `${current?.etiqueta || 'Período'} — Enfoque`}
              </Text>
            </View>
            {current?.enfoqueDominante ? (
              <Text style={[styles.kpiHint, { color: theme.textMuted, marginBottom: 8 }]}>
                Predominante: {current.enfoqueDominante.label} ({current.enfoqueDominante.porcentaje}% ·{' '}
                {current.enfoqueDominante.minutos} min)
              </Text>
            ) : null}
            <EnfoqueBarChart
              items={current?.enfoqueChart || []}
              width={chartWidth}
              theme={theme}
              colorMarca={colorMarca}
            />
          </DesignCard>

          {isSingleSession ? (
            <DesignCard
              theme={theme}
              isDarkMode={isDarkMode}
              accent={colorMarca}
              contentStyle={styles.cardInner}
            >
              <View style={styles.cardHead}>
                <Ionicons name="clipboard-outline" size={20} color={colorMarca} />
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Planificación</Text>
              </View>
              {plan?.bloques?.length ? (
                <>
                  <Text style={[styles.kpiHint, { color: theme.textMuted }]}>
                    {plan.nombre || 'Plan cargado'} · {plan.bloques.length} bloque{plan.bloques.length === 1 ? '' : 's'} ·{' '}
                    {plan.bloques.reduce((sum, block) => sum + (Number(block.duracionMinutos) || 0), 0)} min
                  </Text>
                  {plan.bloques.map((block, index) => (
                    <View key={`${block.tituloBloque || 'bloque'}-${index}`} style={[styles.planRow, { borderTopColor: theme.border }]}>
                      <Text style={{ color: theme.text, fontWeight: '800' }}>{block.tituloBloque || 'Bloque'}</Text>
                      <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 13 }}>
                        {(block.formato || 'General')} · {ENFOQUE_LABEL[block.enfoque] || block.enfoque || 'Neutro'} · {block.duracionMinutos || 0} min
                      </Text>
                      {block.descripcionDetallada ? (
                        <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 13 }}>{block.descripcionDetallada}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : (
                <Text style={{ color: theme.textMuted, fontWeight: '700' }}>Esta sesión no tiene un plan cargado.</Text>
              )}
              <TouchableOpacity
                onPress={() => navigation.navigate('CoachSessionDetail', { sessionId })}
                style={{ marginTop: 14, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colorMarca }}
              >
                <Text style={{ color: colorMarca, fontWeight: '800' }}>Abrir la sesión</Text>
              </TouchableOpacity>
            </DesignCard>
          ) : null}

          {!current && !showInitialLoader ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>No se pudieron cargar las estadísticas.</Text>
          ) : null}
          </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 10,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabTxt: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  meta: { fontSize: 12, marginBottom: 14 },
  cardInner: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  kpi: { fontSize: 32, fontWeight: '800', marginBottom: 4 },
  kpiHint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 15 },
  matchRow: { borderWidth: 1, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
  planRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
});
