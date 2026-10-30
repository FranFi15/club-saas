import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CourtMetricPanel from '../../components/CourtMetricPanel';
import { useMember } from '../../context/MemberContext';
import { deporteLabel, normalizeTipoMedicion, tipoMedicionLabel } from '../../constants/courtMetrics';
import { clubHeaders } from './athleteApi';

export default function AthleteCourtMetricDetailScreen({ navigation, route }) {
  const metricId = route?.params?.metricId;
  const tipoFromRoute = route?.params?.tipoMedicion;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { memberId, isTutor } = useMember();
  const cc = clubData?.primaryColor || '#3b82f6';
  const [metric, setMetric] = useState(null);
  const [atletaId, setAtletaId] = useState('');
  const [loading, setLoading] = useState(true);

  const getHeaders = useCallback(async () => clubHeaders(clubData), [clubData]);

  useEffect(() => {
    (async () => {
      try {
        const h = await getHeaders();
        let id = memberId;
        if (!id) {
          id = await getToken('userId');
        }
        setAtletaId(id || '');
        const { data } = await clubApi.get(`/court-metrics/${metricId}`, {
          headers: h,
          params: isTutor && id ? { atletaId: id } : undefined,
        });
        setMetric({
          ...data,
          tipoMedicion: normalizeTipoMedicion(data?.tipoMedicion || tipoFromRoute),
        });
      } catch {
        setMetric(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [metricId, getHeaders, memberId, isTutor, tipoFromRoute]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!metric || !atletaId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Text style={{ color: theme.text, padding: 20 }}>No se pudo abrir la métrica.</Text>
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
        title={metric.titulo}
        subtitle={`${deporteLabel(metric.deporte)} · ${tipoMedicionLabel(metric.tipoMedicion)}`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <CourtMetricPanel
          metric={metric}
          atletaId={atletaId}
          theme={theme}
          primaryColor={cc}
          getHeaders={getHeaders}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
