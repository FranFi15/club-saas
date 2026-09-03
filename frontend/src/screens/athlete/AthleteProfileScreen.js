import React, { useContext, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { MIN_AGE_SELF_PAY } from '../../utils/ageHelper';
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';
import ProfileEditDataButton from '../../components/ProfileEditDataButton';
import ProfileClubEntryButton from '../../components/ProfileClubEntryButton';
import ProfileLogoutButton from '../../components/ProfileLogoutButton';
import ProfileNotificationToggle from '../../components/ProfileNotificationToggle';
import ProfileHeaderAvatar from '../../components/ProfileHeaderAvatar';
import ProfileInfoRow, { profileCardStyles } from '../../components/ProfileInfoRow';
import ProfileLinkRow from '../../components/ProfileLinkRow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { useBadges } from '../../context/BadgeContext';
import { tabBadgeText } from '../../utils/tabBadgeLabel';

export default function AthleteProfileScreen({ navigation }) {
  const { clubData, setClubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { profile, puedePagar, cuotasEnApp, refresh } = useMember();
  const { tab } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const profileCacheKey = clubData?.urlIdentifier ? `athlete-profile-view:${clubData.urlIdentifier}` : '';

  const [nombre, setNombre] = useState(() => readScreenCache(profileCacheKey)?.nombre ?? '');
  const [apellido, setApellido] = useState(() => readScreenCache(profileCacheKey)?.apellido ?? '');
  const [emailHint, setEmailHint] = useState(() => readScreenCache(profileCacheKey)?.emailHint ?? '');
  const [attendanceStats, setAttendanceStats] = useState(
    () => readScreenCache(profileCacheKey)?.attendanceStats ?? null,
  );

  const applyProfileView = useCallback((data) => {
    setNombre(data.nombre);
    setApellido(data.apellido);
    setEmailHint(data.emailHint);
    setAttendanceStats(data.attendanceStats ?? null);
  }, []);

  const fetchProfileView = useCallback(async () => {
    await refresh({ background: true });
    const token = await getToken('userToken');
    const headers = clubData?.urlIdentifier
      ? { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` }
      : null;
    let att = null;
    if (headers) {
      try {
        const attRes = await clubApi.get('/sessions/asistencia/mi-resumen?dias=90', { headers });
        att = attRes.data || null;
      } catch {
        att = null;
      }
    }
    return {
      nombre: (await getToken('userNombre')) || '',
      apellido: (await getToken('userApellido')) || '',
      emailHint: (await getToken('userEmail')) || '',
      attendanceStats: att,
    };
  }, [refresh, clubData?.urlIdentifier]);

  const { refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: profileCacheKey,
    enabled: !!profileCacheKey,
    fetchData: fetchProfileView,
    onFetched: applyProfileView,
  });

  const logout = async () => {
    await clearSession();
    setClubData(null);
    navigation.getParent()?.replace('WorkspaceSearch');
  };

  const fullName =
    nombre || apellido ? `${nombre || ''}${nombre && apellido ? ' ' : ''}${apellido || ''}`.trim() : 'Tu cuenta';

  const fechaDisplay = profile?.fechaNacimiento
    ? isoCalendarDateToDisplay(String(profile.fechaNacimiento))
    : '';

  const pagosHint = cuotasEnApp
    ? puedePagar
      ? 'Podés pagar cuotas en la app'
      : profile?.edad != null
        ? `Menor de ${MIN_AGE_SELF_PAY} años: un tutor debe abonar`
        : 'Registrá tu fecha de nacimiento para habilitar pagos'
    : '';

  const avatarUser = profile || { nombre, apellido };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Perfil"
        title={fullName}
        subtitle={clubData?.nombre || 'Tu club'}
        heroRight={<ProfileHeaderAvatar user={avatarUser} />}
        showNotifications={false}
        footer={
          <CoachHeaderBadge>
            <Ionicons name="barbell-outline" size={16} color="#fff" />
            <Text style={styles.heroBadgeTxt}>Atleta</Text>
          </CoachHeaderBadge>
        }
      />

      <ScrollView
        contentContainerStyle={profileCardStyles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
      >
        <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ProfileInfoRow icon="business-outline" label="Club" value={clubData?.nombre} theme={theme} />
          <ProfileInfoRow
            icon="calendar-outline"
            label="Fecha de nacimiento"
            value={fechaDisplay}
            theme={theme}
          />
          <ProfileInfoRow icon="call-outline" label="Teléfono" value={profile?.telefono} theme={theme} />
          <ProfileInfoRow icon="location-outline" label="Dirección" value={profile?.direccion} theme={theme} />
          <ProfileInfoRow icon="mail-outline" label="Email" value={emailHint || profile?.email} theme={theme} isLast />
        </View>

        <View
          style={[
            profileCardStyles.card,
            styles.attendanceCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Asistencia</Text>
          {attendanceStats?.total > 0 ? (
            <View style={styles.attendanceGrid}>
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceStatLbl, { color: theme.textMuted }]}>Presente</Text>
                <Text style={[styles.attendanceStatVal, { color: '#22c55e' }]}>{attendanceStats.presente}</Text>
              </View>
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceStatLbl, { color: theme.textMuted }]}>Tarde</Text>
                <Text style={[styles.attendanceStatVal, { color: '#f59e0b' }]}>{attendanceStats.tarde}</Text>
              </View>
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceStatLbl, { color: theme.textMuted }]}>Ausente</Text>
                <Text style={[styles.attendanceStatVal, { color: '#ef4444' }]}>{attendanceStats.ausente}</Text>
              </View>
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceStatLbl, { color: theme.textMuted }]}>% asist.</Text>
                <Text style={[styles.attendanceStatVal, { color: theme.text }]}>
                  {attendanceStats.asistenciaPct ?? 0}%
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.attendanceEmpty, { color: theme.textMuted }]}>
              Todavía no hay sesiones con asistencia registrada.
            </Text>
          )}
        </View>

        {cuotasEnApp ? (
          <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ProfileLinkRow
              icon="wallet-outline"
              title="Cuotas"
              subtitle={pagosHint || 'Ver y pagar tus cuotas'}
              onPress={() => navigation.navigate('AthletePayments')}
              theme={theme}
              badge={tabBadgeText(tab('cuotas'))}
            />
            <ProfileLinkRow
              icon="tennisball-outline"
              title="Alquiler"
              subtitle="Reservá espacios y pagá con Mercado Pago"
              onPress={() => navigation.navigate('MemberAlquiler')}
              theme={theme}
              isLast
            />
          </View>
        ) : (
          <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ProfileLinkRow
              icon="tennisball-outline"
              title="Alquiler"
              subtitle="Reservá espacios y pagá con Mercado Pago"
              onPress={() => navigation.navigate('MemberAlquiler')}
              theme={theme}
              isLast
            />
          </View>
        )}

        <ProfileClubEntryButton
          theme={theme}
          colorMarca={colorMarca}
          onPress={() => navigation.navigate('ClubEntryQr')}
        />

        <ProfileEditDataButton theme={theme} onPress={() => navigation.navigate('EditProfile')} />

        <ProfileNotificationToggle />

        <ProfileLogoutButton onPress={logout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heroBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  attendanceCard: { marginTop: 8, paddingTop: 14, paddingBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  attendanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  attendanceStat: {
    flexGrow: 1,
    minWidth: '42%',
    padding: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.08)',
    alignItems: 'center',
  },
  attendanceStatLbl: { fontSize: 11, fontWeight: '600' },
  attendanceStatVal: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  attendanceEmpty: { fontSize: 14, lineHeight: 20 },
});
