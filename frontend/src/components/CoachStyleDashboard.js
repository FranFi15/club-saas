import React, { useContext, useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { getToken } from '../utils/storage';
import { clubApi } from '../utils/api';
import CustomAlert from './CustomAlert';
import CoachScreenHeader from './CoachScreenHeader';
import CoachSessionCalendar from './CoachSessionCalendar';
import DesignCard from './DesignCard';
import { calendarPartsToYmd, todayYmd } from '../utils/timeSlots';
import {
  compareIsoCalendarDates,
  isoCalendarDateToDisplay,
  isoCalendarWeekday,
  isoCalendarYmd,
} from '../utils/dateDisplay';
import { sessionDisplayName, sessionEsOpcional, sessionTipoVisual } from '../utils/sessionDisplay';
import { readScreenCache, writeScreenCache } from '../hooks/useCachedFocusLoad';
import { useBadgesOptional } from '../context/BadgeContext';

function monthRangeYmd(monthDate) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const desde = calendarPartsToYmd(y, m, 1);
  const last = new Date(y, m + 1, 0).getDate();
  const hasta = calendarPartsToYmd(y, m, last);
  return { desde, hasta };
}

function monthCacheKey(monthDate) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function ymdInMonth(ymd, monthDate) {
  const [y, m] = ymd.split('-').map(Number);
  return y === monthDate.getFullYear() && m - 1 === monthDate.getMonth();
}

function defaultSelectedForMonth(monthDate) {
  const today = todayYmd();
  if (ymdInMonth(today, monthDate)) return today;
  return calendarPartsToYmd(monthDate.getFullYear(), monthDate.getMonth(), 1);
}

/**
 * Panel de inicio compartido (profe / PF / nutri / psico): calendario mensual + sesiones del día.
 */
