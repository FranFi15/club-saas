import React, { useCallback, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { useCachedFocusLoad } from '../hooks/useCachedFocusLoad';
import { profileCardStyles } from './ProfileInfoRow';

function benefitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Beneficios de sponsors para atletas / socios / tutores (solo si no son morosos).
 */
export default function ProfileBenefitsSection({ clubData, theme, colorMarca }) {
  const cacheKey = clubData?.urlIdentifier ? `profile-benefits:${clubData.urlIdentifier}` : '';
  const [payload, setPayload] = useState(null);

  const fetchBenefits = useCallback(async () => {
    if (!clubData?.urlIdentifier) return { eligible: false, sponsors: [], moroso: false };
    const token = await getToken('userToken');
    const { data } = await clubApi.get('/financial/sponsors/my-benefits', {
      headers: {
        'x-club-identifier': clubData.urlIdentifier,
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  }, [clubData?.urlIdentifier]);

  const { loading } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchBenefits,
    onFetched: setPayload,
    onFetchError: () => setPayload({ eligible: false, sponsors: [], error: true }),
  });

  if (loading && !payload) {
    return (
      <View style={[profileCardStyles.card, styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator color={colorMarca} />
      </View>
    );
  }

  if (payload?.error) return null;

  if (payload?.moroso) {
    return (
      <View style={[profileCardStyles.card, styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.headerRow}>
          <Ionicons name="gift-outline" size={18} color={theme.icon} />
          <Text style={[styles.title, { color: theme.text }]}>Beneficios</Text>
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 18 }}>
          {payload.message ||
            'Los beneficios de sponsors están disponibles cuando estás al día con tus cuotas.'}
        </Text>
      </View>
    );
  }

  const sponsors = Array.isArray(payload?.sponsors) ? payload.sponsors : [];
  if (!sponsors.length) return null;

  return (
    <View style={[profileCardStyles.card, styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="gift-outline" size={18} color={colorMarca || theme.icon} />
        <Text style={[styles.title, { color: theme.text }]}>Beneficios</Text>
      </View>

      {sponsors.map((sp, idx) => {
        const lines = benefitLines(sp.beneficios);
        const isLast = idx === sponsors.length - 1;
        return (
          <View
            key={String(sp._id)}
            style={[styles.sponsorBlock, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
          >
            <View style={styles.sponsorHead}>
              {sp.fotoUrl ? (
                <Image source={{ uri: sp.fotoUrl }} style={styles.logo} />
              ) : (
                <View style={[styles.logoPh, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Ionicons name="ribbon-outline" size={18} color={theme.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.sponsorName, { color: theme.text }]}>{sp.nombre}</Text>
                {sp.registro ? (
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>{sp.registro}</Text>
                ) : null}
              </View>
            </View>
            {lines.length ? (
              lines.map((line) => (
                <View key={line} style={styles.benefitRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#10b981" style={{ marginTop: 2 }} />
                  <Text style={[styles.benefitTxt, { color: theme.text }]}>{line}</Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Sin beneficios detallados.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  sponsorBlock: { paddingVertical: 10 },
  sponsorHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  logo: { width: 40, height: 40, borderRadius: 8 },
  logoPh: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsorName: { fontSize: 15, fontWeight: '700' },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4, paddingLeft: 2 },
  benefitTxt: { flex: 1, fontSize: 13, lineHeight: 18 },
});
