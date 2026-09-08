import React, { useContext, useCallback, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CoachSessionCalendar from '../../components/CoachSessionCalendar';
import DesignCard from '../../components/DesignCard';
import MemberChildPicker from '../../components/MemberChildPicker';
import { calendarPartsToYmd, todayYmd } from '../../utils/timeSlots';
import {
  compareIsoCalendarDates,
  isoCalendarDateToDisplay,
  isoCalendarWeekday,
  isoCalendarYmd,
} from '../../utils/dateDisplay';
import { clubHeaders } from './athleteApi';
import { pickPaginatedRows } from '../../utils/paginatedApi';
import { sessionDisplayName, sessionEsOpcional, isConsultaIndividual, consultaConfirmacionEstado, consultaConfirmacionLabel, consultaNeedsConfirmacion, sessionTipoVisual } from '../../utils/sessionDisplay';
import { readScreenCache, useCachedFocusLoad, clearScreenCache } from '../../hooks/useCachedFocusLoad';
import { useBadgesOptional } from '../../context/BadgeContext';

function ymdInMonth(ymd, monthDate) {
  const [y, m] = ymd.split('-').map(Number);
  return y === monthDate.getFullYear() && m - 1 === monthDate.getMonth();
}

function attendanceForMember(session, memberId) {
  if (!memberId || !session?.asistencia?.length) return null;
  const row = session.asistencia.find((a) => {
    const id = a.atleta?._id || a.atleta;
    return String(id) === String(memberId);
  });
  return row?.estado || null;
}

const ASIST_LABEL = {
  presente: { text: 'Presente', color: '#22c55e' },
  tarde: { text: 'Tarde', color: '#f59e0b' },
  ausente: { text: 'Ausente', color: '#ef4444' },
};

function defaultSelectedForMonth(monthDate) {
  const today = todayYmd();
  if (ymdInMonth(today, monthDate)) return today;
  return calendarPartsToYmd(monthDate.getFullYear(), monthDate.getMonth(), 1);
}

export default function AthleteAgendaScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor, memberId, activeHijo, loading: memberLoading, refresh: refreshMember } = useMember();
  const badges = useBadgesOptional();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const agendaCacheKey =
    clubData?.urlIdentifier && memberId
      ? `member-agenda:${clubData.urlIdentifier}:${memberId}:${currentMonth.getFullYear()}-${currentMonth.getMonth()}`
      : '';

  const [sessions, setSessions] = useState(() => readScreenCache(agendaCacheKey)?.sessions ?? []);
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);

  useEffect(() => {
    if (!agendaCacheKey) return;
    const cached = readScreenCache(agendaCacheKey);
    setSessions(cached?.sessions ?? []);
  }, [agendaCacheKey]);

  const [respondingId, setRespondingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectMotivo, setRejectMotivo] = useState('');
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

  const showAlert = (title, message, opts = {}) => {
    const { showCancel = false, onConfirm, onCancel } = opts;
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel,
      onConfirm: () => {
        closeAlert();
        onConfirm?.();
      },
      onCancel: () => {
        closeAlert();
        onCancel?.();
      },
    });
  };

  const applyAgenda = useCallback((data) => {
    setSessions(data.sessions);
  }, []);

  const fetchAgenda = useCallback(async () => {
    if (!clubData?.urlIdentifier || !memberId) {
      return { sessions: [] };
    }
    const h = await clubHeaders(clubData);
    const enrRes = await clubApi.get(`/enrollments/atleta/${memberId}`, { headers: h });
    const enrollments = enrRes.data || [];
    const catIds = [
      ...new Set(
        enrollments
          .map((e) => (e.categoria?._id ? String(e.categoria._id) : String(e.categoria)))
          .filter(Boolean),
      ),
    ];

    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const desde = calendarPartsToYmd(y, m, 1);
    const hasta = calendarPartsToYmd(y, m, new Date(y, m + 1, 0).getDate());

    const fetchCategorySessions = async (cid) => {
      const rows = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const r = await clubApi.get(`/sessions/categoria/${cid}`, {
          headers: h,
          params: { desde, hasta, page, limit: 100 },
        });
        rows.push(...pickPaginatedRows(r.data, 'sessions'));
        hasMore = Boolean(r.data?.hasMore);
        page += 1;
        if (page > 20) break;
      }
      return rows;
    };

    const sessionLists = await Promise.all(catIds.map(fetchCategorySessions));
    const merged = [];
    const seen = new Set();
    for (const list of sessionLists) {
      for (const s of list) {
        const id = String(s._id);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(s);
      }
    }
    merged.sort(
      (a, b) =>
        compareIsoCalendarDates(a.fecha, b.fecha) ||
        String(a.horaInicio).localeCompare(String(b.horaInicio)),
    );
    return { sessions: merged };
  }, [clubData?.urlIdentifier, memberId, currentMonth]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: agendaCacheKey,
    enabled: !!agendaCacheKey && (!!memberId || !isTutor),
    fetchData: fetchAgenda,
    onFetched: applyAgenda,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la agenda.');
      applyAgenda({ sessions: [] });
    },
  });

  const respondConsult = async (sessionId, accion, motivoRechazo = '') => {
    if (!clubData?.urlIdentifier || respondingId) return;
    setRespondingId(sessionId);
    try {
      const h = await clubHeaders(clubData);
      const body = { accion };
      if (isTutor && memberId) body.atletaId = memberId;
      if (accion === 'rechazar') body.motivoRechazo = motivoRechazo;
      const { data: updated } = await clubApi.patch(`/sessions/${sessionId}/confirmar-asistencia`, body, { headers: h });
      setRejectingId(null);
      setRejectMotivo('');
      setSessions((prev) =>
        prev.map((s) =>
          String(s._id) === String(sessionId)
            ? { ...s, confirmacionAtleta: updated?.confirmacionAtleta ?? s.confirmacionAtleta }
            : s,
        ),
      );
      if (agendaCacheKey) clearScreenCache(agendaCacheKey);
      const data = await fetchAgenda();
      applyAgenda(data);
      badges?.refresh?.();
      refreshMember({ background: true });
      showAlert(
        'Listo',
        accion === 'rechazar' ? 'Avisamos que no podés asistir.' : 'Confirmaste tu asistencia.',
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo registrar la respuesta.');
    } finally {
      setRespondingId(null);
    }
  };

  const confirmConsultAttendance = (sessionId) => {
    showAlert('Confirmar asistencia', '¿Vas a asistir a esta consulta?', {
      showCancel: true,
      onConfirm: () => respondConsult(sessionId, 'confirmar'),
    });
  };

  useEffect(() => {
    setSelectedYmd(todayYmd());
    const n = new Date();
    setCurrentMonth(new Date(n.getFullYear(), n.getMonth(), 1));
  }, [memberId]);

  useEffect(() => {
    setSelectedYmd((prev) => {
      if (ymdInMonth(prev, currentMonth)) return prev;
      return defaultSelectedForMonth(currentMonth);
    });
  }, [currentMonth]);

  const changeMonth = useCallback((offset) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  const sessionsInMonth = useMemo(
    () =>
      sessions.filter((s) => {
        const ymd = isoCalendarYmd(s.fecha);
        return ymd && ymdInMonth(ymd, currentMonth);
      }),
    [sessions, currentMonth],
  );

  const sessionCountByDay = useMemo(() => {
    const counts = {};
    sessionsInMonth.forEach((s) => {
      const ymd = isoCalendarYmd(s.fecha);
      if (!ymd) return;
      counts[ymd] = (counts[ymd] || 0) + 1;
    });
    return counts;
  }, [sessionsInMonth]);

  const pendingConfirmByDay = useMemo(() => {
    const counts = {};
    sessionsInMonth.forEach((s) => {
      if (!consultaNeedsConfirmacion(s)) return;
      const ymd = isoCalendarYmd(s.fecha);
      if (!ymd) return;
      counts[ymd] = (counts[ymd] || 0) + 1;
    });
    return counts;
  }, [sessionsInMonth]);

  const sessionsForSelectedDay = useMemo(
    () =>
      sessions
        .filter((s) => isoCalendarYmd(s.fecha) === selectedYmd)
        .sort(
          (a, b) =>
            compareIsoCalendarDates(a.fecha, b.fecha) ||
            String(a.horaInicio).localeCompare(String(b.horaInicio)),
        ),
    [sessions, selectedYmd],
  );

  const selectedLabel = useMemo(() => {
    if (!selectedYmd) return '';
    const weekday = isoCalendarWeekday(selectedYmd, { style: 'long' });
    const cal = isoCalendarDateToDisplay(selectedYmd);
    return [weekday, cal].filter(Boolean).join(' · ');
  }, [selectedYmd]);

  const calendarLoading = loading && sessions.length === 0;
  const showBody = !memberLoading && (memberId || !isTutor);

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
        kicker={isTutor ? 'Familia' : 'Tu club'}
        title="Agenda"
        subtitle={
          isTutor
            ? activeHijo
              ? `Calendario de ${activeHijo.nombre} ${activeHijo.apellido}`
              : 'Calendario y actividades del atleta seleccionado'
            : 'Calendario de entrenamientos y actividades'
        }
      />

      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} /> : null}

      {memberLoading || !showBody ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colorMarca} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Calendario</Text>

          <CoachSessionCalendar
            theme={theme}
            colorMarca={colorMarca}
            currentMonth={currentMonth}
            onChangeMonth={changeMonth}
            selectedYmd={selectedYmd}
            onSelectDay={setSelectedYmd}
            sessionCountByDay={sessionCountByDay}
            pendingConfirmByDay={pendingConfirmByDay}
            loading={calendarLoading}
          />

          <View style={styles.dayListHead}>
            <Text style={[styles.dayListTitle, { color: theme.text }]}>{selectedLabel || 'Día'}</Text>
            <View style={[styles.countPill, { backgroundColor: colorMarca + '20' }]}>
              <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 12 }}>
                {sessionsForSelectedDay.length}
              </Text>
            </View>
          </View>

          {calendarLoading ? (
            <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} />
          ) : sessionsForSelectedDay.length === 0 ? (
            <DesignCard theme={theme} isDarkMode={isDarkMode} accent={colorMarca} contentStyle={styles.emptyInner}>
              <Ionicons name="calendar-clear-outline" size={32} color={theme.textMuted} />
              <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
                No hay actividades programadas para este día. Elegí otro día con punto en el calendario.
              </Text>
            </DesignCard>
          ) : (
            sessionsForSelectedDay.map((item) => {
              const isCancelada = item.estado === 'cancelada';
              const confirmEstado = consultaConfirmacionEstado(item);
              const esConsulta = isConsultaIndividual(item);
              const pendiente = !isCancelada && consultaNeedsConfirmacion(item);
              const busy = respondingId === item._id;
              const visual = sessionTipoVisual(item, { colorMarca });
              const accent = isCancelada
                ? '#9ca3af'
                : pendiente
                  ? '#ef4444'
                  : item.estado === 'completada'
                    ? '#22c55e'
                    : visual.accent;
              const place =
                (item.lugarExterno || '').trim() || item.lugarLibre || item.espacio?.nombre || 'Sin lugar';
              const estadoTxt =
                item.estado === 'completada'
                  ? 'Realizada'
                  : item.estado === 'cancelada'
                    ? 'Cancelada'
                    : 'Programada';
              const confirmTxt =
                esConsulta && confirmEstado && !isCancelada
                  ? ` · ${consultaConfirmacionLabel(confirmEstado)}`
                  : '';
              const asistBadge = (() => {
                if (isCancelada) return null;
                const asistEstado = attendanceForMember(item, memberId);
                const asist = asistEstado ? ASIST_LABEL[asistEstado] : null;
                if (!asist) return null;
                return (
                  <View style={[styles.asistBadge, { backgroundColor: asist.color + '18', borderColor: asist.color }]}>
                    <Text style={{ color: asist.color, fontWeight: '800', fontSize: 11 }}>{asist.text}</Text>
                  </View>
                );
              })();

              const confirmFooter = pendiente ? (
                <View style={styles.confirmBlock}>
                  <Text style={[styles.confirmHint, { color: theme.textMuted }]}>
                    {isTutor ? 'Confirmá si tu atleta asistirá a esta consulta.' : 'Confirmá si vas a asistir.'}
                  </Text>
                  {rejectingId === item._id ? (
                    <>
                      <TextInput
                        style={[
                          styles.rejectInput,
                          { color: theme.text, borderColor: theme.border, backgroundColor: isDarkMode ? '#1a191f' : theme.background },
                        ]}
                        placeholder="Motivo (obligatorio)"
                        placeholderTextColor={theme.textMuted}
                        value={rejectMotivo}
                        onChangeText={setRejectMotivo}
                      />
                      <View style={styles.confirmActions}>
                        <TouchableOpacity
                          style={[styles.confirmBtnOutline, { borderColor: theme.border }]}
                          onPress={() => {
                            setRejectingId(null);
                            setRejectMotivo('');
                          }}
                          disabled={busy}
                        >
                          <Text style={{ color: theme.text, fontWeight: '700' }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.confirmBtnDanger, { opacity: busy ? 0.6 : 1 }]}
                          onPress={() => respondConsult(item._id, 'rechazar', rejectMotivo.trim())}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.confirmBtnTxt}>Enviar</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.confirmActions}>
                      <TouchableOpacity
                        style={[styles.confirmBtnOutline, { borderColor: theme.border }]}
                        onPress={() => {
                          setRejectingId(item._id);
                          setRejectMotivo('');
                        }}
                        disabled={busy}
                      >
                        <Text style={{ color: theme.text, fontWeight: '700' }}>No puedo asistir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.confirmBtnPrimary, { backgroundColor: colorMarca, opacity: busy ? 0.6 : 1 }]}
                        onPress={() => confirmConsultAttendance(item._id)}
                        disabled={busy}
                      >
                        {busy ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.confirmBtnTxt}>Confirmar</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.sessionFooterRow}>
                  <Text style={[styles.sessionMeta, { color: theme.textMuted, marginTop: 0, flex: 1 }]} numberOfLines={2}>
                    {place} · {estadoTxt}
                    {confirmTxt}
                  </Text>
                  {asistBadge}
                </View>
              );

              return (
                <DesignCard
                  key={item._id}
                  theme={theme}
                  isDarkMode={isDarkMode}
                  accent={accent}
                  muted={isCancelada}
                  contentStyle={styles.sessionCardInner}
                  footer={confirmFooter}
                >
                  <View style={styles.sessionCardRow}>
                    <View style={[styles.timeCol, { backgroundColor: accent + '22' }]}>
                      <Text style={[styles.timeStart, { color: accent }]}>{item.horaInicio}</Text>
                      <Text style={[styles.timeEnd, { color: theme.textMuted }]}>{item.horaFin}</Text>
                    </View>
                    <View style={styles.sessionBody}>
                      {!isCancelada ? (
                        <View style={styles.tipoChipRow}>
                          <View
                            style={[
                              styles.tipoChip,
                              { backgroundColor: `${visual.accent}22`, borderColor: visual.accent },
                            ]}
                          >
                            <Text style={[styles.tipoChipTxt, { color: visual.accent }]}>{visual.shortLabel}</Text>
                          </View>
                        </View>
                      ) : null}
                      <View style={styles.sessionTitleRow}>
                        <Text style={[styles.sessionCat, { color: isCancelada ? theme.textMuted : accent }]}>
                          {item.categoria?.nombre || 'Categoría'}
                        </Text>
                        {pendiente ? <View style={styles.sessionPendingDot} /> : null}
                      </View>
                      <Text style={[styles.sessionTipo, { color: isCancelada ? theme.textMuted : theme.text }]}>
                        {sessionDisplayName(item)}
                        {sessionEsOpcional(item) ? ' · Opcional' : ''}
                      </Text>
                      {isCancelada && item.motivoCancelacion ? (
                        <Text style={[styles.sessionMeta, { color: theme.textMuted, marginTop: 4 }]} numberOfLines={2}>
                          {item.motivoCancelacion}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </DesignCard>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 2,
  },
  dayListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  dayListTitle: { fontSize: 16, fontWeight: '800', flex: 1, marginRight: 8 },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sessionCardInner: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sessionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionFooterRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmBlock: {
    flex: 1,
    width: '100%',
  },
  confirmHint: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmBtnOutline: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmBtnPrimary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnDanger: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#ef4444',
  },
  confirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rejectInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
  },
  timeCol: {
    width: 64,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    marginRight: 12,
  },
  timeStart: { fontSize: 15, fontWeight: '800' },
  timeEnd: { fontSize: 11, marginTop: 2 },
  sessionBody: { flex: 1 },
  tipoChipRow: { flexDirection: 'row', marginBottom: 4 },
  tipoChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tipoChipTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  sessionCat: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  sessionTipo: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  sessionMeta: { fontSize: 13, marginTop: 4 },
  asistBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyInner: {
    padding: 20,
    alignItems: 'center',
  },
  emptyTxt: { fontSize: 14, lineHeight: 20, marginTop: 12, textAlign: 'center' },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionPendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
});
