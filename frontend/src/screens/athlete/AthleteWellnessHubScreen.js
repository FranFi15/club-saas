import React, { useContext, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import { clubHeaders } from './athleteApi';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function AthleteWellnessHubScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor, memberId, activeHijo, loading: memberLoading } = useMember();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const wellnessCacheKey =
    clubData?.urlIdentifier && memberId
      ? `member-wellness-hub:${clubData.urlIdentifier}:${memberId}`
      : '';

  const [wellnessToday, setWellnessToday] = useState(
    () => readScreenCache(wellnessCacheKey)?.wellnessToday ?? null,
  );
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

  const fetchWellness = useCallback(async () => {
    if (!clubData?.urlIdentifier || !memberId) {
      return { wellnessToday: null };
    }
    const h = await clubHeaders(clubData);
    try {
      const qs = isTutor && memberId ? `?atletaId=${memberId}` : '';
      const wRes = await clubApi.get(`/wellness/mi-hoy${qs}`, { headers: h });
      return { wellnessToday: wRes.data };
    } catch {
      return { wellnessToday: null };
    }
  }, [clubData?.urlIdentifier, memberId, isTutor]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: wellnessCacheKey,
    enabled: !!wellnessCacheKey && (!!memberId || !isTutor),
    fetchData: fetchWellness,
    onFetched: (data) => setWellnessToday(data.wellnessToday),
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el wellness.');
      setWellnessToday(null);
    },
  });

  const pendingItems = useMemo(() => {
    const items = [];
    if (memberId && wellnessToday && !wellnessToday.preHecho) {
      items.push({ key: 'wellness-pre', kind: 'pre' });
    }
    for (const s of wellnessToday?.sesionesHoy || []) {
      if (!s.postHecho) {
        items.push({ key: `wellness-post-${s._id}`, kind: 'post', sesion: s });
      }
    }
    return items;
  }, [memberId, wellnessToday]);

  const showInitialLoader = loading && wellnessToday === null && !!memberId;
  const showBody = !memberLoading && (memberId || !isTutor);

  const openWellness = (item) => {
    const isPre = item.kind === 'pre';
    navigation.navigate('AthleteWellnessForm', {
      ...(isPre ? {} : { sesion: item.sesion._id, defaultTipo: 'post' }),
      tutorAtletaId: isTutor ? memberId : undefined,
    });
  };

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
        kicker={isTutor ? 'Familia' : 'Tu club'}
        title="Wellness"
        subtitle={
          isTutor
            ? activeHijo
              ? `Registros diarios de ${activeHijo.nombre} ${activeHijo.apellido}`
              : 'Registros diarios del atleta seleccionado'
            : 'Contanos cómo te sentís y cómo fue el entreno'
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
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Pendiente hoy</Text>

          {showInitialLoader ? (
            <ActivityIndicator color={colorMarca} style={{ marginVertical: 24 }} />
          ) : pendingItems.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#22c55e" />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Todo al día</Text>
              <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
                No tenés registros de wellness pendientes para hoy.
              </Text>
            </View>
          ) : (
            pendingItems.map((item) => {
              const isPre = item.kind === 'pre';
              const sesion = item.sesion;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.card,
                    isPre
                      ? { backgroundColor: colorMarca + '18', borderColor: colorMarca }
                      : { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  onPress={() => openWellness(item)}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.cardIcon,
                      { backgroundColor: isPre ? colorMarca + '22' : '#f59e0b22' },
                    ]}
                  >
                    <Ionicons
                      name="fitness-outline"
                      size={24}
                      color={isPre ? colorMarca : '#f59e0b'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>
                      {isPre ? 'Wellness del día' : 'RPE post entreno'}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textMuted }]}>
                      {isPre
                        ? 'Contanos cómo te sentís antes de entrenar (1–10).'
                        : `${sesion.categoria?.nombre || 'Sesión'} · ${sesion.horaInicio}–${sesion.horaFin}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={isPre ? colorMarca : theme.icon} />
                </TouchableOpacity>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  empty: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 12 },
  emptyTxt: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
});
