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
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import { persistUserTokensFromProfile } from '../../utils/profileTokens';
import { formatRolStaff } from './staffUtils';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';
import ProfileEditDataButton from '../../components/ProfileEditDataButton';
import ProfileClubEntryButton from '../../components/ProfileClubEntryButton';
import ProfileLogoutButton from '../../components/ProfileLogoutButton';
import ProfileNotificationToggle from '../../components/ProfileNotificationToggle';
import ProfileHeaderAvatar from '../../components/ProfileHeaderAvatar';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import ProfileInfoRow, { profileCardStyles } from '../../components/ProfileInfoRow';

export default function StaffProfileScreen({ navigation }) {
  const { clubData, setClubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const profileCacheKey = clubData?.urlIdentifier ? `user-profile:${clubData.urlIdentifier}` : '';

  const [rol, setRol] = useState(() => readScreenCache(profileCacheKey)?.rol ?? '');
  const [profile, setProfile] = useState(() => readScreenCache(profileCacheKey)?.profile ?? null);

  const applyProfile = useCallback((data) => {
    setProfile(data.profile);
    setRol(data.rol);
  }, []);

  const fetchProfile = useCallback(async () => {
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const { data } = await clubApi.get('/users/me', { headers: h });
    await persistUserTokensFromProfile(data);
    const r = data.rol || (await getToken('userRol')) || '';
    return { profile: data, rol: r };
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: profileCacheKey,
    enabled: !!profileCacheKey,
    fetchData: fetchProfile,
    onFetched: applyProfile,
    onFetchError: async () => {
      setRol((await getToken('userRol')) || '');
      setProfile({
        nombre: (await getToken('userNombre')) || '',
        apellido: (await getToken('userApellido')) || '',
        email: (await getToken('userEmail')) || '',
      });
    },
  });

  const showInitialLoader = loading && !profile;

  const logout = async () => {
    await clearSession();
    setClubData(null);
    navigation.getParent()?.replace('WorkspaceSearch');
  };

  const fullName = profile
    ? `${profile.nombre || ''}${profile.nombre && profile.apellido ? ' ' : ''}${profile.apellido || ''}`.trim() ||
      'Tu cuenta'
    : 'Tu cuenta';

  const fechaDisplay = profile?.fechaNacimiento
    ? isoCalendarDateToDisplay(String(profile.fechaNacimiento))
    : '';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Perfil"
        title={fullName}
        subtitle={clubData?.nombre || 'Tu club'}
        heroRight={profile ? <ProfileHeaderAvatar user={profile} /> : null}
        showNotifications={false}
        footer={
          <CoachHeaderBadge>
            <Ionicons name="person-outline" size={16} color="#fff" />
            <Text style={styles.heroBadgeTxt}>{rol ? formatRolStaff(rol) : 'Staff'}</Text>
          </CoachHeaderBadge>
        }
      />

      <ScrollView
        contentContainerStyle={profileCardStyles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
      >
        {showInitialLoader ? (
          <ActivityIndicator color={colorMarca} style={{ marginVertical: 24 }} />
        ) : (
          <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ProfileInfoRow
              icon="calendar-outline"
              label="Fecha de nacimiento"
              value={fechaDisplay}
              theme={theme}
            />
            <ProfileInfoRow icon="call-outline" label="Teléfono" value={profile?.telefono} theme={theme} />
            <ProfileInfoRow icon="location-outline" label="Dirección" value={profile?.direccion} theme={theme} />
            <ProfileInfoRow icon="mail-outline" label="Email" value={profile?.email} theme={theme} isLast />
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
});
