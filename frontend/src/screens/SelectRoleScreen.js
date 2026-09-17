import React, { useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { persistAuthSessionUser, getStoredUserRoles } from '../utils/roleSession';
import { resolveMainNavigator } from '../constants/appRoles';
import { USER_ROL_LABELS } from '../constants/userRoles';
import { needsTermsAcceptance } from '../constants/legal';
import { beginAuthSession } from '../utils/session';
import AuthFormLayout from '../components/AuthFormLayout';
import DesignCard from '../components/DesignCard';

export default function SelectRoleScreen({ navigation, route }) {
  const { clubData, setMemberSessionRol, setSessionActive } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const rolesFromRoute = route?.params?.roles;
  const fromProfile = route?.params?.fromProfile === true;
  const [roles, setRoles] = useState(() =>
    Array.isArray(rolesFromRoute) && rolesFromRoute.length ? rolesFromRoute : [],
  );
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(!rolesFromRoute?.length);
  const [error, setError] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (rolesFromRoute?.length) {
        setBooting(false);
        return;
      }
      const stored = await getStoredUserRoles();
      if (!cancelled && stored.length) {
        setRoles(stored);
        setBooting(false);
        return;
      }
      try {
        const token = await getToken('userToken');
        const { data } = await clubApi.get('/users/me', {
          headers: {
            'x-club-identifier': clubData?.urlIdentifier,
            Authorization: `Bearer ${token}`,
          },
        });
        if (!cancelled) {
          const list =
            Array.isArray(data.roles) && data.roles.length
              ? data.roles
              : data.rol
                ? [data.rol]
                : [];
          setRoles(list);
          await persistAuthSessionUser({ roles: list, rol: data.rol });
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.message || 'No pudimos cargar tus roles.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rolesFromRoute, clubData?.urlIdentifier]);

  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) =>
        (USER_ROL_LABELS[a] || a).localeCompare(USER_ROL_LABELS[b] || b, 'es'),
      ),
    [roles],
  );

  const applyRole = async (rol) => {
    if (loading || !rol) return;
    setLoading(true);
    setError('');
    try {
      const token = await getToken('userToken');
      const { data } = await clubApi.post(
        '/auth/select-role',
        { rol },
        {
          headers: {
            'x-club-identifier': clubData.urlIdentifier,
            Authorization: `Bearer ${token}`,
          },
        },
      );
      beginAuthSession();
      await persistAuthSessionUser(data);
      setSessionActive(true);
      if (data.rol === 'atleta' || data.rol === 'tutor' || data.rol === 'socio') {
        setMemberSessionRol(data.rol);
      } else {
        setMemberSessionRol(null);
      }

      const mustAccept = needsTermsAcceptance(data.acceptedTermsVersion);
      const target = mustAccept ? 'TermsAcceptance' : resolveMainNavigator(data.rol);

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: target }],
        }),
      );
    } catch (e) {
      setError(e.response?.data?.message || 'No pudimos cambiar el rol.');
    } finally {
      setLoading(false);
    }
  };

  if (!clubData?.urlIdentifier) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AuthFormLayout backgroundColor={theme.background}>
        <View style={styles.heroWrap}>
          {clubData.logoUrl ? (
            <Image source={{ uri: clubData.logoUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.placeholderLogo, { backgroundColor: colorMarca }]}>
              <Text style={styles.placeholderText}>
                {(clubData.nombre || 'C').charAt(0)}
              </Text>
            </View>
          )}
        </View>

        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={colorMarca}
          contentStyle={styles.cardBody}
          style={styles.cardWrap}
        >
          <Text style={[styles.clubName, { color: theme.text }]} numberOfLines={2}>
            {clubData.nombre || 'Tu club'}
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {fromProfile ? 'Cambiar rol' : 'Elegí tu rol'}
          </Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>
            {fromProfile
              ? 'Tocá el rol con el que querés continuar.'
              : 'Tu cuenta tiene más de un rol. Elegí cómo entrar.'}
          </Text>

          {booting ? (
            <ActivityIndicator color={colorMarca} style={{ marginVertical: 24 }} />
          ) : (
            <View style={styles.list}>
              {sortedRoles.map((rol) => (
                <TouchableOpacity
                  key={rol}
                  style={[
                    styles.roleBtn,
                    {
                      borderColor: theme.border,
                      backgroundColor: isDarkMode ? '#1a191f' : theme.background,
                    },
                  ]}
                  onPress={() => applyRole(rol)}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.roleBtnText, { color: theme.text }]}>
                    {USER_ROL_LABELS[rol] || rol}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={colorMarca} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {loading ? <ActivityIndicator color={colorMarca} style={{ marginTop: 12 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </DesignCard>
      </AuthFormLayout>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroWrap: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 0,
  },
  heroImage: {
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  placeholderLogo: {
    width: 250,
    height: 250,
    borderRadius: 125,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 96,
    fontWeight: 'bold',
  },
  cardWrap: {
    width: '100%',
    marginBottom: 0,
  },
  cardBody: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  clubName: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    opacity: 0.75,
    marginBottom: 6,
    alignSelf: 'stretch',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
    alignSelf: 'stretch',
  },
  list: {
    gap: 10,
    width: '100%',
  },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  roleBtnText: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    paddingRight: 8,
  },
  error: {
    color: '#ef4444',
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
  },
});
