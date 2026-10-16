import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CourtMetricPanel from '../../components/CourtMetricPanel';
import { deporteLabel, normalizeTipoMedicion, tipoMedicionLabel } from '../../constants/courtMetrics';
import SearchableDropdown from '../../components/SearchableDropdown';
import { formatUserName } from '../../utils/listSort';

export default function CoachCourtMetricDetailScreen({ navigation, route }) {
  const metricId = route?.params?.metricId;
  const tipoFromRoute = route?.params?.tipoMedicion;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';

  const [metric, setMetric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState([]);
  const [atletaId, setAtletaId] = useState('');

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  useEffect(() => {
    (async () => {
      try {
        const h = await getHeaders();
        const { data } = await clubApi.get(`/court-metrics/${metricId}`, { headers: h });
        setMetric({
          ...data,
          tipoMedicion: normalizeTipoMedicion(data?.tipoMedicion || tipoFromRoute),
        });
        const map = new Map();
        (data.atletas || []).forEach((a) => {
          if (a?._id) map.set(String(a._id), a);
        });
        for (const c of data.categorias || []) {
          try {
            const enr = await clubApi.get(`/enrollments/categoria/${c._id || c}`, { headers: h });
            (Array.isArray(enr.data) ? enr.data : []).forEach((e) => {
              if (e.atleta?._id) map.set(String(e.atleta._id), e.atleta);
            });
          } catch {
            /* ignore */
          }
        }
        const list = [...map.values()];
        setAthletes(list);
        if (list[0]) setAtletaId(String(list[0]._id));
      } catch {
        setMetric(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [metricId, getHeaders, tipoFromRoute]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <ActivityIndicator color={cc} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!metric) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Text style={{ color: theme.text, padding: 20 }}>No se encontró la métrica.</Text>
      </SafeAreaView>
    );
  }

  const athleteOpts = athletes.map((a) => ({
    label: formatUserName(a),
    value: String(a._id),
  }));

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
        rightAccessory={
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('CoachCourtMetricEdit', {
                metricId: metric._id,
                onSaved: () =>
                  navigation.replace('CoachCourtMetricDetail', {
                    metricId: metric._id,
                    tipoMedicion: metric.tipoMedicion,
                  }),
              })
            }
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>Atleta</Text>
        <SearchableDropdown
          data={athleteOpts}
          value={atletaId}
          onChange={setAtletaId}
          placeholder="Elegí un atleta…"
          theme={theme}
          colorMarca={cc}
        />
        {atletaId ? (
          <View style={{ marginTop: 12 }}>
            <CourtMetricPanel
              metric={metric}
              atletaId={atletaId}
              theme={theme}
              primaryColor={cc}
              getHeaders={getHeaders}
              isStaff
            />
          </View>
        ) : (
          <Text style={{ color: theme.textMuted, marginTop: 20 }}>
            No hay atletas asignados a esta métrica.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
