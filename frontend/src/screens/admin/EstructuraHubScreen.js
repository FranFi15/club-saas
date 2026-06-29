import React, { useContext, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../utils/api';
import { useBadges } from '../../context/BadgeContext';
import HubMenuCard from '../../components/HubMenuCard';
import NotificationBell from '../../components/NotificationBell';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { isClubOwnerRole } from '../../constants/appRoles';

export default function EstructuraHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [viewerRol, setViewerRol] = useState('');
  const isClubOwner = isClubOwnerRole(viewerRol);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  const { hub, refresh } = useBadges();
  const hubCacheKey = clubData?.urlIdentifier ? `admin-estructura-hub:${clubData.urlIdentifier}` : '';
  const [counts, setCounts] = useState(
    () => readScreenCache(hubCacheKey)?.counts ?? { atletas: null, disciplinas: null, categorias: null },
  );

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
  };

  const fetchStats = useCallback(async () => {
    if (!clubData?.urlIdentifier) return { counts: { atletas: 0, disciplinas: 0, categorias: 0 } };
    const h = await getHeaders();
    const [atletaRes, discRes, catRes] = await Promise.all([
      clubApi.get('/users', { headers: h, params: { rol: 'atleta', limit: 1, page: 1 } }),
      clubApi.get('/disciplines', { headers: h }),
      clubApi.get('/categories', { headers: h }),
    ]);
    const atletasTotal = typeof atletaRes.data?.totalUsers === 'number' ? atletaRes.data.totalUsers : 0;
    const discCount = Array.isArray(discRes.data) ? discRes.data.length : 0;
    const catCount = Array.isArray(catRes.data) ? catRes.data.length : 0;
    return { counts: { atletas: atletasTotal, disciplinas: discCount, categorias: catCount } };
  }, [clubData?.urlIdentifier]);

  const applyStats = useCallback((data) => {
    setCounts(data.counts ?? { atletas: 0, disciplinas: 0, categorias: 0 });
  }, []);

  const { loading: loadingStats } = useCachedFocusLoad({
    cacheKey: hubCacheKey,
    enabled: !!hubCacheKey,
    fetchData: fetchStats,
    onFetched: applyStats,
    onFocus: refresh,
  });

  const statValue = (n) => {
    if (loadingStats && counts.atletas === null) return '—';
    return String(n ?? 0);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <View style={[styles.headerWrap, { backgroundColor: theme.background }]}>
        <View style={[styles.headerCard, { backgroundColor: colorMarca }]}>
          <View style={styles.headerBell}>
            <NotificationBell />
          </View>
          <Text style={styles.headerKicker}>{isClubOwner ? 'Estructura' : 'Operaciones'}</Text>
          <Text style={styles.headerTitle}>
            {isClubOwner ? 'Organización del club' : 'Gestión del día a día'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={2}>
            {clubData?.nombre || 'Tu club'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
            {loadingStats ? (
              <ActivityIndicator color={colorMarca} />
            ) : (
              <>
                <Text style={[styles.statNumber, { color: theme.text }]}>{statValue(counts.atletas)}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Atletas</Text>
              </>
            )}
          </View>
          {isClubOwner ? (
            <>
              <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
                {loadingStats ? (
                  <ActivityIndicator color={colorMarca} />
                ) : (
                  <>
                    <Text style={[styles.statNumber, { color: theme.text }]}>{statValue(counts.disciplinas)}</Text>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>Disciplinas</Text>
                  </>
                )}
              </View>
              <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
                {loadingStats ? (
                  <ActivityIndicator color={colorMarca} />
                ) : (
                  <>
                    <Text style={[styles.statNumber, { color: theme.text }]}>{statValue(counts.categorias)}</Text>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>Categorías</Text>
                  </>
                )}
              </View>
            </>
          ) : null}
        </View>

        {isClubOwner ? (
          <>
            <HubMenuCard
              title="Usuarios y Staff"
              subtitle="Jugadores, profes, médicos y tutores"
              icon="people"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Usuarios')}
            />
            <HubMenuCard
              title="Estructura deportiva"
              subtitle="Disciplinas y categorías"
              icon="trophy"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Estructura')}
            />
            <HubMenuCard
              title="Espacios físicos"
              subtitle="Gestión de instalaciones"
              icon="map"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Espacios')}
            />
            <HubMenuCard
              title="Grilla de entrenamientos"
              subtitle="Horarios fijos por categoría"
              icon="calendar"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Grilla')}
            />
            <HubMenuCard
              title="Solicitudes de inscripción"
              subtitle="Altas de atletas pedidas por el cuerpo técnico"
              icon="person-add"
              badge={hub('solicitudesInscripcion')}
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('SolicitudesInscripcion')}
            />
          </>
        ) : (
          <>
            <HubMenuCard
              title="Control de ingreso"
              subtitle="Escaneá el QR de atletas y tutores"
              icon="qr-code"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('EscanearIngreso')}
            />
            <HubMenuCard
              title="Usuarios y Staff"
              subtitle="Jugadores, profes, médicos y tutores"
              icon="people"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Usuarios')}
            />
            <HubMenuCard
              title="Solicitudes de inscripción"
              subtitle="Altas de atletas pedidas por el cuerpo técnico"
              icon="person-add"
              badge={hub('solicitudesInscripcion')}
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('SolicitudesInscripcion')}
            />
            <HubMenuCard
              title="Espacios físicos"
              subtitle="Mantenimiento y clausuras"
              icon="map"
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Espacios')}
            />
            <HubMenuCard
              title="Alquiler de cancha"
              subtitle="Reservas externas y disponibilidad"
              icon="time"
              badge={hub('alquileres')}
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('Alquileres')}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerCard: {
    borderRadius: 12,
    paddingLeft: 52,
    paddingRight: 20,
    paddingTop: 18,
    paddingBottom: 22,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#e5e7eb', fontSize: 14, marginTop: 8, lineHeight: 20 },
  headerBell: { position: 'absolute', top: 10, left: 12, zIndex: 2 },
  container: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, justifyContent: 'space-between' },
  statBox: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 5,
    alignItems: 'center',
    minHeight: 88,
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statNumber: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 5,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  iconContainer: { padding: 12, borderRadius: 12, marginRight: 15 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
});