export default function CoachStyleDashboard({
  navigation,
  kicker,
  sessionsTab,
  teamTab,
  teamRosterScreen = 'CoachCategories',
  agendaPath = '/sessions/profe/agenda',
  showPlantel = true,
  sessionMode = 'training',
  cacheKeySuffix = 'coach',
  sectionLabel = 'Próximas sesiones',
  emptyDayMessage = 'No hay sesiones programadas este día. Elegí otro día con punto en el calendario o creá una sesión desde la pestaña Sesiones.',
}) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const badges = useBadgesOptional();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const agendaCacheKey = clubData?.urlIdentifier
    ? `coach-style-dashboard:${cacheKeySuffix}:${clubData.urlIdentifier}`
    : '';

  const [firstName, setFirstName] = useState('');
  const [sessionsByMonth, setSessionsByMonth] = useState(
    () => readScreenCache(agendaCacheKey)?.sessionsByMonth ?? {},
  );
  const [fetchingMonthKey, setFetchingMonthKey] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedYmd, setSelectedYmd] = useState(todayYmd());
  const [plantelPendientes, setPlantelPendientes] = useState([]);
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

  const currentMonthRef = useRef(currentMonth);
  const sessionsByMonthRef = useRef(sessionsByMonth);
  const fetchInFlightRef = useRef(new Set());
  currentMonthRef.current = currentMonth;
  sessionsByMonthRef.current = sessionsByMonth;

  const currentMonthKey = useMemo(() => monthCacheKey(currentMonth), [currentMonth]);

  const allSessions = useMemo(
    () => sessionsByMonth[currentMonthKey] ?? [],
    [sessionsByMonth, currentMonthKey],
  );

  const calendarLoading = fetchingMonthKey === currentMonthKey && !sessionsByMonth[currentMonthKey];

  const loadAgenda = useCallback(
    async (monthDate, { background = false } = {}) => {
      const key = monthCacheKey(monthDate);
      if (fetchInFlightRef.current.has(key)) return;
      fetchInFlightRef.current.add(key);
      if (!background && !sessionsByMonthRef.current[key]) {
        setFetchingMonthKey((prev) => (prev === key ? prev : key));
      }
      try {
        const token = await getToken('userToken');
        const h = {
          'x-club-identifier': clubData.urlIdentifier,
          Authorization: `Bearer ${token}`,
        };
        const { desde, hasta } = monthRangeYmd(monthDate);
        const res = await clubApi.get(`${agendaPath}?desde=${desde}&hasta=${hasta}`, { headers: h });
        const list = (res.data.sesiones || [])
          .filter((x) => x.estado !== 'cancelada' && x.estado === 'programada')
          .sort(
            (a, b) =>
              compareIsoCalendarDates(a.fecha, b.fecha) ||
              String(a.horaInicio).localeCompare(String(b.horaInicio)),
          );
        setSessionsByMonth((prev) => {
          const next = { ...prev, [key]: list };
          if (agendaCacheKey) writeScreenCache(agendaCacheKey, { sessionsByMonth: next });
          return next;
        });
      } catch (e) {
        if (!background) {
          showAlert('Error', e.response?.data?.message || 'No se pudo cargar la agenda.');
        }
        setSessionsByMonth((prev) => ({ ...prev, [key]: prev[key] ?? [] }));
      } finally {
        fetchInFlightRef.current.delete(key);
        setFetchingMonthKey((prev) => (prev === key ? null : prev));
      }
    },
    [clubData?.urlIdentifier, agendaCacheKey, agendaPath],
  );

  const loadPlantelPendientes = useCallback(async () => {
    if (!showPlantel || !clubData?.urlIdentifier) {
      setPlantelPendientes([]);
      return;
    }
    try {
      const token = await getToken('userToken');
      const h = {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      };
      const { data } = await clubApi.get('/categories/plantel-pendientes', { headers: h });
      setPlantelPendientes(Array.isArray(data) ? data : []);
    } catch {
      setPlantelPendientes([]);
    }
  }, [clubData?.urlIdentifier, showPlantel]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const n = await getToken('userNombre');
        setFirstName(n || '');
      })();
      const month = currentMonthRef.current;
      const key = monthCacheKey(month);
      loadAgenda(month, { background: !!sessionsByMonthRef.current[key] });
      loadPlantelPendientes();
      badges?.refresh?.();
    }, [loadAgenda, loadPlantelPendientes, badges]),
  );

  useEffect(() => {
    if (sessionsByMonthRef.current[currentMonthKey]) return;
    loadAgenda(currentMonth);
  }, [currentMonthKey, loadAgenda, currentMonth]);

  useEffect(() => {
    setSelectedYmd((prev) => {
      if (ymdInMonth(prev, currentMonth)) return prev;
      return defaultSelectedForMonth(currentMonth);
    });
  }, [currentMonthKey, currentMonth]);

  const sessionCountByDay = useMemo(() => {
    const counts = {};
    allSessions.forEach((s) => {
      const ymd = isoCalendarYmd(s.fecha);
      if (!ymd) return;
      counts[ymd] = (counts[ymd] || 0) + 1;
    });
    return counts;
  }, [allSessions]);

  const sessionsForSelectedDay = useMemo(() => {
    return allSessions.filter((s) => isoCalendarYmd(s.fecha) === selectedYmd);
  }, [allSessions, selectedYmd]);

  const changeMonth = useCallback((offset) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  const tabNav = () => navigation.getParent();

  const openSession = (sessionId) => {
    // initial: false keeps the tab stack history so Back works (otherwise GO_BACK warns).
    tabNav()?.navigate(sessionsTab, {
      screen: 'CoachSessionDetail',
      params: { sessionId },
      initial: false,
    });
  };

  const selectedLabel = useMemo(() => {
    if (!selectedYmd) return '';
    const weekday = isoCalendarWeekday(selectedYmd, { style: 'long' });
    const cal = isoCalendarDateToDisplay(selectedYmd);
    return [weekday, cal].filter(Boolean).join(' · ');
  }, [selectedYmd]);

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
        kicker={kicker}
        title={firstName ? `Hola, ${firstName}` : 'Hola'}
        subtitle={clubData?.nombre || 'Tu club'}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showPlantel && plantelPendientes.length > 0 ? (
          <DesignCard
            theme={theme}
            isDarkMode={isDarkMode}
            accent="#f59e0b"
            onPress={() => {
              const first = plantelPendientes[0];
              if (plantelPendientes.length === 1 && first?._id) {
                tabNav()?.navigate(teamTab, {
                  screen: 'CoachCategoryDetail',
                  params: {
                    categoriaId: first._id,
                    nombre: first.nombre,
                    openPlantel: true,
                  },
                  initial: false,
                });
                return;
              }
              tabNav()?.navigate(teamTab, { screen: teamRosterScreen });
            }}
            contentStyle={styles.plantelInner}
          >
            <Ionicons name="shirt-outline" size={22} color="#f59e0b" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: theme.text, fontWeight: '800' }}>
                {plantelPendientes.length === 1
                  ? 'Tenés 1 plantel para armar'
                  : `Tenés ${plantelPendientes.length} planteles para armar`}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                El club te pidió actualizar el plantel
                {plantelPendientes.length === 1 && plantelPendientes[0]?.nombre
                  ? ` de ${plantelPendientes[0].nombre}`
                  : ' de tus categorías'}
                .
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
          </DesignCard>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{sectionLabel}</Text>

        <CoachSessionCalendar
          theme={theme}
          colorMarca={colorMarca}
          currentMonth={currentMonth}
          onChangeMonth={changeMonth}
          selectedYmd={selectedYmd}
          onSelectDay={setSelectedYmd}
          sessionCountByDay={sessionCountByDay}
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
              {emptyDayMessage}
            </Text>
          </DesignCard>
        ) : (
          sessionsForSelectedDay.map((s) => {
            const visual = sessionTipoVisual(s, { colorMarca });
            const isConsult = sessionMode === 'consult';
            const athlete =
              s.atletaIndividual && typeof s.atletaIndividual === 'object'
                ? `${s.atletaIndividual.nombre || ''} ${s.atletaIndividual.apellido || ''}`.trim()
                : '';
            const place = isConsult
              ? (s.lugarLibre || '').trim() || 'Sin lugar indicado'
              : (s.lugarExterno || '').trim() || s.espacio?.nombre || 'Sin lugar';
            const title = isConsult ? athlete || 'Consulta' : s.categoria?.nombre || 'Categoría';
            const subtitle = isConsult
              ? `${sessionDisplayName(s)}${s.categoria?.nombre ? ` · ${s.categoria.nombre}` : ''}`
              : `${sessionDisplayName(s)}${sessionEsOpcional(s) ? ' · Opcional' : ''}`;
            return (
            <DesignCard
              key={s._id}
              theme={theme}
              isDarkMode={isDarkMode}
              accent={visual.accent}
              onPress={() => openSession(s._id)}
              contentStyle={styles.sessionCardInner}
              footer={
                <View style={styles.sessionFooterRow}>
                  <Text style={[styles.sessionMeta, { color: theme.textMuted, marginTop: 0 }]} numberOfLines={1}>
                    {place}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.icon} />
                </View>
              }
            >
              <View style={styles.sessionCardRow}>
                <View style={[styles.timeCol, { backgroundColor: `${visual.accent}22` }]}>
                  <Text style={[styles.timeStart, { color: visual.accent }]}>{s.horaInicio}</Text>
                  <Text style={[styles.timeEnd, { color: theme.textMuted }]}>{s.horaFin}</Text>
                </View>
                <View style={styles.sessionBody}>
                  <View style={styles.tipoChipRow}>
                    <View style={[styles.tipoChip, { backgroundColor: `${visual.accent}22`, borderColor: visual.accent }]}>
                      <Text style={[styles.tipoChipTxt, { color: visual.accent }]}>{visual.shortLabel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.sessionCat, { color: visual.accent }]}>{title}</Text>
                  <Text style={[styles.sessionTipo, { color: theme.text }]}>{subtitle}</Text>
                </View>
              </View>
            </DesignCard>
            );
          })
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
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
    justifyContent: 'space-between',
    gap: 8,
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
  sessionMeta: { fontSize: 13, marginTop: 4, flex: 1 },
  emptyInner: {
    padding: 20,
    alignItems: 'center',
  },
  emptyTxt: { fontSize: 14, lineHeight: 20, marginTop: 12, textAlign: 'center' },
  plantelInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
});
