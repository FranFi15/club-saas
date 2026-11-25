import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Pressable, Platform, Image, TextInput } from 'react-native';
import ButtonDotsLoader from './ButtonDotsLoader';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import QRCode from 'react-native-qrcode-svg';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { useCachedFocusLoad } from '../hooks/useCachedFocusLoad';
import { profileCardStyles } from './ProfileInfoRow';
import ProfileLinkRow from './ProfileLinkRow';
import CustomAlert from './CustomAlert';

function fmtExpiry(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-AR');
  } catch {
    return '';
  }
}

function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function aspectRatioFrom(value) {
  const raw = String(value || '16:9');
  const [a, b] = raw.split(':').map(Number);
  if (a > 0 && b > 0) return a / b;
  return 16 / 9;
}

/**
 * Member loyalty: balance, soon-to-expire, reward catalog, redeem → code.
 * Hidden when club points are disabled (unless asScreen — then shows free benefits).
 * Uses a single Modal (list ↔ voucher) to avoid nested-modal freezes on Canjear.
 * asScreen: render as full tab/page content instead of profile row + sheet.
 */
export default function ProfileLoyaltySection({ clubData, theme, colorMarca, asScreen = false }) {
  const cc = colorMarca || '#3b82f6';
  const cacheKey = clubData?.urlIdentifier
    ? `profile-loyalty:${clubData.urlIdentifier}${asScreen ? ':screen' : ''}`
    : '';
  const [me, setMe] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [textBenefits, setTextBenefits] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [voucher, setVoucher] = useState(null);
  const [alert, setAlert] = useState(null);
  const [sponsorFilter, setSponsorFilter] = useState('');
  const [tab, setTab] = useState('canjes'); // canjes | historial

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchAll = useCallback(async () => {
    if (!clubData?.urlIdentifier) return { enabled: false };
    const h = await headers();
    const [meRes, rwRes, benRes] = await Promise.all([
      clubApi.get('/loyalty/me', { headers: h }),
      clubApi.get('/loyalty/rewards', { headers: h }).catch(() => ({ data: { rewards: [] } })),
      clubApi.get('/financial/sponsors/my-benefits', { headers: h }).catch(() => ({ data: { sponsors: [] } })),
    ]);
    const sponsors = Array.isArray(benRes.data?.sponsors) ? benRes.data.sponsors : [];
    const textRows = sponsors
      .map((sp) => ({
        _id: sp._id,
        nombre: sp.nombre,
        lines: String(sp.beneficios || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      }))
      .filter((s) => s.lines.length);
    const apiRewards = Array.isArray(rwRes.data?.rewards) ? rwRes.data.rewards : [];
    const freeFromBenefits = sponsors.flatMap((sp) =>
      (Array.isArray(sp.descuentosLibres) ? sp.descuentosLibres : []).map((d) => ({
        ...d,
        costoPuntos: 0,
        sponsor: { _id: sp._id, nombre: sp.nombre, fotoUrl: sp.fotoUrl },
      })),
    );
    const loyaltyOn = !!meRes.data?.enabled;
    return {
      me: meRes.data,
      rewards: loyaltyOn ? apiRewards : freeFromBenefits,
      textBenefits: textRows,
    };
  }, [clubData?.urlIdentifier, headers]);

  const { loading, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchAll,
    onFetched: (data) => {
      setMe(data.me || null);
      setRewards(Array.isArray(data.rewards) ? data.rewards : []);
      setTextBenefits(Array.isArray(data.textBenefits) ? data.textBenefits : []);
    },
    onFetchError: () => setMe(null),
  });

  const closeSheet = () => {
    setOpen(false);
    setVoucher(null);
    setSponsorFilter('');
    setTab('canjes');
  };

  const filteredRewards = useMemo(() => {
    const q = sponsorFilter.trim().toLowerCase();
    if (!q) return rewards;
    return rewards.filter((r) => String(r.sponsor?.nombre || '').toLowerCase().includes(q));
  }, [rewards, sponsorFilter]);

  const creditRewards = useMemo(
    () => filteredRewards.filter((r) => Number(r.costoPuntos) > 0),
    [filteredRewards],
  );
  const freeRewards = useMemo(
    () => filteredRewards.filter((r) => Number(r.costoPuntos) <= 0),
    [filteredRewards],
  );
  const filteredTextBenefits = useMemo(() => {
    const q = sponsorFilter.trim().toLowerCase();
    if (!q) return textBenefits;
    return textBenefits.filter((s) => String(s.nombre || '').toLowerCase().includes(q));
  }, [textBenefits, sponsorFilter]);

  if (loading && !me) {
    return (
      <View
        style={[
          asScreen ? styles.screenRoot : profileCardStyles.card,
          asScreen ? { flex: 1, backgroundColor: theme.background } : null,
          !asScreen && { backgroundColor: theme.surface, borderColor: theme.border },
          styles.loadingCard,
        ]}
      >
        <ButtonDotsLoader color={cc} />
      </View>
    );
  }

  const loyaltyOn = !!me?.enabled;
  if (!asScreen && !loyaltyOn) return null;

  const nombre = me?.settings?.nombrePuntos || 'Créditos';
  const balance = me?.balance || 0;
  const disponible =
    me?.disponible != null ? Number(me.disponible) : Math.max(0, balance - (me?.reservedPendiente || 0));
  const reserved = Number(me?.reservedPendiente) || 0;
  const canRedeem = !!me?.puedeCanjearPuntos;
  const next = me?.nextExpiry;
  const ledger = Array.isArray(me?.ledger) ? me.ledger : [];
  const pendingCanjes = Array.isArray(me?.pendingCanjes) ? me.pendingCanjes : [];
  const subtitle = 'Canjes con créditos y beneficios libres';

  const redeem = async (reward) => {
    if (!loyaltyOn) return;
    const cost = Number(reward?.costoPuntos) || 0;
    if (cost < 1) return;
    if (!canRedeem) {
      setAlert({ title: nombre, message: 'Tu cuenta aún no está habilitada para canjear.' });
      return;
    }
    if (cost > disponible) {
      setAlert({
        title: 'Saldo insuficiente',
        message: reserved
          ? `Necesitás ${cost} ${nombre.toLowerCase()}. Disponible: ${disponible} (${reserved} en canjes pendientes).`
          : `Necesitás ${cost} ${nombre.toLowerCase()} y tenés ${balance}.`,
      });
      return;
    }
    if (busyId) return;
    setBusyId(String(reward._id));
    try {
      const h = await headers();
      const { data } = await clubApi.post(`/loyalty/rewards/${reward._id}/redeem`, {}, { headers: h });
      // Stay in the same Modal — nested Modals freeze the UI on Canjear.
      setVoucher({
        codigo: data.codigo,
        qrValue: data.qrValue,
        expiresAt: data.expiresAt,
      });
      await reload({ background: true });
    } catch (e) {
      setAlert({
        title: 'Canje',
        message: e.response?.data?.message || e.message || 'No se pudo canjear.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const sheetBody = (
            <>
            {voucher ? (
              <ScrollView
                contentContainerStyle={styles.voucherBody}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginBottom: 12 }}>
                  Mostrá este QR o código en el comercio. Los créditos se descuentan al validarlo.
                </Text>
                {voucher.qrValue ? (
                  <View style={styles.qrWrap}>
                    <QRCode
                      value={voucher.qrValue}
                      size={200}
                      backgroundColor="#fff"
                      color="#111827"
                    />
                  </View>
                ) : null}
                <Text style={[styles.code, { color: cc }]}>{voucher.codigo}</Text>
                {voucher.expiresAt ? (
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                    Válido hasta {fmtExpiry(voucher.expiresAt)}
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: cc, marginTop: 20, alignSelf: 'stretch' }]}
                  onPress={() => setVoucher(null)}
                >
                  <Text style={styles.btnTxt}>Volver a canjes</Text>
                </TouchableOpacity>
                {!asScreen ? (
                  <TouchableOpacity
                    style={[styles.btnOutline, { borderColor: theme.border, marginTop: 10, alignSelf: 'stretch' }]}
                    onPress={closeSheet}
                  >
                    <Text style={[styles.btnTxt, { color: theme.text }]}>Cerrar</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                style={asScreen ? { flex: 1 } : undefined}
              >
                {loyaltyOn ? (
                  <>
                    <Text style={[styles.balance, { color: theme.text }]}>{balance}</Text>
                    <Text style={{ color: theme.textMuted, marginBottom: 8 }}>Tu saldo</Text>
                    {reserved > 0 ? (
                      <Text style={{ color: theme.textMuted, marginBottom: 8, fontSize: 13 }}>
                        {reserved} en canjes pendientes · disponible {disponible}
                      </Text>
                    ) : null}
                    {next?.expiresAt ? (
                      <Text style={{ color: theme.textMuted, marginBottom: 16, fontSize: 13 }}>
                        Próximo vencimiento: {next.remaining} el {fmtExpiry(next.expiresAt)}
                      </Text>
                    ) : null}
                    {!canRedeem ? (
                      <Text style={{ color: '#f59e0b', marginBottom: 12 }}>
                        Tu rol no está habilitado para canjear con los sponsors actuales.
                      </Text>
                    ) : null}

                    <View style={styles.tabRow}>
                      {[
                        { key: 'canjes', label: 'Canjes y beneficios' },
                        { key: 'historial', label: 'Historial' },
                      ].map((opt) => {
                        const on = tab === opt.key;
                        return (
                          <TouchableOpacity
                            key={opt.key}
                            style={[
                              styles.tabChip,
                              {
                                borderColor: on ? cc : theme.border,
                                backgroundColor: on ? `${cc}18` : theme.surface,
                              },
                            ]}
                            onPress={() => setTab(opt.key)}
                          >
                            <Text style={{ color: on ? cc : theme.text, fontWeight: '700', fontSize: 13 }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <Text style={{ color: theme.textMuted, marginBottom: 16, fontSize: 13 }}>
                    Beneficios de sponsors disponibles para tu cuenta.
                  </Text>
                )}

                {loyaltyOn && tab === 'historial' ? (
                  <>
                    {pendingCanjes.length ? (
                      <>
                        <Text style={[styles.section, { color: theme.text }]}>Pendientes</Text>
                        {pendingCanjes.map((p) => (
                          <View
                            key={String(p._id)}
                            style={[
                              styles.histRow,
                              { borderColor: theme.border, backgroundColor: theme.surface },
                            ]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.text, fontWeight: '700' }}>{p.titulo}</Text>
                              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                                Código {p.codigo}
                                {p.expiresAt ? ` · vence ${fmtExpiry(p.expiresAt)}` : ''}
                              </Text>
                            </View>
                            <Text style={{ color: '#f59e0b', fontWeight: '800' }}>
                              {p.reservado ? `−${p.puntos}` : '—'}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : null}

                    <Text style={[styles.section, { color: theme.text }]}>Movimientos</Text>
                    {!ledger.length ? (
                      <Text style={{ color: theme.textMuted }}>Todavía no hay movimientos.</Text>
                    ) : (
                      ledger.map((entry) => {
                        const delta = Number(entry.delta) || 0;
                        const positive = delta > 0;
                        return (
                          <View
                            key={String(entry._id)}
                            style={[
                              styles.histRow,
                              { borderColor: theme.border, backgroundColor: theme.surface },
                            ]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.text, fontWeight: '700' }}>
                                {entry.reasonLabel || entry.reason}
                              </Text>
                              {entry.note ? (
                                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                                  {entry.note}
                                </Text>
                              ) : null}
                              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                                {fmtDateTime(entry.createdAt)}
                              </Text>
                            </View>
                            <Text
                              style={{
                                color: positive ? '#10b981' : '#ef4444',
                                fontWeight: '800',
                              }}
                            >
                              {positive ? `+${delta}` : `${delta}`}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </>
                ) : (
                  <>
                    <View
                      style={[
                        styles.searchWrap,
                        { borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                    >
                      <Ionicons name="search-outline" size={18} color={theme.textMuted} />
                      <TextInput
                        style={[styles.searchInput, { color: theme.text }]}
                        value={sponsorFilter}
                        onChangeText={setSponsorFilter}
                        placeholder="Buscar por sponsor"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                      />
                      {sponsorFilter ? (
                        <TouchableOpacity onPress={() => setSponsorFilter('')} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {!rewards.length && !textBenefits.length ? (
                      <Text style={{ color: theme.textMuted }}>No hay canjes ni beneficios disponibles.</Text>
                    ) : !filteredRewards.length && !filteredTextBenefits.length ? (
                      <Text style={{ color: theme.textMuted }}>Ningún sponsor coincide con la búsqueda.</Text>
                    ) : (
                      <>
                        {freeRewards.length || filteredTextBenefits.length ? (
                          <Text style={[styles.section, { color: theme.text }]}>Beneficios</Text>
                        ) : null}
                        {freeRewards.map((r) => {
                          const grey = theme.textMuted || '#9ca3af';
                          const ratio = aspectRatioFrom(r.fotoAspect);
                          return (
                            <View
                              key={`free-${String(r._id)}`}
                              style={[
                                styles.eventCard,
                                { borderColor: theme.border, backgroundColor: theme.surface },
                              ]}
                            >
                              {r.fotoUrl ? (
                                <Image
                                  source={{ uri: r.fotoUrl }}
                                  style={[styles.eventCardImage, { aspectRatio: ratio }]}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.eventCardImage,
                                    styles.eventCardImageEmpty,
                                    { aspectRatio: ratio, backgroundColor: `${cc}22` },
                                  ]}
                                >
                                  <Ionicons name="gift-outline" size={36} color={cc} />
                                </View>
                              )}
                              <View style={styles.eventCardBody}>
                                <Text style={[styles.eventCardTitle, { color: theme.text }]} numberOfLines={2}>
                                  {r.titulo}
                                </Text>
                                {r.sponsor?.nombre ? (
                                  <View style={styles.metaRow}>
                                    <Ionicons name="storefront-outline" size={14} color={grey} />
                                    <Text style={[styles.metaText, { color: grey }]} numberOfLines={1}>
                                      {r.sponsor.nombre}
                                    </Text>
                                  </View>
                                ) : null}
                                <Text style={{ color: cc, fontWeight: '800', marginTop: 8 }}>Sin créditos</Text>
                              </View>
                            </View>
                          );
                        })}
                        {filteredTextBenefits.map((sp) => (
                          <View
                            key={`txt-${String(sp._id)}`}
                            style={[
                              styles.eventCard,
                              { borderColor: theme.border, backgroundColor: theme.surface, padding: 12 },
                            ]}
                          >
                            <Text style={[styles.eventCardTitle, { color: theme.text }]}>{sp.nombre}</Text>
                            {sp.lines.map((line) => (
                              <View key={line} style={styles.metaRow}>
                                <Ionicons name="pricetag" size={14} color={cc} />
                                <Text style={[styles.metaText, { color: theme.text }]}>{line}</Text>
                              </View>
                            ))}
                          </View>
                        ))}

                        {creditRewards.length ? (
                          <Text style={[styles.section, { color: theme.text, marginTop: 8 }]}>
                            Canjes con {nombre.toLowerCase()}
                          </Text>
                        ) : null}
                        {creditRewards.map((r) => {
                          const cost = Number(r.costoPuntos) || 0;
                          const unaffordable = cost > disponible;
                          const muted = !canRedeem || unaffordable;
                          const grey = theme.textMuted || '#9ca3af';
                          const ratio = aspectRatioFrom(r.fotoAspect);
                          return (
                            <View
                              key={String(r._id)}
                              style={[
                                styles.eventCard,
                                {
                                  borderColor: theme.border,
                                  backgroundColor: theme.surface,
                                  opacity: muted ? 0.55 : 1,
                                },
                              ]}
                            >
                              {r.fotoUrl ? (
                                <Image
                                  source={{ uri: r.fotoUrl }}
                                  style={[styles.eventCardImage, { aspectRatio: ratio }]}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.eventCardImage,
                                    styles.eventCardImageEmpty,
                                    { aspectRatio: ratio, backgroundColor: `${cc}22` },
                                  ]}
                                >
                                  <Ionicons name="pricetag-outline" size={36} color={cc} />
                                </View>
                              )}
                              <View style={styles.eventCardBody}>
                                <Text
                                  style={[styles.eventCardTitle, { color: muted ? grey : theme.text }]}
                                  numberOfLines={2}
                                >
                                  {r.titulo}
                                </Text>
                                {r.sponsor?.nombre ? (
                                  <View style={styles.metaRow}>
                                    <Ionicons name="storefront-outline" size={14} color={grey} />
                                    <Text style={[styles.metaText, { color: grey }]} numberOfLines={1}>
                                      {r.sponsor.nombre}
                                    </Text>
                                  </View>
                                ) : null}
                                <View style={styles.eventCardFooter}>
                                  <Text style={{ color: muted ? grey : theme.text, fontWeight: '800' }}>
                                    {cost} {nombre.toLowerCase()}
                                    {unaffordable ? '\nSaldo insuficiente' : ''}
                                  </Text>
                                  <TouchableOpacity
                                    style={[
                                      styles.ctaPill,
                                      {
                                        backgroundColor: muted ? '#e5e7eb' : `${cc}22`,
                                        opacity: busyId ? 0.5 : 1,
                                      },
                                    ]}
                                    disabled={!!busyId || muted}
                                    onPress={() => redeem(r)}
                                  >
                                    {busyId === String(r._id) ? (
                                      <ButtonDotsLoader color={muted ? grey : cc} />
                                    ) : (
                                      <>
                                        <Text
                                          style={{
                                            color: muted ? grey : cc,
                                            fontWeight: '700',
                                            fontSize: 13,
                                          }}
                                        >
                                          Canjear
                                        </Text>
                                        <Ionicons
                                          name="chevron-forward"
                                          size={14}
                                          color={muted ? grey : cc}
                                        />
                                      </>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            )}
            </>
  );

  if (asScreen) {
    return (
      <View style={[styles.screenRoot, { backgroundColor: theme.background }]}>
        {sheetBody}
        <CustomAlert
          embedded
          visible={!!alert}
          title={alert?.title}
          message={alert?.message}
          onConfirm={() => setAlert(null)}
        />
      </View>
    );
  }

  return (
    <>
      <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ProfileLinkRow
          icon="circle-multiple"
          IconComponent={MaterialCommunityIcons}
          title="Canjes y Beneficios"
          subtitle={subtitle}
          onPress={() => {
            setVoucher(null);
            setSponsorFilter('');
            setTab('canjes');
            setOpen(true);
          }}
          theme={theme}
        />
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={closeSheet}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={closeSheet} />
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: theme.text }]}>
                {voucher ? 'Código de canje' : 'Canjes y Beneficios'}
              </Text>
              <TouchableOpacity onPress={closeSheet} hitSlop={10}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
            </View>
            {sheetBody}
            <CustomAlert
              embedded
              visible={!!alert}
              title={alert?.title}
              message={alert?.message}
              onConfirm={() => setAlert(null)}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  loadingCard: { alignItems: 'center', paddingVertical: 18, justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    minHeight: 280,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '800' },
  balance: { fontSize: 40, fontWeight: '800' },
  section: { fontSize: 15, fontWeight: '800', marginBottom: 10, marginTop: 8 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  eventCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  eventCardImage: { width: '100%' },
  eventCardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  eventCardBody: { padding: 14 },
  eventCardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metaText: { fontSize: 13, flex: 1 },
  eventCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    minWidth: 88,
    justifyContent: 'center',
  },
  btn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  btnOutline: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnTxt: { color: '#fff', fontWeight: '700' },
  voucherBody: { padding: 24, paddingBottom: 36, alignItems: 'center' },
  qrWrap: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
});
