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
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import { persistUserTokensFromProfile } from '../../utils/profileTokens';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader, { CoachHeaderBadge } from '../../components/CoachScreenHeader';
import ProfileEditDataButton from '../../components/ProfileEditDataButton';
import ProfileClubEntryButton from '../../components/ProfileClubEntryButton';
import ProfileLogoutButton from '../../components/ProfileLogoutButton';
import ProfileNotificationToggle from '../../components/ProfileNotificationToggle';
import ProfileHeaderAvatar from '../../components/ProfileHeaderAvatar';
import ProfileInfoRow, { profileCardStyles } from '../../components/ProfileInfoRow';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { subscribeMercadoPagoDeepLinks } from '../../utils/mpDeepLinks';

const MP_BLUE = '#009EE3';

const emptyIntegration = () => ({
  tokenSource: 'none',
  oauthReady: false,
  oauthSetup: { ready: false, missing: [] },
  sellerMapped: false,
  mercadopagoUserId: null,
});

export default function AdminProfileScreen({ navigation }) {
  const { clubData, setClubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const profileCacheKey = clubData?.urlIdentifier ? `admin-profile:${clubData.urlIdentifier}` : '';

  const cached = () => readScreenCache(profileCacheKey);
  const [userRol, setUserRolState] = useState(() => cached()?.userRol ?? null);
  const [profile, setProfile] = useState(() => cached()?.profile ?? null);
  const [mpSaving, setMpSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [integration, setIntegration] = useState(() => cached()?.integration ?? emptyIntegration());
  const [datosTransferencia, setDatosTransferencia] = useState(() => cached()?.datosTransferencia ?? null);

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

  const applyProfile = useCallback((data) => {
    setUserRolState(data.userRol);
    setProfile(data.profile);
    setIntegration(data.integration);
    setDatosTransferencia(data.datosTransferencia ?? null);
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!clubData?.urlIdentifier) {
      return {
        userRol: null,
        profile: null,
        integration: emptyIntegration(),
        datosTransferencia: null,
      };
    }
    const h = await getHeaders();
    const [meRes, mpRes, bankRes, rolToken] = await Promise.all([
      clubApi.get('/users/me', { headers: h }),
      clubApi.get('/mercadopago/integration', { headers: h }),
      clubApi.get('/financial/transfer-bank', { headers: h }),
      getToken('userRol'),
    ]);
    await persistUserTokensFromProfile(meRes.data);
    return {
      userRol: meRes.data?.rol || rolToken || null,
      profile: meRes.data,
      integration: {
        tokenSource: mpRes.data.tokenSource || 'none',
        oauthReady: !!mpRes.data.oauthReady,
        oauthSetup: mpRes.data.oauthSetup || { ready: false, missing: [] },
        maskedSuffix: mpRes.data.maskedSuffix || null,
        linkedViaOauth: !!mpRes.data.linkedViaOauth,
        envFallbackActive: !!mpRes.data.envFallbackActive,
        sellerMapped: !!mpRes.data.sellerMapped,
        mercadopagoUserId: mpRes.data.mercadopagoUserId || null,
      },
      datosTransferencia: bankRes.data?.datosTransferencia ?? null,
    };
  }, [clubData?.urlIdentifier, getHeaders]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: profileCacheKey,
    enabled: !!profileCacheKey,
    fetchData: fetchProfile,
    onFetched: applyProfile,
    onFetchError: async () => {
      applyProfile({
        userRol: (await getToken('userRol')) || null,
        profile: {
          nombre: (await getToken('userNombre')) || '',
          apellido: (await getToken('userApellido')) || '',
          email: (await getToken('userEmail')) || '',
        },
        integration: emptyIntegration(),
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
  const mpStatusLabel =
    clubMpLinked || integration.envFallbackActive ? 'Conectado' : 'Falta conexión';

  const showInitialLoader = loading && !profile;

  const handleLogout = async () => {
    await clearSession();
    setClubData(null);
    navigation.getParent()?.replace('WorkspaceSearch');
  };

  const startMercadoPagoOAuth = async () => {
    if (!integration.oauthReady) {
      showAlert(
        'No disponible',
        'Mercado Pago todavía no está listo en este club. Escribile a soporte para activarlo.',
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
        e.response?.data?.message || 'No pudimos abrir Mercado Pago. Revisá tu conexión e intentá de nuevo.',
      );
    } finally {
      setMpSaving(false);
    }
  };

  const fullName = profile
    ? `${profile.nombre || ''}${profile.nombre && profile.apellido ? ' ' : ''}${profile.apellido || ''}`.trim() ||
      'Tu cuenta'
    : 'Tu cuenta';

  const fechaDisplay = profile?.fechaNacimiento
    ? isoCalendarDateToDisplay(String(profile.fechaNacimiento))
    : '';

  const showBankFields = canEditClubBank || !!datosTransferencia?.titular || !!datosTransferencia?.alias;
  const showBankHint = !canEditClubBank && !datosTransferencia?.titular && !datosTransferencia?.alias;

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
            <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
            <Text style={styles.heroBadgeTxt}>{roleBadgeLabel}</Text>
          </CoachHeaderBadge>
        }
      />

      <ScrollView
        contentContainerStyle={profileCardStyles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
      >
        {showInitialLoader ? (
          <ActivityIndicator color={colorMarca} style={{ marginVertical: 24 }} />
        ) : (
          <>
            <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TouchableOpacity
                style={styles.detailsHeader}
                onPress={() => setDetailsOpen((o) => !o)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                accessibilityLabel="Datos del perfil"
              >
                <View style={styles.detailsHeaderLeft}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.icon} />
                  <Text style={[styles.detailsTitle, { color: theme.text }]}>Datos del perfil</Text>
                </View>
                <Ionicons
                  name={detailsOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.textMuted}
                />
              </TouchableOpacity>

              {detailsOpen ? (
                <>
                  <ProfileInfoRow
                    icon="calendar-outline"
                    label="Fecha de nacimiento"
                    value={fechaDisplay}
                    theme={theme}
                  />
                  <ProfileInfoRow icon="call-outline" label="Teléfono" value={profile?.telefono} theme={theme} />
                  <ProfileInfoRow
                    icon="location-outline"
                    label="Dirección"
                    value={profile?.direccion}
                    theme={theme}
                  />
                  <ProfileInfoRow icon="mail-outline" label="Email" value={profile?.email} theme={theme} />
                  <ProfileInfoRow icon="business-outline" label="Club" value={clubData?.nombre} theme={theme} />
                  <ProfileInfoRow
                    icon="link-outline"
                    label="Identificador"
                    value={clubData?.urlIdentifier}
                    theme={theme}
                    isLast={!showBankFields && !showBankHint && !canManageMercadoPago}
                  />
                  {showBankFields ? (
                    <>
                      <ProfileInfoRow
                        icon="person-outline"
                        label="Titular"
                        value={datosTransferencia?.titular}
                        theme={theme}
                      />
                      <ProfileInfoRow
                        icon="business-outline"
                        label="Banco"
                        value={datosTransferencia?.banco}
                        theme={theme}
                      />
                      <ProfileInfoRow
                        icon="at-outline"
                        label="Alias"
                        value={datosTransferencia?.alias}
                        theme={theme}
                      />
                      <ProfileInfoRow
                        icon="card-outline"
                        label="CBU"
                        value={datosTransferencia?.cbu}
                        theme={theme}
                        isLast={!canManageMercadoPago}
                      />
                    </>
                  ) : null}
                  {showBankHint ? (
                    <ProfileInfoRow
                      icon="information-circle-outline"
                      label="Datos bancarios"
                      value="Los configura el administrador del club"
                      theme={theme}
                      isLast={!canManageMercadoPago}
                    />
                  ) : null}
                  {canManageMercadoPago ? (
                    <>
                      <ProfileInfoRow
                        icon="wallet-outline"
                        label="Mercado Pago"
                        value={mpStatusLabel}
                        theme={theme}
                        isLast={integration.oauthReady}
                      />
                      {!integration.oauthReady ? (
                        <Text style={[styles.mpHint, { color: theme.textMuted }]}>
                          Mercado Pago todavía no está listo. Escribile a soporte para activarlo.
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </View>

            {canManageMercadoPago ? (
              <TouchableOpacity
                style={[styles.mpOAuthBtn, { opacity: mpSaving || loading ? 0.7 : 1 }]}
                onPress={startMercadoPagoOAuth}
                disabled={mpSaving || loading}
              >
                {mpSaving || loading ? (
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

            <ProfileClubEntryButton
              theme={theme}
              colorMarca={colorMarca}
              onPress={() => navigation.navigate('ClubEntryQr')}
            />

            <ProfileEditDataButton theme={theme} onPress={() => navigation.navigate('EditProfile')} />

            <ProfileNotificationToggle />

            <ProfileLogoutButton onPress={handleLogout} />
          </>
        )}
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
  safe: { flex: 1 },
  heroBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  detailsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  detailsTitle: { fontSize: 15, fontWeight: '700' },
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
  mpHint: { fontSize: 12, lineHeight: 17, paddingHorizontal: 14, paddingBottom: 14, marginTop: -4 },
});
