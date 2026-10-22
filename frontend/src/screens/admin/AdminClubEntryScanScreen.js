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
  ScrollView,
  TextInput,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
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
import FilterPillSheet from '../../components/FilterPillSheet';
import { formatRolStaff } from '../staff/staffUtils';
import { USER_ROL_LABELS } from '../../constants/userRoles';
import { useCachedFocusLoad, clearScreenCache } from '../../hooks/useCachedFocusLoad';
import { formatUserName } from '../../utils/listSort';

const ENTRY_TABS = [
  { key: 'scan', label: 'Escanear', icon: 'qr-code-outline' },
  { key: 'history', label: 'Historial', icon: 'time-outline' },
];

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

function detectQrKind(raw) {
  const value = String(raw || '').trim();
  if (value.startsWith('gpsports:event:')) return 'event';
  if (value.startsWith('gpsports:entry:')) return 'entry';
  return 'unknown';
}

function pendingPersonName(pending) {
  if (!pending) return '';
  if (pending.gate === 'event') {
    const holder = pending.preview?.ticket?.titular || {};
    return `${holder.apellido || ''} ${holder.nombre || ''}`.trim() || 'Entrada';
  }
  return formatUserName(pending.preview?.member || pending.preview?.visitor) || 'Ingreso';
}

function pendingPersonDetail(pending) {
  if (!pending) return '';
  if (pending.gate === 'event') {
    const holder = pending.preview?.ticket?.titular || {};
    const tipo = pending.preview?.ticket?.tipoEntradaNombre;
    return [`DNI ${holder.dni || 'sin cargar'}`, tipo].filter(Boolean).join(' · ');
  }
  const person = pending.preview?.member || {};
  return [entryRoleLabel(person.rol), person.dni ? `DNI ${person.dni}` : ''].filter(Boolean).join(' · ');
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

function ResultCard({ result, onDismiss, theme, gate = 'club' }) {
  if (!result) {
    return (
      <View style={[styles.emptyResult, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name={gate === 'event' ? 'ticket-outline' : 'person-outline'} size={40} color={theme.icon} />
        <Text style={[styles.emptyResultTitle, { color: theme.text }]}>
          {gate === 'event' ? 'Sin entradas recientes' : 'Sin ingresos recientes'}
        </Text>
        <Text style={[styles.emptyResultSub, { color: theme.textMuted }]}>
          {gate === 'event'
            ? 'Escaneá el QR de una entrada para verla acá.'
            : 'Escaneá un QR o registrá un visitante para verlo acá.'}
        </Text>
      </View>
    );
  }

  if (result.entryType === 'event' || result.ticket) {
    const holder = result.ticket?.titular?.nombre || result.ticket?.titular?.dni
      ? result.ticket.titular
      : result.ticket?.comprador || {};
    const name = `${holder.apellido || ''} ${holder.nombre || ''}`.trim() || 'Entrada';
    const blocked = !!result.alreadyUsed;
    const declined = result.decision === 'no_entro';
    const title = blocked
      ? 'Este ticket ya se usó'
      : declined
        ? 'No entró'
        : result.decision === 'entro'
          ? 'Entró'
          : 'Entrada válida';
    return (
      <View
        style={[
          styles.resultCard,
          {
            backgroundColor: blocked || declined ? '#fef3c7' : '#ecfdf5',
            borderColor: blocked ? '#ef4444' : declined ? '#f59e0b' : '#10b981',
          },
        ]}
      >
        <TouchableOpacity style={styles.resultClose} onPress={onDismiss} hitSlop={10}>
          <Ionicons name="close" size={20} color="#374151" />
        </TouchableOpacity>
        <View style={styles.resultRow}>
          <Ionicons name="ticket-outline" size={40} color="#15803d" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.resultTitle}>{title}</Text>
            <Text style={styles.resultName}>{name}</Text>
            <Text style={styles.resultDni}>DNI {holder.dni || 'sin cargar'}</Text>
            <Text style={styles.resultHint}>Pedí el DNI y comparalo con este número.</Text>
            <Text style={styles.resultMeta}>
              {result.evento?.titulo || 'Evento'}
              {result.ticket?.tipoEntradaNombre
                ? ` · ${result.ticket.tipoEntradaNombre}`
                : ''}
            </Text>
            {result.ticket?.codigo ? (
              <Text style={styles.resultMeta}>Código {result.ticket.codigo}</Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const person = entryPerson(result);
  const billing = result.billing;
  const hasWarnings = (result.warnings || []).length > 0;
  const tone = result.duplicate || hasWarnings || billing?.isMoroso ? 'warn' : 'ok';
  const isVisitor = result.entryType === 'visitor' || !!result.visitor;

  const statusLabel = billing?.isMoroso
    ? billing.estadoUsuario === 'moroso'
      ? 'Moroso'
      : 'Con cuotas vencidas'
    : billing?.alDia
      ? 'Al día'
      : null;

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
            {result.alreadyEntered
              ? 'Ya entró'
              : result.decision === 'no_entro'
                ? 'No entró'
                : result.decision === 'entro'
                  ? 'Entró'
                  : result.duplicate
                    ? 'Ingreso duplicado'
                    : hasWarnings || billing?.isMoroso
                      ? 'Ingreso con alerta'
                      : isVisitor
                        ? 'Visitante registrado'
                        : 'Ingreso registrado'}
          </Text>
          <Text style={styles.resultName}>
            {formatUserName(person)}
          </Text>
          <Text style={styles.resultMeta}>
            {entryRoleLabel(person?.rol)}
            {person?.dni ? ` · DNI ${person.dni}` : ''}
          </Text>
          {person?.nota ? <Text style={styles.resultNote}>{person.nota}</Text> : null}

          {!isVisitor && billing ? (
            <View style={styles.billingBlock}>
              {statusLabel ? (
                <View
                  style={[
                    styles.billingBadge,
                    {
                      backgroundColor: billing.isMoroso ? '#fecaca' : '#bbf7d0',
                    },
                  ]}
                >
                  <Ionicons
                    name={billing.isMoroso ? 'alert-circle' : 'checkmark-circle'}
                    size={14}
                    color={billing.isMoroso ? '#b91c1c' : '#15803d'}
                  />
                  <Text
                    style={{
                      color: billing.isMoroso ? '#b91c1c' : '#15803d',
                      fontWeight: '800',
                      fontSize: 12,
                    }}
                  >
                    {statusLabel}
                  </Text>
                </View>
              ) : null}
              {billing.planSummary ? (
                <Text style={styles.billingLine}>
                  <Text style={styles.billingKey}>Plan: </Text>
                  {billing.planSummary}
                </Text>
              ) : null}
              {billing.socialSummary ? (
                <Text style={styles.billingLine}>
                  <Text style={styles.billingKey}>Cuota social: </Text>
                  {billing.socialSummary}
                </Text>
              ) : null}
              {(billing.mesActual || []).length > 0 ? (
                <Text style={styles.billingLine}>
                  <Text style={styles.billingKey}>Mes actual: </Text>
                  {billing.mesActual
                    .map((p) => `${p.nombre} (${p.estado})`)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
          ) : null}

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
  const tabRoot = route?.params?.tabRoot === true;
  const gate = route?.params?.gate === 'event' ? 'event' : 'club';
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const cameraHeight = Math.min(360, Math.round(windowWidth * 0.78));
  const cameraWidth = Math.max(1, windowWidth - 32);
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
  const [cameraKey, setCameraKey] = useState(0);
  const [eventTargets, setEventTargets] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventFilterOpen, setEventFilterOpen] = useState(null);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [savingDecision, setSavingDecision] = useState(false);
  const [doorLog, setDoorLog] = useState([]);
  const [doorLogTick, setDoorLogTick] = useState(0);
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

  // Swipe tabs keep screens mounted — remount camera when this tab gains focus.
  useEffect(() => {
    if (isFocused && tab === 'scan' && !visitorOpen) {
      setCameraKey((k) => k + 1);
      setScanning(true);
    }
  }, [isFocused, tab, visitorOpen]);

  const handleRequestCamera = async () => {
    const result = await requestPermission();
    if (Platform.OS === 'web' && !result?.granted) {
      showAlert(
        'Cámara no disponible',
        'Permití el acceso a la cámara en el navegador. En el celular, usá Chrome o Safari con HTTPS. Si lo bloqueaste, habilitalo en la configuración del sitio.',
      );
    }
  };

  const loadEventTargets = useCallback(async () => {
    try {
      const h = await getHeaders();
      const { data } = await clubApi.get('/events/scan-targets', { headers: h });
      const list = data || [];
      setEventTargets(list);
      setSelectedEventId((prev) => {
        if (prev && list.some((e) => String(e._id) === String(prev))) return prev;
        return list[0] ? String(list[0]._id) : '';
      });
    } catch {
      setEventTargets([]);
    }
  }, [getHeaders]);

  useEffect(() => {
    if (gate === 'event' && isFocused) {
      loadEventTargets();
    }
  }, [gate, isFocused, loadEventTargets]);

  useEffect(() => {
    if (gate !== 'event' || !selectedEventId || !isFocused) {
      setDoorLog([]);
      return undefined;
    }
    let cancel = false;
    (async () => {
      try {
        const h = await getHeaders();
        const { data } = await clubApi.get('/events/door-log', {
          headers: h,
          params: { eventoId: selectedEventId },
        });
        if (!cancel) setDoorLog(Array.isArray(data) ? data : []);
      } catch {
        if (!cancel) setDoorLog([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [gate, selectedEventId, isFocused, doorLogTick, getHeaders]);

  const selectedEvent = useMemo(
    () => eventTargets.find((e) => String(e._id) === String(selectedEventId)),
    [eventTargets, selectedEventId],
  );

  const resumeScanning = () => {
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => setScanning(true), 600);
  };

  const handleScan = async (rawData) => {
    if (!scanning || processing || pendingEntry) return;
    const kind = detectQrKind(rawData);
    const raw = String(rawData || '').trim();
    if (!raw) return;

    if (gate === 'club' && kind === 'event') {
      showAlert('Ingreso de socios', 'Este QR es de un evento. Usá Ingreso a eventos.');
      return;
    }
    if (gate === 'event' && kind === 'entry') {
      showAlert('Ingreso al evento', 'Este QR es de ingreso al club, no de una entrada.');
      return;
    }

    const token = gate === 'event' ? raw : extractEntryToken(raw);
    if (!token) return;

    const now = Date.now();
    if (lastScanRef.current.token === token && now - lastScanRef.current.at < 4000) {
      return;
    }
    lastScanRef.current = { token, at: now };

    setProcessing(true);
    setScanning(false);
    let awaitingDecision = false;
    try {
      const h = await getHeaders();
      if (gate === 'event') {
        if (!selectedEventId) {
          showAlert('Elegí el evento', 'Seleccioná el evento de la puerta antes de escanear.');
          return;
        }
        const { data } = await clubApi.post(
          '/events/tickets/scan',
          { token, eventoId: selectedEventId },
          { headers: h },
        );
        if (data.needsDecision) {
          awaitingDecision = true;
          setPendingEntry({ gate: 'event', token, eventoId: selectedEventId, preview: data });
          return;
        }
        setLastResult({ ...data, entryType: 'event' });
        setTab('scan');
      } else {
        const { data } = await clubApi.post('/club-entry/scan', { token }, { headers: h });
        if (data.needsDecision) {
          awaitingDecision = true;
          setPendingEntry({ gate: 'club', token, preview: data });
          return;
        }
        setLastResult(data);
        setTab('scan');
      }
    } catch (e) {
      showAlert('No se pudo registrar', e.response?.data?.message || 'Código inválido o expirado.');
    } finally {
      setProcessing(false);
      if (!awaitingDecision) resumeScanning();
    }
  };

  const dismissPendingEntry = () => {
    if (savingDecision) return;
    setPendingEntry(null);
    lastScanRef.current = { token: '', at: 0 };
    resumeScanning();
  };

  const chooseEntry = async (decision) => {
    if (!pendingEntry || savingDecision) return;
    setSavingDecision(true);
    try {
      const h = await getHeaders();
      const url = pendingEntry.gate === 'event'
        ? '/events/tickets/scan/confirm'
        : '/club-entry/scan/confirm';
      const body = { token: pendingEntry.token, decision };
      if (pendingEntry.gate === 'event') body.eventoId = pendingEntry.eventoId;
      const { data } = await clubApi.post(url, body, { headers: h });
      setLastResult(pendingEntry.gate === 'event' ? { ...data, entryType: 'event' } : data);
      setPendingEntry(null);
      if (pendingEntry.gate === 'event') setDoorLogTick((n) => n + 1);
      else refreshHistoryAfterEntry();
      lastScanRef.current = { token: '', at: 0 };
    } catch (e) {
      showAlert('No se pudo registrar', e.response?.data?.message || 'No se pudo guardar la decisión.');
    } finally {
      setSavingDecision(false);
      resumeScanning();
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
    const name = m ? formatUserName(m) : '—';
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
            {item.decision === 'no_entro' ? ' · No entró' : ' · Entró'}
            {item.duplicate ? ' · duplicado' : ''}
          </Text>
          {m?.nota ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={2}>
              {m.nota}
            </Text>
          ) : null}
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatTime(item.scannedAt)}</Text>
        </View>
        {item.decision === 'no_entro' ? (
          <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
        ) : item.duplicate ? (
          <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
        ) : (
          <Ionicons name="checkmark-circle-outline" size={18} color="#10b981" />
        )}
      </View>
    );
  };

  const eventHeaderSubtitle = useMemo(() => {
    if (!selectedEvent) return 'No hay eventos asignados para escanear';
    const when = selectedEvent.fechaInicio
      ? new Date(selectedEvent.fechaInicio).toLocaleString('es-AR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    return [selectedEvent.titulo, when, selectedEvent.lugar].filter(Boolean).join(' · ');
  }, [selectedEvent]);

  const eventFilterPills = useMemo(
    () => [
      {
        key: 'evento',
        placeholder: 'Evento',
        displayLabel: selectedEvent?.titulo || 'Evento',
        value: selectedEventId,
        onChange: (id) => setSelectedEventId(String(id)),
        options: eventTargets.map((ev) => {
          const when = ev.fechaInicio
            ? new Date(ev.fechaInicio).toLocaleString('es-AR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          return {
            value: String(ev._id),
            label: [ev.titulo, when].filter(Boolean).join(' · '),
          };
        }),
      },
    ],
    [eventTargets, selectedEvent, selectedEventId],
  );

  const cameraReady = !!permission?.granted;
  const canRequestCamera = permission?.canAskAgain !== false;
  const showLiveCamera =
    cameraReady && isFocused && tab === 'scan' && !visitorOpen && !historyPickerOpen && !eventFilterOpen && !pendingEntry;

  const permissionMessage =
    Platform.OS === 'web'
      ? 'Necesitamos acceso a la cámara para escanear los QR. Tocá el botón y aceptá el permiso en el navegador (HTTPS requerido).'
      : 'Necesitamos acceso a la cámara para escanear los QR de ingreso.';

  const eventFilter =
    gate === 'event' && eventTargets.length > 1 ? (
      <FilterPillSheet
        appearance="header"
        pills={eventFilterPills}
        openKey={eventFilterOpen}
        onOpen={setEventFilterOpen}
        onClose={() => setEventFilterOpen(null)}
        colorMarca={colorMarca}
        theme={theme}
      />
    ) : null;

  const renderScanTab = () => (
    <View style={styles.scanTab}>
      {gate === 'event' && !eventTargets.length ? null : !cameraReady ? (
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
                  El permiso fue bloqueado. Habilitá la cámara en la configuración del dispositivo o del navegador y volvé a entrar.
                </Text>
              )}
            </>
          )}
        </View>
      ) : (
        <View
          style={[styles.cameraWrap, { width: cameraWidth, height: cameraHeight }]}
          collapsable={false}
        >
          {showLiveCamera ? (
            <CameraView
              key={`entry-cam-${cameraKey}`}
              style={{ width: cameraWidth, height: cameraHeight }}
              facing="back"
              active={Platform.OS === 'ios' ? true : undefined}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                scanning && !processing ? ({ data }) => handleScan(data) : undefined
              }
            />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.cameraPaused]}>
              <Ionicons name="camera-outline" size={36} color="rgba(255,255,255,0.5)" />
              <Text style={styles.cameraPausedTxt}>
                {visitorOpen ? 'Cámara en pausa' : 'Activando cámara…'}
              </Text>
            </View>
          )}
          {processing ? (
            <View style={styles.cameraOverlay} pointerEvents="none">
              <View style={styles.processingBadge} pointerEvents="none">
                <ActivityIndicator color="#fff" />
                <Text style={styles.processingTxt}>Verificando…</Text>
              </View>
            </View>
          ) : null}
        </View>
      )}

      <ScrollView
        style={styles.tabScroll}
        contentContainerStyle={styles.scanTabContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {gate === 'club' ? (
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
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
          {gate === 'event' ? 'Última entrada' : 'Último ingreso'}
        </Text>
        <ResultCard result={lastResult} onDismiss={dismissResult} theme={theme} gate={gate} />
        {gate === 'event' && doorLog.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Historial</Text>
            {doorLog.map((row) => {
              const holder = row.titular || {};
              const name = `${holder.apellido || ''} ${holder.nombre || ''}`.trim() || 'Entrada';
              const entered = row.decision !== 'no_entro';
              return (
                <View
                  key={row._id}
                  style={[styles.logRow, { borderColor: theme.border, backgroundColor: theme.surface, marginBottom: 8 }]}
                >
                  <Ionicons
                    name={entered ? 'checkmark-circle-outline' : 'close-circle-outline'}
                    size={22}
                    color={entered ? '#10b981' : '#ef4444'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {entered ? 'Entró' : 'No entró'}
                      {holder.dni ? ` · DNI ${holder.dni}` : ''}
                      {row.tipoEntradaNombre ? ` · ${row.tipoEntradaNombre}` : ''}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatTime(row.scannedAt)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </View>
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
        title={gate === 'event' ? 'Ingreso al evento' : 'Control de ingreso'}
        subtitle={
          gate === 'event'
            ? eventHeaderSubtitle
            : standalone
              ? clubData?.nombre || 'Tu club'
              : 'Escaneá el QR del socio'
        }
        subtitleLines={gate === 'event' ? 2 : 1}
        onBack={standalone || tabRoot ? undefined : () => navigation.goBack()}
        leadingAccessory={eventFilter}
        showNotifications={!standalone && !tabRoot}
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

      {gate === 'club' ? (
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
      ) : null}

      <View style={styles.body}>{gate === 'event' || tab === 'scan' ? renderScanTab() : renderHistoryTab()}</View>

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

      <Modal
        visible={!!pendingEntry}
        transparent
        animationType="fade"
        onRequestClose={dismissPendingEntry}
      >
        <View style={styles.decisionOverlay}>
          <View style={[styles.decisionCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.decisionTitle, { color: theme.text }]}>
              {pendingPersonName(pendingEntry)}
            </Text>
            <Text style={[styles.decisionSub, { color: theme.textMuted }]}>
              {pendingPersonDetail(pendingEntry)}
            </Text>
            {(pendingEntry?.preview?.warnings || []).map((w) => (
              <Text key={w} style={styles.decisionWarn}>
                {w}
              </Text>
            ))}
            <View style={styles.decisionActions}>
              <TouchableOpacity
                style={[styles.decisionBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => chooseEntry('no_entro')}
                disabled={savingDecision}
              >
                <Text style={{ color: theme.text, fontWeight: '800' }}>No entró</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.decisionBtn, { backgroundColor: colorMarca, opacity: savingDecision ? 0.7 : 1 }]}
                onPress={() => chooseEntry('entro')}
                disabled={savingDecision}
              >
                {savingDecision ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Entró</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={dismissPendingEntry} disabled={savingDecision} style={{ marginTop: 14 }}>
              <Text style={{ color: theme.textMuted, textAlign: 'center', fontWeight: '700' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  decisionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  decisionCard: { borderRadius: 18, padding: 20 },
  decisionTitle: { fontSize: 20, fontWeight: '800' },
  decisionSub: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  decisionWarn: { color: '#b45309', fontSize: 13, marginTop: 8, lineHeight: 18 },
  decisionActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  decisionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  scanTab: { flex: 1 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabScroll: { flex: 1 },
  scanTabContent: { paddingTop: 4, paddingBottom: 24 },
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
    borderRadius: 14,
    backgroundColor: '#111',
    position: 'relative',
    overflow: Platform.OS === 'android' ? 'visible' : 'hidden',
    alignSelf: 'center',
  },
  cameraPaused: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    gap: 8,
  },
  cameraPausedTxt: { color: 'rgba(255,255,255,0.55)', fontWeight: '600', fontSize: 13 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
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
  resultDni: { fontSize: 22, fontWeight: '800', color: '#14532d', marginTop: 4, letterSpacing: 0.4 },
  resultHint: { fontSize: 12, color: '#166534', marginTop: 2 },
  resultMeta: { fontSize: 13, color: '#4b5563', marginTop: 2 },
  resultNote: { fontSize: 12, color: '#4b5563', marginTop: 4, fontStyle: 'italic' },
  billingBlock: { marginTop: 8, gap: 4 },
  billingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  billingLine: { fontSize: 12, color: '#374151', lineHeight: 17 },
  billingKey: { fontWeight: '800', color: '#111827' },
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
