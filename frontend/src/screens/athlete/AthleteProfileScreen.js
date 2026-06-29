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
import { MIN_AGE_SELF_PAY } from '../../utils/ageHelper';
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';
import ProfileEditDataButton from '../../components/ProfileEditDataButton';
import ProfileClubEntryButton from '../../components/ProfileClubEntryButton';
import ProfileLogoutButton from '../../components/ProfileLogoutButton';
import ProfileHeaderAvatar from '../../components/ProfileHeaderAvatar';
import ProfileInfoRow, { profileCardStyles } from '../../components/ProfileInfoRow';
import ProfileLinkRow from '../../components/ProfileLinkRow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { useBadges } from '../../context/BadgeContext';
import { tabBadgeLabel } from '../../utils/tabBadgeLabel';

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

  const applyProfileView = useCallback((data) => {
    setNombre(data.nombre);
    setApellido(data.apellido);
    setEmailHint(data.emailHint);
  }, []);

  const fetchProfileView = useCallback(async () => {
    await refresh({ background: true });
    return {
      nombre: (await getToken('userNombre')) || '',
      apellido: (await getToken('userApellido')) || '',
      emailHint: (await getToken('userEmail')) || '',
    };
  }, [refresh]);

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

        {cuotasEnApp ? (
          <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ProfileLinkRow
              icon="wallet-outline"
              title="Cuotas"
              subtitle={pagosHint || 'Ver y pagar tus cuotas'}
              onPress={() => navigation.navigate('AthletePayments')}
              theme={theme}
              badge={tabBadgeLabel(tab('cuotas'))}
              isLast
            />
          </View>
        ) : null}

        <ProfileClubEntryButton
          theme={theme}
          colorMarca={colorMarca}
          onPress={() => navigation.navigate('ClubEntryQr')}
        />

        <ProfileEditDataButton theme={theme} onPress={() => navigation.navigate('EditProfile')} />

        <ProfileLogoutButton onPress={logout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heroBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
