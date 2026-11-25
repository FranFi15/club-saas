import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import ClubSpinLoader from './ClubSpinLoader';
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

function aspectRatioFrom(value) {
  const raw = String(value || '16:9');
  const [a, b] = raw.split(':').map((n) => Number(n));
  if (a > 0 && b > 0) return a / b;
  return 16 / 9;
}

/**
 * Botón Beneficios en perfil → modal con imagen, nombre y descuentos libres del sponsor.
 * Visible aunque Créditos esté activo (los canjes con créditos van en Créditos).
 */
export default function ProfileBenefitsSection({ clubData, theme, colorMarca }) {
  const cacheKey = clubData?.urlIdentifier ? `profile-benefits:${clubData.urlIdentifier}` : '';
  const [payload, setPayload] = useState(null);
  const [open, setOpen] = useState(false);
  const cc = colorMarca || '#3b82f6';

  const fetchBenefits = useCallback(async () => {
    if (!clubData?.urlIdentifier) return { eligible: false, sponsors: [], moroso: false };
    const token = await getToken('userToken');
    const headers = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    // Con créditos activos, beneficios libres van en Canjes y Beneficios.
    const loyaltyRes = await clubApi.get('/loyalty/me', { headers }).catch(() => ({ data: { enabled: false } }));
    if (loyaltyRes.data?.enabled) {
      return { loyaltyEnabled: true, eligible: false, sponsors: [], moroso: false };
    }
    const { data } = await clubApi.get('/financial/sponsors/my-benefits', { headers });
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
        <ClubSpinLoader size={40} />
      </View>
    );
  }

  if (payload?.error || payload?.loyaltyEnabled) return null;

  const sponsors = Array.isArray(payload?.sponsors) ? payload.sponsors : [];
  const moroso = !!payload?.moroso;
  const withContent = sponsors.filter((sp) => {
    const lines = benefitLines(sp.beneficios);
    const free = Array.isArray(sp.descuentosLibres) ? sp.descuentosLibres : [];
    return lines.length > 0 || free.length > 0;
  });

  // Sin sponsors con beneficios y al día → no mostrar el botón.
  if (!moroso && !withContent.length) return null;

  const subtitle = moroso
    ? 'Disponibles cuando estás al día con tus cuotas'
    : withContent.length === 1
      ? `1 sponsor · tocá para ver`
      : `${withContent.length} sponsors · tocá para ver`;

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
                withContent.map((sp) => {
                  const lines = benefitLines(sp.beneficios);
                  const free = Array.isArray(sp.descuentosLibres) ? sp.descuentosLibres : [];
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
                            <Ionicons name="ribbon-outline" size={26} color={cc} />
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.sponsorName, { color: theme.text }]} numberOfLines={2}>
                            {sp.nombre}
                          </Text>
                        </View>
                      </View>

                      {free.length ? (
                        <>
                          <Text style={[styles.discountLabel, { color: theme.textMuted }]}>Descuentos</Text>
                          {free.map((d) => {
                            const ratio = aspectRatioFrom(d.fotoAspect);
                            return (
                              <View
                                key={String(d._id)}
                                style={[styles.freeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
                              >
                                {d.fotoUrl ? (
                                  <Image
                                    source={{ uri: d.fotoUrl }}
                                    style={[styles.freeImage, { aspectRatio: ratio }]}
                                    resizeMode="cover"
                                  />
                                ) : null}
                                <View style={styles.freeBody}>
                                  <Text style={[styles.freeTitle, { color: theme.text }]} numberOfLines={2}>
                                    {d.titulo}
                                  </Text>
                                  {d.descripcion ? (
                                    <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>
                                      {d.descripcion}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                        </>
                      ) : null}

                      {lines.length ? (
                        <>
                          <Text
                            style={[
                              styles.discountLabel,
                              { color: theme.textMuted, marginTop: free.length ? 12 : 0 },
                            ]}
                          >
                            {free.length ? 'Otros beneficios' : 'Descuento / beneficios'}
                          </Text>
                          {lines.map((line) => (
                            <View key={line} style={styles.benefitRow}>
                              <Ionicons name="pricetag" size={14} color={cc} style={{ marginTop: 2 }} />
                              <Text style={[styles.benefitTxt, { color: theme.text }]}>{line}</Text>
                            </View>
                          ))}
                        </>
                      ) : null}
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
  freeCard: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  freeImage: { width: '100%' },
  freeBody: { padding: 10 },
  freeTitle: { fontSize: 15, fontWeight: '800' },
});
