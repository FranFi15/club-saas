import React, { useContext, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { compareIsoCalendarDates, formatSessionCalendarWhen } from '../../utils/dateDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function PsychologyDashboardScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const dashboardCacheKey = clubData?.urlIdentifier ? `psi-dashboard:${clubData.urlIdentifier}` : '';

  const [firstName, setFirstName] = useState('');
  const [consultas, setConsultas] = useState(() => readScreenCache(dashboardCacheKey) ?? []);
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

  const fetchAgenda = useCallback(async () => {
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const res = await clubApi.get('/sessions/psicologo/agenda', { headers: h });
    const list = (res.data.sesiones || []).filter((x) => x.estado !== 'cancelada');
    const upcoming = list
      .filter((s) => s.estado === 'programada')
      .sort(
        (a, b) =>
          compareIsoCalendarDates(a.fecha, b.fecha) ||
          String(a.horaInicio).localeCompare(String(b.horaInicio)),
      );
    return upcoming.slice(0, 5);
  }, [clubData?.urlIdentifier]);

  const onDashboardFocus = useCallback(() => {
    (async () => {
      const n = await getToken('userNombre');
      setFirstName(n || '');
    })();
  }, []);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: dashboardCacheKey,
    enabled: !!dashboardCacheKey,
    fetchData: fetchAgenda,
    onFetched: setConsultas,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la agenda.');
    },
    onFocus: onDashboardFocus,
  });

  const showInitialLoader = loading && consultas.length === 0;

  const tabNav = () => navigation.getParent();

  const Card = ({ icon, title, subtitle, onPress }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: colorMarca + '18' }]}>
        <Ionicons name={icon} size={26} color={colorMarca} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={theme.icon} />
    </TouchableOpacity>
  );

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
        kicker="Psicología deportiva"
        title={firstName ? `Hola, ${firstName}` : 'Hola'}
        subtitle={clubData?.nombre || 'Tu club'}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
      >
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Próximas sesiones</Text>
        {showInitialLoader ? (
          <ActivityIndicator color={colorMarca} style={{ marginVertical: 16 }} />
        ) : consultas.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
              No tenés sesiones programadas. Creá una desde Sesiones (un atleta por vez y lugar en texto).
            </Text>
          </View>
        ) : (
          consultas.map((s) => {
            const an = s.atletaIndividual;
            const nm =
              an && typeof an === 'object' ? `${an.nombre || ''} ${an.apellido || ''}`.trim() : 'Atleta';
            return (
              <TouchableOpacity
                key={s._id}
                style={[styles.sessionRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() =>
                  tabNav()?.navigate('PsiSesiones', {
                    screen: 'CoachSessionDetail',
                    params: { sessionId: s._id },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sessionAth, { color: theme.textMuted }]}>{nm}</Text>
                  <Text style={[styles.sessionTitle, { color: theme.text }]}>
                    {formatSessionCalendarWhen(s.fecha, s.horaInicio, s.horaFin)}
                  </Text>
                  <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>
                    {(s.lugarLibre || '').trim() || 'Sin lugar'} · {s.categoria?.nombre || ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.icon} />
              </TouchableOpacity>
            );
          })
        )}

        <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 20 }]}>Accesos rápidos</Text>
        <Card
          icon="calendar-outline"
          title="Agenda y sesiones"
          subtitle="Encuentros individuales con lugar libre; registrá qué pasó al cerrar"
          onPress={() => tabNav()?.navigate('PsiSesiones', { screen: 'PsychologyAgenda' })}
        />
        <Card
          icon="people-outline"
          title="Mis atletas"
          subtitle="Listado de atletas y wellness (sin mediciones corporales)"
          onPress={() => tabNav()?.navigate('PsiEquipo', { screen: 'PsiRoster' })}
        />
        <Card
          icon="chatbubbles-outline"
          title="Comunicar"
          subtitle="Noticias, material (PDF, etc.) y pedidos de documentación"
          onPress={() => tabNav()?.navigate('PsiComunicar', { screen: 'CoachCommsHub' })}
        />
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
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  sessionAth: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  sessionTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  sessionMeta: { fontSize: 13, marginTop: 4 },
  empty: { padding: 16, borderRadius: 12, borderWidth: 1 },
  emptyTxt: { fontSize: 14, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: { flex: 1, marginHorizontal: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSubtitle: { fontSize: 13, marginTop: 4, lineHeight: 18 },
});
