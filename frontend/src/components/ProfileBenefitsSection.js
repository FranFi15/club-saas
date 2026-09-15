import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { useCachedFocusLoad } from '../hooks/useCachedFocusLoad';
import { profileCardStyles } from './ProfileInfoRow';
import ProfileLinkRow from './ProfileLinkRow';

function benefitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Botón Beneficios en perfil → modal con imagen, nombre y descuentos del sponsor.
 * Solo visible / usable si el miembro no es moroso y hay sponsors aplicables.
 */
export default function ProfileBenefitsSection({ clubData, theme, colorMarca }) {
  const cacheKey = clubData?.urlIdentifier ? `profile-benefits:${clubData.urlIdentifier}` : '';
  const [payload, setPayload] = useState(null);
  const [open, setOpen] = useState(false);

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
      <View style={[profileCardStyles.card, styles.loadingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator color={colorMarca} />
      </View>
    );
  }

  if (payload?.error) return null;

  const sponsors = Array.isArray(payload?.sponsors) ? payload.sponsors : [];
  const moroso = !!payload?.moroso;

  // Sin sponsors aplicables y al día → no mostrar el botón.
  if (!moroso && !sponsors.length) return null;

  const subtitle = moroso
    ? 'Disponibles cuando estás al día con tus cuotas'
    : sponsors.length === 1
      ? `1 sponsor · tocá para ver`
      : `${sponsors.length} sponsors · tocá para ver`;

  return (
    <>
      <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ProfileLinkRow
          icon="gift-outline"
          title="Beneficios"
          subtitle={subtitle}
          onPress={() => setOpen(true)}
          theme={theme}
          isLast
        />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Beneficios</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Cerrar">
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetBody}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {moroso ? (
                <View style={[styles.emptyBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Ionicons name="lock-closed-outline" size={28} color={theme.textMuted} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>Cuotas pendientes</Text>
                  <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
                    {payload.message ||
                      'Los beneficios de sponsors están disponibles cuando estás al día con tus cuotas.'}
                  </Text>
                </View>
              ) : (
                sponsors.map((sp) => {
                  const lines = benefitLines(sp.beneficios);
                  return (
                    <View
                      key={String(sp._id)}
                      style={[styles.sponsorCard, { backgroundColor: theme.background, borderColor: theme.border }]}
                    >
                      <View style={styles.sponsorHead}>
                        {sp.fotoUrl ? (
                          <Image source={{ uri: sp.fotoUrl }} style={styles.logo} />
                        ) : (
                          <View
                            style={[
                              styles.logoPh,
                              { backgroundColor: theme.surface, borderColor: theme.border },
                            ]}
                          >
                            <Ionicons name="ribbon-outline" size={26} color={colorMarca || theme.textMuted} />
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.sponsorName, { color: theme.text }]} numberOfLines={2}>
                            {sp.nombre}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.discountLabel, { color: theme.textMuted }]}>Descuento / beneficios</Text>
                      {lines.length ? (
                        lines.map((line) => (
                          <View key={line} style={styles.benefitRow}>
                            <Ionicons name="pricetag" size={14} color={colorMarca || '#10b981'} style={{ marginTop: 2 }} />
                            <Text style={[styles.benefitTxt, { color: theme.text }]}>{line}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={{ color: theme.textMuted, fontSize: 13 }}>Sin descuentos detallados.</Text>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingCard: { paddingVertical: 18, alignItems: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '82%',
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  emptyTxt: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  sponsorCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sponsorHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logo: { width: 64, height: 64, borderRadius: 12 },
  logoPh: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsorName: { fontSize: 17, fontWeight: '800' },
  discountLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  benefitTxt: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
