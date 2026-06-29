import React, { useContext, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  RefreshControl,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import { MIN_AGE_SELF_PAY } from '../../utils/ageHelper';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';
import ProfileEditDataButton from '../../components/ProfileEditDataButton';
import ProfileClubEntryButton from '../../components/ProfileClubEntryButton';
import ProfileLogoutButton from '../../components/ProfileLogoutButton';
import ProfileHeaderAvatar from '../../components/ProfileHeaderAvatar';
import ProfileLinkRow from '../../components/ProfileLinkRow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { useBadges } from '../../context/BadgeContext';
import { tabBadgeLabel } from '../../utils/tabBadgeLabel';

export default function TutorProfileScreen({ navigation }) {
  const { clubData, setClubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { profile, hijos, refresh } = useMember();
  const { tab } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const profileCacheKey = clubData?.urlIdentifier ? `tutor-profile-view:${clubData.urlIdentifier}` : '';

  const [emailHint, setEmailHint] = useState(() => readScreenCache(profileCacheKey)?.emailHint ?? '');
  const [metricsAvailable, setMetricsAvailable] = useState(
    () => !!readScreenCache(profileCacheKey)?.metricsAvailable,
  );
  const [savingCuotasId, setSavingCuotasId] = useState(null);
  const [cuotasError, setCuotasError] = useState('');
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const fetchProfileView = useCallback(async () => {
    await refresh({ background: true });
    let available = false;
    if (clubData?.urlIdentifier) {
      try {
        const h = await clubHeaders(clubData);
        const { data } = await clubApi.get('/performance/tutor-metrics-access', { headers: h });
        available = !!data?.available;
      } catch {
        available = false;
      }
    }
    return {
      emailHint: (await getToken('userEmail')) || profile?.email || '',
      metricsAvailable: available,
    };
  }, [refresh, profile?.email, clubData]);

  const applyProfileView = useCallback((data) => {
    setEmailHint(data.emailHint);
    setMetricsAvailable(!!data.metricsAvailable);
  }, []);

  const { refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: profileCacheKey,
    enabled: !!profileCacheKey,
    fetchData: fetchProfileView,
    onFetched: applyProfileView,
  });

  const toggleCuotasEnApp = async (hijo, enabled) => {
    if (!clubData?.urlIdentifier || savingCuotasId) return;
    setCuotasError('');
    setSavingCuotasId(hijo._id);
    try {
      const h = await clubHeaders(clubData);
      await clubApi.patch(
        `/users/mis-hijos/${hijo._id}/cuotas-en-app`,
        { cuotasEnApp: enabled },
        { headers: h },
      );
      await refresh({ background: true });
    } catch (e) {
      setCuotasError(e.response?.data?.message || 'No se pudo actualizar el ajuste de pagos.');
    } finally {
      setSavingCuotasId(null);
    }
  };

  const logout = async () => {
    await clearSession();
    setClubData(null);
    navigation.getParent()?.replace('WorkspaceSearch');
  };

  const fullName =
    profile?.nombre || profile?.apellido
      ? `${profile?.nombre || ''}${profile?.nombre && profile?.apellido ? ' ' : ''}${profile?.apellido || ''}`.trim()
      : 'Tu cuenta';

  const cuotasEnabledCount = hijos.filter((h) => h.cuotasEnApp !== false).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Cuenta"
        title={fullName}
        subtitle={clubData?.nombre || 'Tu club'}
        heroRight={profile ? <ProfileHeaderAvatar user={profile} /> : null}
        showNotifications={false}
        footer={
          <CoachHeaderBadge>
            <Ionicons name="people-outline" size={16} color="#fff" />
            <Text style={styles.heroBadgeTxt}>Tutor</Text>
          </CoachHeaderBadge>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
      >
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Ionicons name="mail-outline" size={18} color={theme.icon} />
            <Text style={[styles.rowLabel, { color: theme.textMuted }]}>Email</Text>
            <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={1}>
              {emailHint || profile?.email || '-'}
            </Text>
          </View>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Ionicons name="call-outline" size={18} color={theme.icon} />
            <Text style={[styles.rowLabel, { color: theme.textMuted }]}>Teléfono</Text>
            <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={1}>
              {profile?.telefono?.trim() || '-'}
            </Text>
          </View>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Ionicons name="location-outline" size={18} color={theme.icon} />
            <Text style={[styles.rowLabel, { color: theme.textMuted }]}>Dirección</Text>
            <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={2}>
              {profile?.direccion?.trim() || '-'}
            </Text>
          </View>
          <View style={styles.rowLast}>
            <Ionicons name="barbell-outline" size={18} color={theme.icon} />
            <Text style={[styles.rowLabel, { color: theme.textMuted }]}>Mis Atletas</Text>
            <Text style={[styles.rowValue, { color: theme.text }]}>
              {hijos.length ? hijos.map((h) => `${h.nombre} ${h.apellido}`).join(', ') : 'Ninguno vinculado'}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <View style={[styles.linkCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ProfileLinkRow
              icon="wallet-outline"
              title="Cuotas"
              subtitle="Pagá las cuotas de tus atletas"
              onPress={() => navigation.navigate('TutorPayments')}
              theme={theme}
              badge={tabBadgeLabel(tab('cuotas'))}
              isLast
            />
          </View>

          {hijos.length > 0 ? (
            <View
              style={[
                styles.paymentsDropdown,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <TouchableOpacity
                style={styles.paymentsToggle}
                onPress={() => setPaymentsOpen((v) => !v)}
                activeOpacity={0.75}
              >
                <Ionicons name="wallet-outline" size={22} color={theme.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.paymentsToggleTitle, { color: theme.text }]}>Pagos en la app</Text>
                  <Text style={[styles.paymentsToggleSub, { color: theme.textMuted }]}>
                    {cuotasEnabledCount} de {hijos.length} con acceso a Cuotas en su perfil
                  </Text>
                </View>
                <Ionicons
                  name={paymentsOpen ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={theme.icon}
                />
              </TouchableOpacity>

              {paymentsOpen ? (
                <View style={[styles.paymentsBody, { borderTopColor: theme.border }]}>
                  <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
                    Activá Cuotas en el perfil de cada atleta. Vos siempre podés pagar por ellos desde el botón Cuotas.
                  </Text>
                  {cuotasError ? (
                    <Text style={[styles.errorTxt, { color: '#ef4444' }]}>{cuotasError}</Text>
                  ) : null}
                  {hijos.map((hijo, index) => {
                    const enabled = hijo.cuotasEnApp !== false;
                    const busy = String(savingCuotasId) === String(hijo._id);
                    const isLast = index === hijos.length - 1;
                    return (
                      <View
                        key={String(hijo._id)}
                        style={[
                          styles.switchRow,
                          !isLast && { borderBottomColor: theme.border, borderBottomWidth: 1 },
                        ]}
                      >
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={[styles.switchName, { color: theme.text }]}>
                            {hijo.nombre} {hijo.apellido}
                          </Text>
                          <Text style={[styles.switchHint, { color: theme.textMuted }]}>
                            {enabled
                              ? hijo.puedePagarEnApp
                                ? 'Ve Cuotas en su perfil y puede pagar en la app'
                                : `Ve Cuotas en su perfil; menores de ${MIN_AGE_SELF_PAY} años pagan solo por tutor`
                              : 'No ve Cuotas en su perfil; solo vos podés pagar'}
                          </Text>
                        </View>
                        {busy ? (
                          <ActivityIndicator color={colorMarca} />
                        ) : (
                          <Switch
                            value={enabled}
                            onValueChange={(v) => toggleCuotasEnApp(hijo, v)}
                            trackColor={{ false: theme.border, true: colorMarca + '88' }}
                            thumbColor={enabled ? colorMarca : theme.textMuted}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {metricsAvailable ? (
            <TouchableOpacity
              style={[styles.metricsBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => navigation.navigate('TutorMetrics')}
              activeOpacity={0.75}
            >
              <Ionicons name="analytics-outline" size={22} color={theme.icon} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.metricsBtnTitle, { color: theme.text }]}>Métricas</Text>
                <Text style={[styles.metricsBtnSub, { color: theme.textMuted }]}>
                  Mediciones que el club compartió con vos
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={theme.icon} />
            </TouchableOpacity>
          ) : null}

          <ProfileClubEntryButton
            theme={theme}
            colorMarca={colorMarca}
            onPress={() => navigation.navigate('ClubEntryQr')}
          />

          <ProfileEditDataButton theme={theme} onPress={() => navigation.navigate('EditProfile')} />

          <ProfileLogoutButton onPress={logout} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  heroBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  paymentsDropdown: {
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    overflow: 'hidden',
  },
  paymentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  paymentsToggleTitle: { fontSize: 16, fontWeight: '800' },
  paymentsToggleSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  paymentsBody: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  sectionHint: { fontSize: 13, lineHeight: 19, marginTop: 12, marginBottom: 4 },
  errorTxt: { fontSize: 13, marginTop: 8, marginBottom: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  switchName: { fontSize: 15, fontWeight: '700' },
  switchHint: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  rowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  rowLabel: { width: 72, fontSize: 13 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '600' },
  actions: { marginTop: 40 },
  linkCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  metricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  metricsBtnTitle: { fontSize: 16, fontWeight: '800' },
  metricsBtnSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
