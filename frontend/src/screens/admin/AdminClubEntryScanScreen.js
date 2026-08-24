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
import VisitorEntryModal from '../../components/VisitorEntryModal';
import HistoryDayPickerModal from '../../components/HistoryDayPickerModal';
import { formatRolStaff } from '../staff/staffUtils';
import { USER_ROL_LABELS } from '../../constants/userRoles';
import { useCachedFocusLoad, clearScreenCache } from '../../hooks/useCachedFocusLoad';

const ENTRY_TABS = [
  { key: 'scan', label: 'Escanear', icon: 'qr-code-outline' },
  { key: 'history', label: 'Historial', icon: 'time-outline' },
];

const CAMERA_HEIGHT = Math.min(360, Math.round(Dimensions.get('window').width * 0.78));

function entryRoleLabel(rol) {
  if (!rol) return 'Socio';
  if (rol === 'visitante') return 'Visitante';
  if (rol === 'atleta' || rol === 'tutor') return USER_ROL_LABELS[rol] || rol;
  return formatRolStaff(rol);
}

/** Persona a mostrar: socio o visitante. */
function entryPerson(itemOrResult) {
  if (!itemOrResult) return null;
  if (itemOrResult.entryType === 'visitor' || itemOrResult.visitor) {
    const v = itemOrResult.visitor || {};
    return {
      nombre: v.nombre || '',
      apellido: v.apellido || '',
      dni: v.dni || '',
      fotoPerfil: v.foto || '',
      rol: 'visitante',
      nota: v.nota || '',
    };
  }
  return itemOrResult.member || null;
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

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameCalendarDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatHistoryDayLabel(d) {
  const today = startOfDay();
  if (isSameCalendarDay(d, today)) return 'Hoy';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

function entrySearchBlob(item) {
  const person = entryPerson(item);
  if (!person) return '';
  return [
    person.nombre,
    person.apellido,
    person.dni,
    person.rol,
    person.nota,
    entryRoleLabel(person.rol),
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
          Escaneá un QR o registrá un visitante para verlo acá.
        </Text>
      </View>
    );
  }

  const person = entryPerson(result);
  const hasWarnings = (result.warnings || []).length > 0;
  const tone = result.duplicate || hasWarnings ? 'warn' : 'ok';
  const isVisitor = result.entryType === 'visitor' || !!result.visitor;

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
        <UserAvatar user={person} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.resultTitle}>
            {result.duplicate
              ? 'Ingreso duplicado'
              : hasWarnings
                ? 'Ingreso con alerta'
                : isVisitor
                  ? 'Visitante registrado'
                  : 'Ingreso registrado'}
          </Text>
          <Text style={styles.resultName}>
            {person?.nombre} {person?.apellido}
          </Text>
          <Text style={styles.resultMeta}>
            {entryRoleLabel(person?.rol)}
            {person?.dni ? ` · DNI ${person.dni}` : ''}
          </Text>
          {person?.nota ? <Text style={styles.resultNote}>{person.nota}</Text> : null}
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
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyDay, setHistoryDay] = useState(() => startOfDay());
  const [historySearch, setHistorySearch] = useState('');
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [savingVisitor, setSavingVisitor] = useState(false);
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

  const fetchHistory = useCallback(async () => {
    const h = await getHeaders();
    const date = toIsoDate(historyDay);
    const { data } = await clubApi.get('/club-entry/today', {
      headers: h,
      params: { limit: 50, date },
    });
    return { list: data || [] };
  }, [getHeaders, historyDay]);

  const applyHistory = useCallback((data) => {
    setHistoryEntries(data.list || []);
  }, []);

  const historyCacheKey = clubData?.urlIdentifier
    ? `club-entry-history:${clubData.urlIdentifier}:${toIsoDate(historyDay)}`
    : '';

  const { loading: loadingHistory, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: historyCacheKey,
    enabled: !!clubData?.urlIdentifier,
    fetchData: fetchHistory,
    onFetched: applyHistory,
  });

  const isHistoryToday = isSameCalendarDay(historyDay, new Date());

  const shiftHistoryDay = (delta) => {
    setHistoryDay((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      d.setHours(0, 0, 0, 0);
      const today = startOfDay();
      if (d > today) return prev;
      return d;
    });
  };

  const refreshHistoryAfterEntry = useCallback(() => {
    reload({ background: true });
    if (clubData?.urlIdentifier && !isHistoryToday) {
      clearScreenCache(`club-entry-history:${clubData.urlIdentifier}:${toIsoDate(new Date())}`);
    }
  }, [clubData?.urlIdentifier, isHistoryToday, reload]);

  const goToHistoryToday = () => setHistoryDay(startOfDay());

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
      refreshHistoryAfterEntry();
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

  const handleRegisterVisitor = async (payload) => {
    if (savingVisitor) return;
    setSavingVisitor(true);
    // Close form before the request — stacked Modals (form + CustomAlert) freeze RN.
    setVisitorOpen(false);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post('/club-entry/visitor', payload, { headers: h });
      setLastResult(data);
      setTab('scan');
      refreshHistoryAfterEntry();
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        (e.code === 'ECONNABORTED'
          ? 'La solicitud tardó demasiado. Revisá la conexión.'
          : e.message || 'Revisá los datos e intentá de nuevo.');
      // Wait for the visitor modal to finish unmounting before showing another Modal.
      setTimeout(() => {
        showAlert('No se pudo registrar', msg);
      }, 350);
    } finally {
      setSavingVisitor(false);
    }
  };

  const handleLogout = async () => {
    await clearSession();
  };

  const filteredEntries = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return historyEntries;
    return historyEntries.filter((item) => entrySearchBlob(item).includes(q));
  }, [historyEntries, historySearch]);

  const renderEntry = ({ item }) => {
    const m = entryPerson(item);
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
            {m?.dni ? ` · DNI ${m.dni}` : ''}
            {item.duplicate ? ' · duplicado' : ''}
          </Text>
          {m?.nota ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={2}>
              {m.nota}
            </Text>
          ) : null}
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
          {/* Unmount camera while visitor modal is open — Modal + CameraView freezes on some devices. */}
          {visitorOpen ? (
            <View style={[StyleSheet.absoluteFillObject, styles.cameraPaused]}>
              <Ionicons name="camera-outline" size={36} color="rgba(255,255,255,0.5)" />
              <Text style={styles.cameraPausedTxt}>Cámara en pausa</Text>
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                scanning && !processing ? ({ data }) => handleScan(data) : undefined
              }
            />
          )}
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

      <TouchableOpacity
        style={[styles.visitorBtn, { backgroundColor: colorMarca, opacity: savingVisitor ? 0.7 : 1 }]}
        onPress={() => setVisitorOpen(true)}
        disabled={savingVisitor}
        accessibilityRole="button"
        accessibilityLabel="Registrar visitante"
      >
        {savingVisitor ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={styles.visitorBtnTxt}>Registrar visitante</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Último ingreso</Text>
      <ResultCard result={lastResult} onDismiss={dismissResult} theme={theme} />
    </ScrollView>
  );

  const renderHistoryTab = () => (
    <View style={styles.historyTab}>
      <View style={styles.logHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.logTitle, { color: theme.text }]}>
            Ingresos — {formatHistoryDayLabel(historyDay)}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {historySearch.trim()
              ? `${filteredEntries.length} de ${historyEntries.length}`
              : `${historyEntries.length} registro${historyEntries.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={8} accessibilityLabel="Actualizar historial">
          <Ionicons name="refresh" size={22} color={colorMarca} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayNavRow}>
        <TouchableOpacity
          style={[styles.dayNavBtn, { borderColor: theme.border }]}
          onPress={() => shiftHistoryDay(-1)}
          accessibilityLabel="Día anterior"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={colorMarca} />
        </TouchableOpacity>
        <View style={styles.dayNavCenter}>
          <TouchableOpacity
            style={styles.dayNavLabelRow}
            onPress={() => setHistoryPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Elegir fecha del historial"
            hitSlop={8}
          >
            <Ionicons name="calendar-outline" size={16} color={colorMarca} />
            <Text style={[styles.dayNavLabel, { color: theme.text }]} numberOfLines={1}>
              {formatHistoryDayLabel(historyDay)}
            </Text>
          </TouchableOpacity>
          {!isHistoryToday ? (
            <TouchableOpacity onPress={goToHistoryToday} hitSlop={8} accessibilityLabel="Ir a hoy">
              <Text style={[styles.dayNavTodayLink, { color: colorMarca }]}>Ir a hoy</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[
            styles.dayNavBtn,
            { borderColor: theme.border, opacity: isHistoryToday ? 0.35 : 1 },
          ]}
          onPress={() => shiftHistoryDay(1)}
          disabled={isHistoryToday}
          accessibilityLabel="Día siguiente"
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={20} color={colorMarca} />
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

      {loadingHistory && !historyEntries.length ? (
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
                name={historyEntries.length === 0 ? 'calendar-outline' : 'search-outline'}
                size={44}
                color={theme.icon}
              />
              <Text style={{ color: theme.text, fontWeight: '700', marginTop: 12 }}>
                {historyEntries.length === 0
                  ? isHistoryToday
                    ? 'Sin ingresos hoy'
                    : 'Sin ingresos este día'
                  : 'Sin resultados'}
              </Text>
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                {historyEntries.length === 0
                  ? isHistoryToday
                    ? 'Los socios y visitantes que registres aparecerán en esta lista.'
                    : 'No hubo registros en esta fecha. Probá otro día con las flechas de arriba.'
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
          const count = t.key === 'history' && isHistoryToday ? historyEntries.length : 0;
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
                  <Text style={styles.tabBadgeTxt}>{count > 10 ? '+' : count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.body}>{tab === 'scan' ? renderScanTab() : renderHistoryTab()}</View>

      <HistoryDayPickerModal
        visible={historyPickerOpen}
        value={historyDay}
        onClose={() => setHistoryPickerOpen(false)}
        onSelect={setHistoryDay}
        theme={theme}
        colorMarca={colorMarca}
      />

      <VisitorEntryModal
        visible={visitorOpen}
        onClose={() => !savingVisitor && setVisitorOpen(false)}
        onSubmit={handleRegisterVisitor}
        theme={theme}
        colorMarca={colorMarca}
        saving={savingVisitor}
      />

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
  visitorBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  visitorBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
  cameraPaused: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    gap: 8,
  },
  cameraPausedTxt: { color: 'rgba(255,255,255,0.55)', fontWeight: '600', fontSize: 13 },
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
  resultNote: { fontSize: 12, color: '#4b5563', marginTop: 4, fontStyle: 'italic' },
  resultWarn: { fontSize: 12, color: '#b45309', marginTop: 4, fontWeight: '600' },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logTitle: { fontSize: 16, fontWeight: '800' },
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  dayNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNavCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  dayNavLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayNavLabel: { fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  dayNavTodayLink: { fontSize: 12, fontWeight: '700', marginTop: 2 },
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
