import React, { useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Linking,
  ActivityIndicator,
  RefreshControl,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import ProfileEditDataButton from '../../components/ProfileEditDataButton';
import ProfileLogoutButton from '../../components/ProfileLogoutButton';
import ProfileInfoRow from '../../components/ProfileInfoRow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { subscribeMercadoPagoDeepLinks } from '../../utils/mpDeepLinks';

const MP_BLUE = '#009EE3';

export default function AdminProfileScreen({ navigation }) {
  const { clubData, setClubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const mpCacheKey = clubData?.urlIdentifier ? `admin-mp:${clubData.urlIdentifier}` : '';

  const [userRol, setUserRolState] = useState(() => readScreenCache(mpCacheKey)?.userRol ?? null);
  const [mpSaving, setMpSaving] = useState(false);
  const [integration, setIntegration] = useState(
    () =>
      readScreenCache(mpCacheKey)?.integration ?? {
        tokenSource: 'none',
        oauthReady: false,
      },
  );
  const [datosTransferencia, setDatosTransferencia] = useState(
    () => readScreenCache(mpCacheKey)?.datosTransferencia ?? null,
  );

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showAlert = (title, message, opts = {}) =>
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: opts.showCancel || false,
      isDanger: opts.isDanger || false,
      confirmText: opts.confirmText || 'Aceptar',
      onConfirm: opts.onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
      onCancel: opts.onCancel || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
  }, [clubData?.urlIdentifier]);

  const applyMp = useCallback((data) => {
    setUserRolState(data.userRol);
    setIntegration(data.integration);
    setDatosTransferencia(data.datosTransferencia ?? null);
  }, []);

  const fetchMp = useCallback(async () => {
    if (!clubData?.urlIdentifier) {
      return {
        userRol: null,
        integration: { tokenSource: 'none', oauthReady: false },
        datosTransferencia: null,
      };
    }
    const rol = await getToken('userRol');
    const h = await getHeaders();
    const [mpRes, bankRes] = await Promise.all([
      clubApi.get('/mercadopago/integration', { headers: h }),
      clubApi.get('/financial/transfer-bank', { headers: h }),
    ]);
    return {
      userRol: rol,
      integration: {
        tokenSource: mpRes.data.tokenSource || 'none',
        oauthReady: !!mpRes.data.oauthReady,
      },
      datosTransferencia: bankRes.data?.datosTransferencia ?? null,
    };
  }, [clubData?.urlIdentifier, getHeaders]);

  const { loading: mpLoading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: mpCacheKey,
    enabled: !!mpCacheKey,
    fetchData: fetchMp,
    onFetched: applyMp,
    onFetchError: () => {
      applyMp({
        userRol: null,
        integration: { tokenSource: 'none', oauthReady: false },
        datosTransferencia: null,
      });
    },
  });

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reloadRef.current({ background: true });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return subscribeMercadoPagoDeepLinks((event) => {
      if (event.type !== 'oauth') return;
      reloadRef.current({ background: true });
      if (event.status === 'success') {
        showAlert('Listo', 'Mercado Pago quedó conectado. Los tutores y atletas ya pueden pagar cuotas desde la app.');
      } else {
        showAlert('No se pudo conectar', 'Volvé a intentar desde Perfil → Conectar a Mercado Pago.');
      }
    });
  }, []);

  const canManageMercadoPago = userRol === 'admin_club';
  const canEditClubBank = userRol === 'admin_club';
  const roleBadgeLabel = userRol === 'administrativo' ? 'Administrativo' : 'Admin club';
  const clubMpLinked = integration.tokenSource === 'club';

  const handleLogout = async () => {
    await clearSession();
    setClubData(null);
    navigation.getParent()?.replace('WorkspaceSearch');
  };

  const startMercadoPagoOAuth = async () => {
    if (!integration.oauthReady) {
      showAlert(
        'No disponible',
        'Mercado Pago OAuth no está configurado en el servidor. Contactá al soporte técnico.',
      );
      return;
    }
    setMpSaving(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post('/mercadopago/oauth/start', {}, { headers: h });
      if (data?.authUrl) await Linking.openURL(data.authUrl);
    } catch (e) {
      showAlert(
        'No se pudo iniciar la conexión',
        e.response?.data?.message || e.message || 'Revisá la configuración del servidor o tu conexión.',
      );
    } finally {
      setMpSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
      >
        <View style={[styles.headerCard, { backgroundColor: colorMarca }]}>
          <Text style={styles.headerKicker}>Perfil</Text>
          <Text style={styles.headerTitle}>{clubData?.nombre || 'Club'}</Text>
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
            <Text style={styles.badgeText}>{roleBadgeLabel}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ProfileInfoRow
            icon="link-outline"
            label="Identificador"
            value={clubData?.urlIdentifier}
            theme={theme}
          />
          {canEditClubBank || datosTransferencia?.titular || datosTransferencia?.alias ? (
            <>
              <ProfileInfoRow
                icon="person-outline"
                label="Titular"
                value={datosTransferencia?.titular}
                theme={theme}
              />
              <ProfileInfoRow icon="business-outline" label="Banco" value={datosTransferencia?.banco} theme={theme} />
              <ProfileInfoRow icon="at-outline" label="Alias" value={datosTransferencia?.alias} theme={theme} />
              <ProfileInfoRow
                icon="card-outline"
                label="CBU"
                value={datosTransferencia?.cbu}
                theme={theme}
                isLast
              />
            </>
          ) : null}
          {!canEditClubBank && !datosTransferencia?.titular && !datosTransferencia?.alias ? (
            <ProfileInfoRow
              icon="information-circle-outline"
              label="Datos bancarios"
              value="Los configura el administrador del club"
              theme={theme}
              isLast
            />
          ) : null}
        </View>

        {canManageMercadoPago ? (
          <TouchableOpacity
            style={[styles.mpOAuthBtn, { opacity: mpSaving || mpLoading ? 0.7 : 1 }]}
            onPress={startMercadoPagoOAuth}
            disabled={mpSaving || mpLoading}
          >
            {mpSaving || mpLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.mpOAuthBtnText}>
                  {clubMpLinked ? 'Reconectar a Mercado Pago' : 'Conectar a Mercado Pago'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <ProfileEditDataButton theme={theme} onPress={() => navigation.navigate('EditProfile')} />

        <ProfileLogoutButton onPress={handleLogout} />
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  headerCard: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  badge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  card: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 14, overflow: 'hidden' },
  mpOAuthBtn: {
    marginBottom: 14,
    height: 50,
    borderRadius: 10,
    backgroundColor: MP_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpOAuthBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
