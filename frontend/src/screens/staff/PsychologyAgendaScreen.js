import React, { useContext, useCallback, useState } from 'react';
import {
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader, { CoachHeaderFab } from '../../components/CoachScreenHeader';
import StaffConsultAgendaCard from '../../components/StaffConsultAgendaCard';
import { compareIsoCalendarDates, isoCalendarDateToDisplay, isoCalendarWeekday } from '../../utils/dateDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function sessionLabel(s) {
  const weekday = isoCalendarWeekday(s.fecha, { style: 'long' });
  const cal = isoCalendarDateToDisplay(s.fecha);
  if (!cal) return '';
  return `${weekday} ${cal}`.trim();
}

/** Agenda de consultas psicológicas (`consulta_psicologia`). */
export default function PsychologyAgendaScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const agendaCacheKey = clubData?.urlIdentifier ? `psi-agenda:${clubData.urlIdentifier}` : '';

  const [list, setList] = useState(() => readScreenCache(agendaCacheKey) ?? []);
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
    const sesiones = (res.data.sesiones || []).filter((x) => x.estado !== 'cancelada');
    sesiones.sort(
      (a, b) =>
        compareIsoCalendarDates(a.fecha, b.fecha) ||
        String(a.horaInicio).localeCompare(String(b.horaInicio)),
    );
    return sesiones;
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: agendaCacheKey,
    enabled: !!agendaCacheKey,
    fetchData: fetchAgenda,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar la agenda.');
    },
  });

  const refreshList = useCallback(async () => {
    const data = await fetchAgenda();
    setList(data);
  }, [fetchAgenda]);

  const showInitialLoader = loading && list.length === 0;

  const renderItem = ({ item }) => (
    <StaffConsultAgendaCard
      item={item}
      theme={theme}
      colorMarca={colorMarca}
      navigation={navigation}
      sessionLabel={sessionLabel}
      onUpdated={refreshList}
    />
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
        kicker="Sesiones"
        title="Mis citas"
        subtitle="Individual por atleta · lugar libre · registro al cerrar la sesión"
        rightAccessory={<CoachHeaderFab colorMarca={colorMarca} onPress={() => navigation.navigate('PsychologyNewConsult')} />}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              No hay sesiones programadas. Creá una con el botón + (categoría, atleta y lugar).
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  listPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 },
});
