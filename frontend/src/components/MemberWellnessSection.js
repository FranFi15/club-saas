import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import ClubSpinLoader from './ClubSpinLoader';
import { Ionicons } from '@expo/vector-icons';
import { useMember } from '../context/MemberContext';
import { clubApi } from '../utils/api';
import { clubHeaders } from '../screens/athlete/athleteApi';
import { readScreenCache, useCachedFocusLoad } from '../hooks/useCachedFocusLoad';
import { rpeSessionDetail, rpeSessionTitle, sessionTipoVisual } from '../utils/sessionDisplay';

export default function MemberWellnessSection({
  clubData,
  theme,
  colorMarca,
  navigation,
  wellnessFormScreen = 'AthleteWellnessForm',
  onError,
}) {
  const { isTutor, memberId } = useMember();
  const wellnessCacheKey =
    clubData?.urlIdentifier && memberId
      ? `member-wellness-hub:${clubData.urlIdentifier}:${memberId}`
      : '';

  const [wellnessToday, setWellnessToday] = useState(
    () => readScreenCache(wellnessCacheKey)?.wellnessToday ?? null,
  );

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

  const { loading } = useCachedFocusLoad({
    cacheKey: wellnessCacheKey,
    enabled: !!wellnessCacheKey && !!memberId,
    fetchData: fetchWellness,
    onFetched: (data) => setWellnessToday(data.wellnessToday),
    onFetchError: (e) => {
      onError?.('Error', e.response?.data?.message || 'No se pudo cargar el wellness.');
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

  const openWellness = (item) => {
    const isPre = item.kind === 'pre';
    navigation.navigate(wellnessFormScreen, {
      ...(isPre
        ? {}
        : {
            sesion: item.sesion._id,
            defaultTipo: 'post',
            sesionMeta: item.sesion,
          }),
      tutorAtletaId: isTutor ? memberId : undefined,
    });
  };

  if (!memberId) return null;

  const showInitialLoader = loading && wellnessToday === null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Wellness · pendiente hoy</Text>

      {showInitialLoader ? (
        <ClubSpinLoader size={40} style={{ marginVertical: 16 }} />
      ) : pendingItems.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="checkmark-circle-outline" size={28} color="#22c55e" />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Wellness al día</Text>
          <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
            No tenés registros de wellness pendientes para hoy.
          </Text>
        </View>
      ) : (
        pendingItems.map((item) => {
          const isPre = item.kind === 'pre';
          const sesion = item.sesion;
          const visual = isPre ? null : sessionTipoVisual(sesion, { colorMarca });
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
                  { backgroundColor: isPre ? colorMarca + '22' : `${visual.accent}22` },
                ]}
              >
                <Ionicons
                  name={isPre ? 'fitness-outline' : visual.icon}
                  size={22}
                  color={isPre ? colorMarca : visual.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {isPre ? 'Wellness del día' : rpeSessionTitle(sesion)}
                </Text>
                <Text style={[styles.cardSub, { color: theme.textMuted }]}>
                  {isPre
                    ? 'Contanos cómo te sentís antes de entrenar (1–10).'
                    : rpeSessionDetail(sesion)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={isPre ? colorMarca : theme.icon} />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  empty: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  emptyTxt: { fontSize: 13, lineHeight: 18, marginTop: 6, textAlign: 'center' },
});
