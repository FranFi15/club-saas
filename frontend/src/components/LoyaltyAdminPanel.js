import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { clubApi } from '../utils/api';
import ClubSpinLoader from './ClubSpinLoader';
import ButtonDotsLoader from './ButtonDotsLoader';
import { formatUserName, sortUsersByName } from '../utils/listSort';

const SECTIONS = [
  { id: 'config', label: 'Config' },
  { id: 'adjust', label: 'Ajustar' },
];

/**
 * Master switch + sectioned settings for club credits (Finanzas → Sponsors).
 * Partner account + discounts are created in the sponsor form when credits are on.
 */
export default function LoyaltyAdminPanel({
  theme,
  colorMarca,
  getHeaders,
  showAlert,
  canMutate = true,
  onEnabledChange,
}) {
  const cc = colorMarca || '#3b82f6';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('config');
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({
    nombrePuntos: 'Créditos',
    diasVigenciaPuntos: '90',
    puntosPorCuotaAlDia: '0',
    puntosPorPesoVentaPartner: '0',
  });

  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState('');

  // Parent passes unstable getHeaders/showAlert every render — keep them in refs
  // so we don't re-fetch Créditos (and flash the spinner) on every Sponsors refresh.
  const getHeadersRef = useRef(getHeaders);
  const showAlertRef = useRef(showAlert);
  const onEnabledChangeRef = useRef(onEnabledChange);
  const enabledNotifiedRef = useRef(null);
  getHeadersRef.current = getHeaders;
  showAlertRef.current = showAlert;
  onEnabledChangeRef.current = onEnabledChange;

  const notifyEnabled = useCallback((next) => {
    const enabled = !!next;
    if (enabledNotifiedRef.current === enabled) return;
    enabledNotifiedRef.current = enabled;
    onEnabledChangeRef.current?.(enabled);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await getHeadersRef.current();
      const { data } = await clubApi.get('/loyalty/settings', { headers: h });
      const s = data.settings || {};
      setSettings(s);
      notifyEnabled(!!s.enabled);
      setDraft({
        nombrePuntos: s.nombrePuntos || 'Créditos',
        diasVigenciaPuntos: String(s.diasVigenciaPuntos ?? 90),
        puntosPorCuotaAlDia: String(s.puntosPorCuotaAlDia ?? 0),
        puntosPorPesoVentaPartner: String(s.puntosPorPesoVentaPartner ?? 0),
      });
    } catch (e) {
      showAlertRef.current?.(
        'Créditos',
        e.response?.data?.message || e.message || 'No se pudo cargar.',
      );
    } finally {
      setLoading(false);
    }
  }, [notifyEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = userSearch.trim();
    if (section !== 'adjust' || q.length < 2) {
      setUserResults([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setUserSearching(true);
      try {
        const h = await getHeadersRef.current();
        const { data } = await clubApi.get('/users', {
          headers: h,
          params: { search: q, limit: 20 },
        });
        if (!cancelled) {
          setUserResults(sortUsersByName(Array.isArray(data?.users) ? data.users : []));
        }
      } catch {
        if (!cancelled) setUserResults([]);
      } finally {
        if (!cancelled) setUserSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [userSearch, section]);

  const patchSettings = async (partial) => {
    if (!canMutate) return;
    setSaving(true);
    try {
      const h = await getHeadersRef.current();
      const { data } = await clubApi.patch('/loyalty/settings', partial, { headers: h });
      setSettings(data.settings);
      if (partial.enabled !== undefined) notifyEnabled(!!data.settings?.enabled);
      showAlertRef.current?.('Créditos', data.message || 'Actualizado.');
    } catch (e) {
      showAlertRef.current?.(
        'Créditos',
        e.response?.data?.message || e.message || 'Error al guardar.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = () =>
    patchSettings({
      nombrePuntos: draft.nombrePuntos.trim() || 'Créditos',
      diasVigenciaPuntos: Math.max(1, parseInt(draft.diasVigenciaPuntos, 10) || 90),
      puntosPorCuotaAlDia: Math.max(0, parseInt(draft.puntosPorCuotaAlDia, 10) || 0),
      puntosPorPesoVentaPartner: Math.max(0, Number(draft.puntosPorPesoVentaPartner) || 0),
    });

  const addCredits = async () => {
    if (!canMutate) return;
    const delta = parseInt(adjustDelta, 10);
    if (!selectedUser?._id || !Number.isFinite(delta) || delta === 0) {
      return showAlertRef.current?.(
        'Créditos',
        'Buscá y elegí un usuario, y un delta distinto de 0.',
      );
    }
    setSaving(true);
    try {
      const h = await getHeadersRef.current();
      const { data } = await clubApi.post(
        '/loyalty/admin/adjust',
        { userId: selectedUser._id, delta },
        { headers: h },
      );
      const nextPts = data.user?.puntosLealtad;
      if (selectedUser && nextPts != null) {
        setSelectedUser((u) => (u ? { ...u, puntosLealtad: nextPts } : u));
      }
      showAlertRef.current?.(
        'Créditos',
        data.message ||
          `Listo. ${formatUserName(selectedUser)} queda con ${nextPts ?? '—'} créditos.`,
      );
      setAdjustDelta('');
    } catch (e) {
      showAlertRef.current?.(
        'Créditos',
        e.response?.data?.message || e.message || 'Error.',
      );
    } finally {
      setSaving(false);
    }
  };

  const creditLabel = settings?.nombrePuntos || 'Créditos';
  const ptsOf = (u) => {
    const n = Number(u?.puntosLealtad);
    return Number.isFinite(n) ? n : 0;
  };

  if (loading) {
    return <ClubSpinLoader size={36} style={{ marginVertical: 16 }} />;
  }

  const enabled = !!settings?.enabled;
  const inputStyle = [
    styles.input,
    { borderColor: theme.border, color: theme.text, backgroundColor: theme.background },
  ];

  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.title, { color: theme.text }]}>Créditos del club</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Activá para canjes con créditos, partner y descuentos en la creación de sponsors. Sin esto, los sponsors se cargan como antes (beneficios de texto).
          </Text>
        </View>
        <Switch
          value={enabled}
          disabled={!canMutate || saving}
          onValueChange={(v) => patchSettings({ enabled: v })}
          trackColor={{ true: cc }}
        />
      </View>

      {enabled ? (
        <View style={styles.body}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {SECTIONS.map((s) => {
              const on = section === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSection(s.id)}
                  style={[
                    styles.chip,
                    {
                      borderColor: on ? cc : theme.border,
                      backgroundColor: on ? `${cc}22` : theme.background,
                    },
                  ]}
                >
                  <Text style={{ color: on ? cc : theme.text, fontWeight: '700', fontSize: 12 }}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {section === 'config' ? (
            <View style={{ marginTop: 12 }}>
              {[
                ['nombrePuntos', 'Nombre de los créditos'],
                ['diasVigenciaPuntos', 'Días de vigencia'],
                ['puntosPorCuotaAlDia', 'Créditos por cuota al día'],
                ['puntosPorPesoVentaPartner', 'Créditos por $ de venta partner'],
              ].map(([key, label]) => (
                <View key={key} style={{ marginBottom: 10 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
                  <TextInput
                    value={draft[key]}
                    editable={canMutate}
                    onChangeText={(t) => setDraft((p) => ({ ...p, [key]: t }))}
                    style={inputStyle}
                  />
                </View>
              ))}
              {canMutate ? (
                <TouchableOpacity style={[styles.btn, { backgroundColor: cc }]} onPress={saveConfig} disabled={saving}>
                  <Text style={styles.btnTxt}>Guardar configuración</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {section === 'adjust' ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Buscar usuario</Text>
              <TextInput
                value={userSearch}
                onChangeText={(t) => {
                  setUserSearch(t);
                  setSelectedUser(null);
                }}
                placeholder="Nombre, apellido o email"
                placeholderTextColor={theme.textMuted}
                style={inputStyle}
              />
              {userSearching ? <ButtonDotsLoader color="#64748b" style={{ marginVertical: 8 }} /> : null}
              {selectedUser ? (
                <View style={[styles.userCard, { borderColor: cc, backgroundColor: `${cc}14` }]}>
                  <View style={styles.userCardMain}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                        {formatUserName(selectedUser)}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
                        {selectedUser.email || selectedUser.rol}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedUser(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.creditsBadge, { backgroundColor: theme.background, borderColor: cc }]}>
                    <MaterialCommunityIcons name="circle-multiple" size={16} color={cc} />
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>
                      {ptsOf(selectedUser)}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>{creditLabel}</Text>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {userResults.slice(0, 8).map((u) => (
                    <TouchableOpacity
                      key={String(u._id)}
                      style={[
                        styles.userCard,
                        { borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      onPress={() => {
                        setSelectedUser(u);
                        setUserSearch(formatUserName(u));
                        setUserResults([]);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={styles.userCardMain}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                            {formatUserName(u)}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
                            {u.email || u.rol}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                      </View>
                      <View style={[styles.creditsBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <MaterialCommunityIcons name="circle-multiple" size={16} color={cc} />
                        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{ptsOf(u)}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
                          {creditLabel}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Delta (+/-)</Text>
              <TextInput
                placeholder="Ej. 50 o -20"
                placeholderTextColor={theme.textMuted}
                value={adjustDelta}
                onChangeText={setAdjustDelta}
                keyboardType="numbers-and-punctuation"
                style={inputStyle}
              />
              {canMutate ? (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: cc, marginTop: 8 }]}
                  onPress={addCredits}
                  disabled={saving}
                >
                  <Text style={styles.btnTxt}>Aplicar ajuste</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  body: { marginTop: 14 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
  },
  btn: {
    marginTop: 4,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  userCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creditsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
