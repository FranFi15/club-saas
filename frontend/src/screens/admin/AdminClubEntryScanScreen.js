import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  FlatList,
  Platform,
  Dimensions,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import CustomAlert from '../../components/CustomAlert';
import { formatRolStaff } from '../staff/staffUtils';
import { USER_ROL_LABELS } from '../../constants/userRoles';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const ENTRY_TABS = [
  { key: 'scan', label: 'Escanear', icon: 'qr-code-outline' },
  { key: 'history', label: 'Historial', icon: 'time-outline' },
];

const CAMERA_HEIGHT = Math.min(360, Math.round(Dimensions.get('window').width * 0.78));

function entryRoleLabel(rol) {
  if (!rol) return 'Socio';
  if (rol === 'atleta' || rol === 'tutor') return USER_ROL_LABELS[rol] || rol;
  return formatRolStaff(rol);
}

function extractEntryToken(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const prefix = 'gpsports:entry:';
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  return value;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function entrySearchBlob(member) {
  if (!member) return '';
  return [
    member.nombre,
    member.apellido,
    member.dni,
    member.rol,
    entryRoleLabel(member.rol),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function ResultCard({ result, onDismiss, theme }) {
  if (!result) {
    return (
      <View style={[styles.emptyResult, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="person-outline" size={40} color={theme.icon} />
        <Text style={[styles.emptyResultTitle, { color: theme.text }]}>Sin ingresos recientes</Text>
        <Text style={[styles.emptyResultSub, { color: theme.textMuted }]}>
          El socio que escanees aparecerá acá con su nombre y rol.
        </Text>
      </View>
    );
  }

  const hasWarnings = (result.warnings || []).length > 0;
  const tone = result.duplicate || hasWarnings ? 'warn' : 'ok';

  return (
    <View
      style={[
        styles.resultCard,
        {
          backgroundColor: tone === 'warn' ? '#fef3c7' : '#ecfdf5',
          borderColor: tone === 'warn' ? '#f59e0b' : '#10b981',
        },
      ]}
    >
      <TouchableOpacity style={styles.resultClose} onPress={onDismiss} hitSlop={10}>
        <Ionicons name="close" size={20} color="#374151" />
      </TouchableOpacity>
      <View style={styles.resultRow}>
        <UserAvatar user={result.member} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.resultTitle}>
            {result.duplicate
              ? 'Ingreso duplicado'
              : hasWarnings
                ? 'Ingreso con alerta'
                : 'Ingreso registrado'}
          </Text>
          <Text style={styles.resultName}>
            {result.member?.nombre} {result.member?.apellido}
          </Text>
          <Text style={styles.resultMeta}>
            {entryRoleLabel(result.member?.rol)}
            {result.member?.dni ? ` · DNI ${result.member.dni}` : ''}
          </Text>
          {result.duplicate && result.duplicateMinutesAgo ? (
            <Text style={styles.resultWarn}>Ya ingresó hace {result.duplicateMinutesAgo} min</Text>
          ) : null}
          {(result.warnings || []).map((w) => (
            <Text key={w} style={styles.resultWarn}>
              {w}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function AdminClubEntryScanScreen({ navigation, route }) {
  const standalone = route?.params?.standalone === true;
  const { clubData, clearSession } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [tab, setTab] = useState('scan');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const lastScanRef = useRef({ token: '', at: 0 });
  const cooldownRef = useRef(null);

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

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchToday = useCallback(async () => {
    const h = await getHeaders();
    const { data } = await clubApi.get('/club-entry/today', { headers: h, params: { limit: 30 } });
    return { list: data || [] };
  }, [getHeaders]);

  const applyToday = useCallback((data) => {
    setTodayEntries(data.list || []);
  }, []);

  const { loading: loadingToday, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: clubData?.urlIdentifier ? `club-entry-today:${clubData.urlIdentifier}` : '',
    enabled: !!clubData?.urlIdentifier,
    fetchData: fetchToday,
    onFetched: applyToday,
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleRequestCamera = async () => {
    const result = await requestPermission();
    if (Platform.OS === 'web' && !result?.granted) {
      showAlert(
        'Cámara no disponible',
        'Permití el acceso a la cámara en el navegador. En el celular, usá Chrome o Safari con HTTPS. Si lo bloqueaste, habilitalo en la configuración del sitio.',
      );
    }
  };

  const handleScan = async (rawData) => {
    if (!scanning || processing) return;
    const token = extractEntryToken(rawData);
    if (!token) return;

    const now = Date.now();
    if (lastScanRef.current.token === token && now - lastScanRef.current.at < 4000) {
      return;
    }
    lastScanRef.current = { token, at: now };

    setProcessing(true);
    setScanning(false);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post('/club-entry/scan', { token }, { headers: h });
      setLastResult(data);
      setTab('scan');
      reload({ background: true });
      if ((data.warnings || []).length > 0) {
        showAlert(
          'Atención — decidí el ingreso',
          data.warnings.join('\n\n'),
        );
      }
    } catch (e) {
      showAlert('No se pudo registrar', e.response?.data?.message || 'Código inválido o expirado.');
    } finally {
      setProcessing(false);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      cooldownRef.current = setTimeout(() => setScanning(true), 1800);
    }
  };

  const dismissResult = () => setLastResult(null);

  const handleLogout = async () => {
    await clearSession();
  };

  const filteredEntries = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return todayEntries;
    return todayEntries.filter((item) => entrySearchBlob(item.member).includes(q));
  }, [todayEntries, historySearch]);

  const renderEntry = ({ item }) => {
    const m = item.member;
    const name = m ? `${m.nombre || ''} ${m.apellido || ''}`.trim() : '—';
    return (
      <View style={[styles.logRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <UserAvatar user={m} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {entryRoleLabel(m?.rol)}
            {item.duplicate ? ' · duplicado' : ''}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatTime(item.scannedAt)}</Text>
        </View>
        {item.duplicate ? (
          <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
        ) : (
          <Ionicons name="checkmark-circle-outline" size={18} color="#10b981" />
        )}
      </View>
    );
  };

  const cameraReady = !!permission?.granted;
  const canRequestCamera = permission?.canAskAgain !== false;

  const permissionMessage =
    Platform.OS === 'web'
      ? 'Necesitamos acceso a la cámara para escanear los QR. Tocá el botón y aceptá el permiso en el navegador (HTTPS requerido).'
      : 'Necesitamos acceso a la cámara para escanear los QR de ingreso.';

  const renderScanTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.scanTabContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {!cameraReady ? (
        <View style={[styles.permissionBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {permission == null ? (
            <ActivityIndicator color={colorMarca} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={48} color={theme.icon} />
              <Text style={[styles.permissionTxt, { color: theme.text }]}>{permissionMessage}</Text>
              {canRequestCamera ? (
                <TouchableOpacity
                  style={[styles.permissionBtn, { backgroundColor: colorMarca }]}
                  onPress={handleRequestCamera}
                >
                  <Text style={styles.permissionBtnTxt}>Permitir cámara</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.permissionHint, { color: theme.textMuted }]}>
                  El permiso fue bloqueado. Habilitá la cámara en la configuración del navegador y recargá la página.
                </Text>
              )}
            </>
          )}
        </View>
      ) : (
        <View
          style={[
            styles.cameraWrap,
            { height: CAMERA_HEIGHT },
            Platform.OS === 'web' && styles.cameraWrapWeb,
          ]}
          collapsable={false}
        >
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanning ? ({ data }) => handleScan(data) : undefined}
          />
          <View style={styles.cameraOverlay} pointerEvents="none">
            <View style={styles.scanFrame} />
            {processing ? (
              <View style={styles.processingBadge} pointerEvents="none">
                <ActivityIndicator color="#fff" />
                <Text style={styles.processingTxt}>Verificando…</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Último ingreso</Text>
      <ResultCard result={lastResult} onDismiss={dismissResult} theme={theme} />
    </ScrollView>
  );

  const renderHistoryTab = () => (
    <View style={styles.historyTab}>
      <View style={styles.logHeader}>
        <View>
          <Text style={[styles.logTitle, { color: theme.text }]}>Ingresos de hoy</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {historySearch.trim()
              ? `${filteredEntries.length} de ${todayEntries.length}`
              : `${todayEntries.length} registro${todayEntries.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={8} accessibilityLabel="Actualizar historial">
          <Ionicons name="refresh" size={22} color={colorMarca} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
        <TextInput
          style={[
            styles.searchInput,
            { color: theme.text },
            Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
          ]}
          placeholder="Buscar por nombre, DNI o rol"
          placeholderTextColor={theme.textMuted}
          value={historySearch}
          onChangeText={setHistorySearch}
          autoCorrect={false}
          returnKeyType="search"
          blurOnSubmit={false}
        />
        {historySearch ? (
          <TouchableOpacity onPress={() => setHistorySearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={theme.icon} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loadingToday && !todayEntries.length ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderEntry}
          contentContainerStyle={
            filteredEntries.length === 0 ? styles.historyListEmpty : styles.historyListContent
          }
          style={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.historyEmpty}>
              <Ionicons
                name={todayEntries.length === 0 ? 'calendar-outline' : 'search-outline'}
                size={44}
                color={theme.icon}
              />
              <Text style={{ color: theme.text, fontWeight: '700', marginTop: 12 }}>
                {todayEntries.length === 0 ? 'Sin ingresos hoy' : 'Sin resultados'}
              </Text>
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                {todayEntries.length === 0
                  ? 'Los socios que escanees aparecerán en esta lista.'
                  : 'Probá con otro nombre, DNI o rol.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Acceso"
        title="Control de ingreso"
        subtitle={standalone ? clubData?.nombre || 'Tu club' : 'Escaneá el QR del socio o revisá el historial'}
        onBack={standalone ? undefined : () => navigation.goBack()}
        showNotifications={!standalone}
        rightAccessory={
          standalone ? (
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.logoutBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {ENTRY_TABS.map((t) => {
          const active = tab === t.key;
          const count = t.key === 'history' ? todayEntries.length : 0;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { borderBottomColor: colorMarca, borderBottomWidth: 2 }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={18} color={active ? colorMarca : theme.textMuted} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colorMarca : theme.textMuted, fontWeight: active ? '700' : '500' },
                ]}
              >
                {t.label}
              </Text>
              {count > 0 ? (
                <View style={[styles.tabBadge, { backgroundColor: colorMarca }]}>
                  <Text style={styles.tabBadgeTxt}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.body}>{tab === 'scan' ? renderScanTab() : renderHistoryTab()}</View>

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
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { flex: 1, paddingHorizontal: 16 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabLabel: { fontSize: 13 },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tabScroll: { flex: 1 },
  scanTabContent: { paddingTop: 10, paddingBottom: 24 },
  historyTab: { flex: 1, paddingTop: 8 },
  list: { flex: 1 },
  historyListContent: { paddingBottom: 24 },
  historyListEmpty: { flexGrow: 1, paddingBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8, marginLeft: 2 },
  permissionBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    minHeight: 200,
  },
  permissionTxt: { textAlign: 'center', lineHeight: 20, fontSize: 15 },
  permissionBtn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  permissionBtnTxt: { color: '#fff', fontWeight: '800' },
  permissionHint: { textAlign: 'center', lineHeight: 18, fontSize: 13, marginTop: 4 },
  cameraWrap: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#111',
    position: 'relative',
    flexShrink: 0,
  },
  cameraWrapWeb: {
    overflow: 'hidden',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scanFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
  },
  processingBadge: {
    position: 'absolute',
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  processingTxt: { color: '#fff', fontWeight: '600' },
  emptyResult: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  emptyResultTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptyResultSub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    position: 'relative',
  },
  resultClose: { position: 'absolute', top: 8, right: 8, zIndex: 2 },
  resultRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  resultTitle: { fontWeight: '800', fontSize: 13, color: '#374151', textTransform: 'uppercase' },
  resultName: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 2 },
  resultMeta: { fontSize: 13, color: '#4b5563', marginTop: 2 },
  resultWarn: { fontSize: 12, color: '#b45309', marginTop: 4, fontWeight: '600' },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logTitle: { fontSize: 16, fontWeight: '800' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  historyEmpty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
});
