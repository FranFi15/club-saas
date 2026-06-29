import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMemberOptional } from '../../context/MemberContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import CustomAlert from '../../components/CustomAlert';
import { formatRolStaff } from '../staff/staffUtils';
import { USER_ROL_LABELS } from '../../constants/userRoles';

const REFRESH_BUFFER_MS = 5000;

function entryRoleLabel(rol) {
  if (!rol) return 'Socio';
  if (rol === 'atleta' || rol === 'tutor') return USER_ROL_LABELS[rol] || rol;
  return formatRolStaff(rol);
}

async function clubHeaders(clubData) {
  const token = await getToken('userToken');
  return {
    'x-club-identifier': clubData.urlIdentifier,
    Authorization: `Bearer ${token}`,
  };
}

export default function MemberClubEntryScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const memberCtx = useMemberOptional();
  const profile = memberCtx?.profile ?? null;
  const hijos = memberCtx?.hijos ?? [];
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const initialForUserId = route?.params?.forUserId || null;

  const [viewerRol, setViewerRol] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(initialForUserId);
  const [qrValue, setQrValue] = useState('');
  const [member, setMember] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const refreshTimerRef = useRef(null);
  const countdownRef = useRef(null);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const showAlert = (title, message) =>
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  const pickerOptions = useMemo(() => {
    if (viewerRol !== 'tutor') return [];
    const self = profile?._id
      ? [{ _id: profile._id, nombre: profile.nombre, apellido: profile.apellido, isSelf: true }]
      : [];
    const kids = (hijos || []).map((h) => ({ ...h, isSelf: false }));
    return [...self, ...kids];
  }, [viewerRol, profile, hijos]);

  useEffect(() => {
    if (viewerRol === 'tutor' && !selectedUserId && profile?._id) {
      setSelectedUserId(String(profile._id));
    }
  }, [viewerRol, selectedUserId, profile?._id]);

  const fetchQr = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    setLoading(true);
    try {
      const h = await clubHeaders(clubData);
      const params = {};
      if (viewerRol === 'tutor' && selectedUserId && selectedUserId !== String(profile?._id)) {
        params.forUserId = selectedUserId;
      }
      const { data } = await clubApi.get('/club-entry/my-qr', { headers: h, params });
      setQrValue(data.qrValue || '');
      setMember(data.member || null);
      setExpiresAt(data.expiresAt || null);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo generar el QR.');
    } finally {
      setLoading(false);
    }
  }, [clubData, viewerRol, selectedUserId, profile?._id]);

  useEffect(() => {
    if (!viewerRol) return undefined;
    if (viewerRol === 'tutor' && !selectedUserId) return undefined;
    fetchQr();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [viewerRol, selectedUserId, fetchQr]);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return undefined;
    }

    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      const sec = Math.max(0, Math.ceil(ms / 1000));
      setSecondsLeft(sec);
      if (ms <= REFRESH_BUFFER_MS) {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => fetchQr(), 300);
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [expiresAt, fetchQr]);

  const displayName = member
    ? `${member.nombre || ''}${member.apellido ? ` ${member.apellido}` : ''}`.trim()
    : 'Socio';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Acceso"
        title="QR de ingreso"
        subtitle="Mostrá este código en la entrada del club"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {viewerRol === 'tutor' && pickerOptions.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
            {pickerOptions.map((opt) => {
              const active = String(opt._id) === String(selectedUserId);
              const label = opt.isSelf
                ? 'Yo (tutor)'
                : `${opt.nombre || ''} ${opt.apellido || ''}`.trim();
              return (
                <TouchableOpacity
                  key={String(opt._id)}
                  style={[
                    styles.pickerChip,
                    {
                      borderColor: active ? colorMarca : theme.border,
                      backgroundColor: active ? colorMarca + '18' : theme.surface,
                    },
                  ]}
                  onPress={() => setSelectedUserId(String(opt._id))}
                >
                  <Text style={{ color: active ? colorMarca : theme.text, fontWeight: active ? '800' : '600' }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={[styles.qrCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.memberRow}>
            <UserAvatar user={member || profile} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.memberName, { color: theme.text }]}>{displayName}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                {entryRoleLabel(member?.rol)}
                {member?.dni ? ` · DNI ${member.dni}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.qrWrap}>
            {loading && !qrValue ? (
              <ActivityIndicator size="large" color={colorMarca} />
            ) : qrValue ? (
              <QRCode value={qrValue} size={220} backgroundColor="#fff" color="#111827" />
            ) : (
              <Ionicons name="qr-code-outline" size={80} color={theme.icon} />
            )}
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={16} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              {secondsLeft > 0 ? `Se actualiza en ${secondsLeft}s` : 'Actualizando…'}
            </Text>
            <TouchableOpacity onPress={fetchQr} hitSlop={8} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={18} color={colorMarca} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.hint, { color: theme.textMuted }]}>
          El personal del club escanea este código para registrar tu ingreso. El QR cambia cada minuto por seguridad.
        </Text>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  pickerRow: { gap: 8, paddingBottom: 14 },
  pickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  qrCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', marginBottom: 18 },
  memberName: { fontSize: 18, fontWeight: '800' },
  qrWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 14,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshBtn: { marginLeft: 4, padding: 4 },
  hint: { marginTop: 16, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
