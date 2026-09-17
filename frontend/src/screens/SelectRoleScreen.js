import React, { useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: colorMarca }]}>
          {fromProfile ? 'Cambiar rol' : 'Elegí cómo entrar'}
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>
          {fromProfile ? '¿Con qué rol querés continuar?' : 'Tu cuenta tiene varios roles'}
        </Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          Podés cambiarlo después desde tu perfil.
        </Text>

        {booting ? (
          <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
        ) : (
          <View style={styles.list}>
            {sortedRoles.map((rol) => (
              <TouchableOpacity
                key={rol}
                style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={() => applyRole(rol)}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
                  <Ionicons name="swap-horizontal" size={22} color={colorMarca} />
                </View>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {USER_ROL_LABELS[rol] || rol}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.icon} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? <ActivityIndicator color={colorMarca} style={{ marginTop: 16 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  kicker: { fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  sub: { fontSize: 15, marginTop: 8, lineHeight: 22 },
  list: { marginTop: 28, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  error: { color: '#ef4444', marginTop: 16, textAlign: 'center' },
});
