import React, { useState, useContext, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  TextInput,
  RefreshControl,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import QRCode from 'react-native-qrcode-svg';
import { clubApi } from '../../utils/api';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import CustomAlert, { AlertHost } from '../../components/CustomAlert';
import StadiumSeatPicker from '../../components/StadiumSeatPicker';
import StadiumLibrary from '../../components/StadiumLibrary';
import DiscountLibrary from '../../components/DiscountLibrary';
import StadiumAreaStage from '../../components/StadiumAreaStage';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import Foldable, { FoldableChevron } from '../../components/Foldable';
import { canMutateAsAdmin, isClubOwnerRole } from '../../constants/appRoles';
import { USER_ROL_LABELS } from '../../constants/userRoles';
import { formatJsDateToDisplay, maskDateDDMMAAAA, displayDateToIsoCalendar } from '../../utils/dateDisplay';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import { uploadFileToClub } from '../../utils/uploadMedia';
import { pickAndUploadImage, pickImageAsset } from './finanzas/finanzasUpload';
import WebImageCropModal from '../../components/WebImageCropModal';
import { copyText } from '../../utils/copyText';

const ESTADOS_LABEL = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
  finalizado: 'Finalizado',
};

const ROLES = [
  { id: 'socio', label: 'Socio' },
  { id: 'atleta', label: 'Atleta' },
  { id: 'tutor', label: 'Tutor' },
];

const FORM_STEPS = [
  { key: 'datos', label: 'Datos' },
  { key: 'entradas', label: 'Entradas' },
  { key: 'descuentos', label: 'Descuentos' },
];

const MODO_OPTIONS = [
  { id: 'porcentaje', label: '%' },
  { id: 'precio_fijo', label: 'Precio fijo' },
  { id: 'gratis', label: 'Gratis' },
];

const ORDER_ESTADO_LABEL = {
  pendiente_pago: 'Pendiente',
  pagada: 'Pagada',
  gratis: 'Gratis',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

const ORDER_ESTADO_TONE = {
  pendiente_pago: { bg: '#fef3c7', fg: '#b45309', border: '#f59e0b' },
  pagada: { bg: '#ecfdf5', fg: '#047857', border: '#10b981' },
  gratis: { bg: '#eff6ff', fg: '#1d4ed8', border: '#3b82f6' },
  cancelada: { bg: '#fef2f2', fg: '#b91c1c', border: '#ef4444' },
  expirada: { bg: '#f3f4f6', fg: '#4b5563', border: '#9ca3af' },
};

const ORDER_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'pagada', label: 'Pagadas' },
  { id: 'gratis', label: 'Gratis' },
  { id: 'pendiente_pago', label: 'Pendientes' },
  { id: 'otros', label: 'Otras' },
];

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function formatOrderWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const emptyTipo = () => ({ nombre: 'General', precio: '0', cupo: '100', activo: true });

function toDisplayDate(iso) {
  if (!iso) return '';
  try {
    return formatJsDateToDisplay(new Date(iso));
  } catch {
    return '';
  }
}

/** HH:MM local from ISO datetime. */
function toDisplayTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

/** DD-MM-AAAA + HH:MM → ISO (local timezone). */
function combineDisplayDateTime(displayDate, hhmm) {
  const ymd = displayDateToIsoCalendar(displayDate);
  if (!ymd || !isValidTimeHHMM(hhmm)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = String(hhmm).split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function eventDayStillOpen(iso) {
  if (!iso) return false;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return false;
  const today = new Date();
  const eventKey = start.getFullYear() * 10000 + start.getMonth() * 100 + start.getDate();
  const todayKey = today.getFullYear() * 10000 + today.getMonth() * 100 + today.getDate();
  return eventKey >= todayKey;
}

function Field({ label, theme, children, hint }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      {children}
      {hint ? (
        <Text style={[styles.fieldHint, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

function Chip({ label, on, colorMarca, theme, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: on ? colorMarca : theme.border,
          backgroundColor: on ? `${colorMarca}22` : theme.background,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? colorMarca : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AdminEventosScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const { height: windowHeight } = useWindowDimensions();
  const ordersListMax = Math.max(280, Math.round(windowHeight * 0.94 - 200));
  const sellListMax = Math.max(280, Math.round(windowHeight * 0.94 - 150));
  const formListMax = Math.max(240, Math.round(windowHeight * 0.94 - 210));

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerRol, setViewerRol] = useState('');
  const canManageEvents = isClubOwnerRole(viewerRol);
  const canSellTickets = canMutateAsAdmin(viewerRol);
  const canSellEvent = (ev) =>
    canSellTickets && ev?.estado === 'publicado' && eventDayStillOpen(ev?.fechaInicio);

  const [modalOpen, setModalOpen] = useState(false);
  const [formStep, setFormStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cropUri, setCropUri] = useState(null);
  const imageTarget = useRef('evento');
  const stadiumMapWait = useRef(null);
  const [stadiums, setStadiums] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountPickerOpen, setDiscountPickerOpen] = useState(false);
  const [stadiumPickerOpen, setStadiumPickerOpen] = useState(false);
  const [stadiumPickId, setStadiumPickId] = useState('');
  const [discountPickIds, setDiscountPickIds] = useState([]);
  const [stadiumOpen, setStadiumOpen] = useState(false);
  const [stadiumMode, setStadiumMode] = useState('manage');
  const [placingSection, setPlacingSection] = useState(null);
  const [editing, setEditing] = useState(null);
  /** Which tipo/regla card is expanded; others stay collapsed. */
  const [expandedTipoIdx, setExpandedTipoIdx] = useState(0);
  const [expandedReglaIdx, setExpandedReglaIdx] = useState(null);
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    lugar: '',
    imagenUrl: '',
    mapaEstadioUrl: '',
    estadioId: '',
    secciones: [],
    fechaInicioDisplay: '',
    horaInicio: '',
    tiposEntrada: [emptyTipo()],
    reglasDescuento: [],
    controlIngreso: [],
  });

  const [pickers, setPickers] = useState({ cuotasSociales: [], planes: [] });
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersEvent, setOrdersEvent] = useState(null);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersFilter, setOrdersFilter] = useState('all');
  const [addEvent, setAddEvent] = useState(null);
  const [addMode, setAddMode] = useState('app');
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerHits, setBuyerHits] = useState([]);
  const [buyerSearching, setBuyerSearching] = useState(false);
  const [doorQuery, setDoorQuery] = useState('');
  const [doorHits, setDoorHits] = useState([]);
  const [doorSearching, setDoorSearching] = useState(false);
  const [pickedUser, setPickedUser] = useState(null);
  const [guest, setGuest] = useState({ nombre: '', apellido: '', email: '', dni: '' });
  const [addTipoId, setAddTipoId] = useState('');
  const [addSeats, setAddSeats] = useState([]);
  const [addQty, setAddQty] = useState(1);
  const [addHolders, setAddHolders] = useState([{ nombre: '', apellido: '', dni: '' }]);
  const [cashQuote, setCashQuote] = useState(null);
  const [cashQuoteError, setCashQuoteError] = useState('');
  const [cashQuoting, setCashQuoting] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashDone, setCashDone] = useState(null);
  const [sellNotice, setSellNotice] = useState('');

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
  });
  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));
  const showAlert = (title, message, options = {}) =>
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: !!options.showCancel,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: closeAlert,
    });

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const load = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    const h = await getHeaders();
    const [evRes, pickRes, stadiumRes, discountRes] = await Promise.all([
      clubApi.get('/events/admin', { headers: h }),
      clubApi.get('/events/admin/pricing-pickers', { headers: h }).catch(() => ({ data: {} })),
      clubApi.get('/events/admin/stadiums', { headers: h }).catch(() => ({ data: [] })),
      clubApi.get('/events/admin/discounts', { headers: h }).catch(() => ({ data: [] })),
    ]);
    setEvents(evRes.data || []);
    setStadiums(stadiumRes.data || []);
    setDiscounts(discountRes.data || []);
    setPickers({
      cuotasSociales: pickRes.data?.cuotasSociales || [],
      planes: pickRes.data?.planes || [],
    });
  }, [clubData?.urlIdentifier, getHeaders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e) {
        if (!cancelled) showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los eventos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'Error al actualizar.');
    } finally {
      setRefreshing(false);
    }
  };

  const publicListUrl = () =>
    `https://hermesclubapp.com/eventos?club=${encodeURIComponent(clubData?.urlIdentifier || '')}`;

  const ticketPageUrl = (orderId, email) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!orderId || !cleanEmail) return '';
    const q = new URLSearchParams({
      club: clubData?.urlIdentifier || '',
      order: String(orderId),
      email: cleanEmail,
    });
    return `https://hermesclubapp.com/eventos?${q.toString()}`;
  };

  const shareTicketLink = async (orderId, email) => {
    const url = ticketPageUrl(orderId, email);
    if (!url) {
      showAlert('Link', 'Esta compra no tiene un email para armar el link.');
      return;
    }
    try {
      await Share.share({ message: url, url });
    } catch {
      try {
        await copyText(url);
        showAlert('Link copiado', 'La persona puede abrir ese link para ver el QR.');
      } catch {
        showAlert('Link de las entradas', url);
      }
    }
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setFormStep(0);
    setExpandedTipoIdx(0);
    setExpandedReglaIdx(null);
    setDoorQuery('');
    setDoorHits([]);
    setDiscountPickerOpen(false);
    setDiscountPickIds([]);
    setDiscountOpen(false);
    setStadiumPickerOpen(false);
    setStadiumPickId('');
    setStadiumOpen(false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormStep(0);
    setExpandedTipoIdx(0);
    setExpandedReglaIdx(null);
    setForm({
      titulo: '',
      descripcion: '',
      lugar: '',
      imagenUrl: '',
      mapaEstadioUrl: '',
      estadioId: '',
      secciones: [],
      fechaInicioDisplay: formatJsDateToDisplay(new Date()),
      horaInicio: '18:00',
      tiposEntrada: [emptyTipo()],
      reglasDescuento: [],
      controlIngreso: [],
    });
    setDoorQuery('');
    setDoorHits([]);
    setModalOpen(true);
  };

  const openEdit = (ev) => {
    setEditing(ev);
    setFormStep(0);
    setExpandedTipoIdx(0);
    setExpandedReglaIdx(null);
    setForm({
      titulo: ev.titulo || '',
      descripcion: ev.descripcion || '',
      lugar: ev.lugar || '',
      imagenUrl: ev.imagenUrl || '',
      mapaEstadioUrl: ev.mapaEstadioUrl || '',
      estadioId: ev.estadioId ? String(ev.estadioId) : '',
      secciones: (ev.secciones || []).map((section) => ({
        _id: section._id,
        nombre: section.nombre || '',
        filas: String(section.filas || 1),
        asientosPorFila: String(section.asientosPorFila || 1),
        tipoIndex: Math.max(
          0,
          (ev.tiposEntrada || []).findIndex((tipo) => String(tipo._id) === String(section.tipoEntrada)),
        ),
        x: Number(section.x) || 50,
        y: Number(section.y) || 50,
        w: Number(section.w) || 0,
        h: Number(section.h) || 0,
        precio:
          section.precio != null && section.precio !== ''
            ? String(section.precio)
            : String(
                (ev.tiposEntrada || []).find((tipo) => String(tipo._id) === String(section.tipoEntrada))?.precio ?? 0,
              ),
      })),
      fechaInicioDisplay: toDisplayDate(ev.fechaInicio),
      horaInicio: toDisplayTime(ev.fechaInicio) || '18:00',
      tiposEntrada: (ev.tiposEntrada || []).map((t) => ({
        _id: t._id,
        nombre: t.nombre,
        precio: String(t.precio ?? 0),
        cupo: String(t.cupo ?? 0),
        activo: t.activo !== false,
        vendidas: t.vendidas,
      })),
      reglasDescuento: (ev.reglasDescuento || []).map((r) => ({
        _id: r._id,
        nombre: r.nombre,
        roles: r.roles || [],
        cuotasSociales: (r.cuotasSociales || []).map((x) => String(x._id || x)),
        planes: (r.planes || []).map((x) => String(x._id || x)),
        modo: r.modo || 'porcentaje',
        valor: String(r.valor ?? 0),
        maxEntradasConDescuento: String(r.maxEntradasConDescuento ?? 1),
        activo: r.activo !== false,
      })),
      controlIngreso: (ev.controlIngreso || [])
        .map((u) =>
          u && typeof u === 'object'
            ? {
                _id: String(u._id),
                nombre: u.nombre || '',
                apellido: u.apellido || '',
                rol: u.rol || '',
              }
            : { _id: String(u), nombre: 'Usuario', apellido: '', rol: '' },
        )
        .filter((u) => u._id && u._id !== 'undefined'),
    });
    setDoorQuery('');
    setDoorHits([]);
    setModalOpen(true);
  };

  const finishStadiumMap = (url) => {
    if (imageTarget.current !== 'estadio-lib' || !stadiumMapWait.current) return;
    stadiumMapWait.current(url || null);
    stadiumMapWait.current = null;
  };

  const deliverUploadedImage = (field, url) => {
    if (imageTarget.current === 'estadio-lib') {
      finishStadiumMap(url);
      return;
    }
    setForm((current) => ({ ...current, [field]: url }));
  };

  const applyStadium = (stadium) => {
    setForm((current) => {
      const tipos = current.tiposEntrada.map((tipo) => ({ ...tipo }));
      const sections = stadium.secciones || [];
      const singleType = tipos.length === 1;
      const secciones = sections.map((section) => {
        let tipoIndex = singleType
          ? 0
          : tipos.findIndex(
              (tipo) => tipo.nombre.trim().toLowerCase() === String(section.nombre || '').trim().toLowerCase(),
            );
        if (tipoIndex < 0) {
          tipos.push({
            nombre: section.nombre || 'Sector',
            precio: '0',
            cupo: String((Number(section.filas) || 1) * (Number(section.asientosPorFila) || 1)),
            activo: true,
          });
          tipoIndex = tipos.length - 1;
        }
        return {
          nombre: section.nombre || '',
          filas: String(section.filas || 1),
          asientosPorFila: String(section.asientosPorFila || 1),
          tipoIndex,
          precio: String(tipos[tipoIndex]?.precio ?? '0'),
          x: Number(section.x) || 0,
          y: Number(section.y) || 0,
          w: Number(section.w) || 0,
          h: Number(section.h) || 0,
        };
      });
      return {
        ...current,
        estadioId: String(stadium._id || ''),
        mapaEstadioUrl: stadium.mapaUrl || '',
        tiposEntrada: tipos,
        secciones,
      };
    });
    setExpandedTipoIdx(0);
    setStadiumOpen(false);
  };

  const requestStadiumMap = () =>
    new Promise((resolve) => {
      stadiumMapWait.current = resolve;
      uploadEventImage('estadio-lib');
    });

  const uploadEventImage = async (target = 'evento') => {
    imageTarget.current = target;
    const field = target === 'estadio' ? 'mapaEstadioUrl' : 'imagenUrl';
    try {
      if (Platform.OS === 'web') {
        const picked = await pickImageAsset({ quality: 0.9 });
        if (!picked?.uri) {
          finishStadiumMap(null);
          return;
        }
        setCropUri(picked.uri);
        return;
      }
      setUploadingImage(true);
      const url = await pickAndUploadImage(clubData, {
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (url) deliverUploadedImage(field, url);
      else if (imageTarget.current === 'estadio-lib') finishStadiumMap(null);
    } catch (e) {
      showAlert('Imagen', e.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingImage(false);
    }
  };

  const confirmCroppedImage = async (file) => {
    const field = imageTarget.current === 'estadio' ? 'mapaEstadioUrl' : 'imagenUrl';
    setCropUri(null);
    setUploadingImage(true);
    try {
      const name = file?.name || `evento-${Date.now()}.jpg`;
      const mime = file?.type || 'image/jpeg';
      const { url } = await uploadFileToClub(clubData, '', name, mime, { webFile: file });
      if (url) deliverUploadedImage(field, url);
      else if (imageTarget.current === 'estadio-lib') finishStadiumMap(null);
    } catch (e) {
      showAlert('Imagen', e.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingImage(false);
    }
  };

  const buildPayload = () => {
    const fechaInicio = combineDisplayDateTime(form.fechaInicioDisplay, form.horaInicio);
    if (!form.titulo.trim() || !fechaInicio) {
      throw new Error('Título, fecha y hora de inicio son obligatorios.');
    }
    if (!form.tiposEntrada.length) {
      throw new Error('Agregá al menos un tipo de entrada.');
    }
    return {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      lugar: form.lugar.trim(),
      imagenUrl: (form.imagenUrl || '').trim(),
      mapaEstadioUrl: (form.mapaEstadioUrl || '').trim(),
      estadioId: form.estadioId || null,
      secciones: (form.secciones || [])
        .filter((section) => form.tiposEntrada[section.tipoIndex])
        .map((section) => ({
          ...(section._id ? { _id: section._id } : {}),
          nombre: section.nombre.trim() || form.tiposEntrada[section.tipoIndex]?.nombre?.trim() || 'Sector',
          filas: Math.max(1, parseInt(section.filas, 10) || 1),
          asientosPorFila: Math.max(1, parseInt(section.asientosPorFila, 10) || 1),
          tipoIndex: Number(section.tipoIndex) || 0,
          ...(form.tiposEntrada[section.tipoIndex]?._id
            ? { tipoEntrada: form.tiposEntrada[section.tipoIndex]._id }
            : {}),
          x: Number(section.x) || 50,
          y: Number(section.y) || 50,
          w: Number(section.w) || 0,
          h: Number(section.h) || 0,
          precio: Math.max(0, Number(section.precio) || 0),
        })),
      fechaInicio,
      fechaFin: null,
      tiposEntrada: form.tiposEntrada.map((t, index) => {
        const sectionPrices = (form.secciones || [])
          .filter((section) => section.tipoIndex === index)
          .map((section) => Math.max(0, Number(section.precio) || 0));
        return {
        ...(t._id ? { _id: t._id } : {}),
        nombre: t.nombre.trim() || 'General',
        precio: sectionPrices.length ? Math.min(...sectionPrices) : Number(t.precio) || 0,
        cupo: Math.max(0, parseInt(t.cupo, 10) || 0),
        activo: t.activo !== false,
        };
      }),
      reglasDescuento: form.reglasDescuento.map((r) => ({
        ...(r._id ? { _id: r._id } : {}),
        nombre: r.nombre.trim() || 'Descuento',
        roles: r.roles || [],
        cuotasSociales: r.cuotasSociales || [],
        planes: r.planes || [],
        modo: r.modo,
        valor: Number(r.valor) || 0,
        maxEntradasConDescuento: Math.max(1, parseInt(r.maxEntradasConDescuento, 10) || 1),
        activo: r.activo !== false,
      })),
      controlIngreso: (form.controlIngreso || []).map((u) => u._id).filter(Boolean),
    };
  };

  const validateStep = (step) => {
    if (step === 0) {
      if (!form.titulo.trim()) {
        showAlert('Datos', 'El título es obligatorio.');
        return false;
      }
      if (!displayDateToIsoCalendar(form.fechaInicioDisplay)) {
        showAlert('Datos', 'Indicá una fecha de inicio válida (dd/mm/aaaa).');
        return false;
      }
      if (!isValidTimeHHMM(form.horaInicio)) {
        showAlert('Datos', 'Indicá una hora válida (HH:MM).');
        return false;
      }
    }
    if (step === 1) {
      if (!form.tiposEntrada.length) {
        showAlert('Entradas', 'Agregá al menos un tipo de entrada.');
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(formStep)) return;
    setFormStep((s) => Math.min(FORM_STEPS.length - 1, s + 1));
  };

  const goBack = () => setFormStep((s) => Math.max(0, s - 1));

  const save = async () => {
    try {
      setSaving(true);
      const payload = buildPayload();
      const h = await getHeaders();
      if (editing?._id) {
        await clubApi.patch(`/events/admin/${editing._id}`, payload, { headers: h });
      } else {
        await clubApi.post('/events/admin', payload, { headers: h });
      }
      closeFormModal();
      await load();
    } catch (e) {
      showAlert('Error', e.message || e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const publish = async (ev) => {
    try {
      const h = await getHeaders();
      await clubApi.post(`/events/admin/${ev._id}/publish`, {}, { headers: h });
      await load();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo publicar.');
    }
  };

  const cancelEv = async (ev) => {
    showAlert('Cancelar evento', '¿Cancelar este evento? No se eliminan las entradas ya vendidas.', {
      showCancel: true,
      isDanger: true,
      confirmText: 'Cancelar evento',
      onConfirm: async () => {
        closeAlert();
        try {
          const h = await getHeaders();
          await clubApi.post(`/events/admin/${ev._id}/cancel`, {}, { headers: h });
          await load();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo cancelar.');
        }
      },
    });
  };

  const shareLink = async (ev) => {
    const url = `${publicListUrl()}${ev?.slug ? `&e=${encodeURIComponent(ev.slug)}` : ''}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      showAlert('Link público', url);
    }
  };

  const openOrders = async (ev) => {
    setOrdersEvent(ev);
    setOrdersSearch('');
    setOrdersFilter('all');
    setOrdersOpen(true);
    setOrdersLoading(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.get(`/events/admin/${ev._id}/orders`, { headers: h });
      setOrders(data || []);
    } catch (e) {
      setOrders([]);
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los compradores.');
    } finally {
      setOrdersLoading(false);
    }
  };

  const openAdd = (ev) => {
    const tipos = (ev.tiposEntrada || []).filter((t) => t.activo !== false);
    if (!tipos.length) {
      showAlert('Entradas', 'Este evento no tiene tipos de entrada.');
      return;
    }
    setAddEvent(ev);
    setAddMode('app');
    setBuyerQuery('');
    setBuyerHits([]);
    setPickedUser(null);
    setGuest({ nombre: '', apellido: '', email: '', dni: '' });
    setAddTipoId(String(tipos[0]._id));
    setAddQty(1);
    setAddHolders([{ nombre: '', apellido: '', dni: '' }]);
    setCashQuote(null);
    setCashQuoteError('');
    setCashDone(null);
    setSellNotice('');
  };

  const closeAdd = () => {
    setAddEvent(null);
    setCashDone(null);
    setSellNotice('');
  };

  const seedHolder = (person) => ({
    nombre: person?.nombre || '',
    apellido: person?.apellido || '',
    dni: String(person?.dni || '').replace(/\D/g, ''),
  });

  const resizeAddHolders = (qty, seed) => {
    setAddHolders((prev) => {
      const next = prev.slice(0, qty);
      while (next.length < qty) {
        next.push(next.length === 0 && seed ? seedHolder(seed) : { nombre: '', apellido: '', dni: '' });
      }
      return next;
    });
  };

  useEffect(() => {
    if (!addEvent || addMode !== 'app') return undefined;
    const q = buyerQuery.trim();
    if (q.length < 2) {
      setBuyerHits([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setBuyerSearching(true);
      try {
        const h = await getHeaders();
        const { data } = await clubApi.get('/events/admin/user-search', {
          headers: h,
          params: { q },
        });
        if (!cancelled) setBuyerHits(data || []);
      } catch {
        if (!cancelled) setBuyerHits([]);
      } finally {
        if (!cancelled) setBuyerSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addEvent, addMode, buyerQuery, getHeaders]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const q = doorQuery.trim();
    if (q.length < 2) {
      setDoorHits([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setDoorSearching(true);
      try {
        const h = await getHeaders();
        const { data } = await clubApi.get('/events/admin/user-search', {
          headers: h,
          params: { q },
        });
        if (!cancelled) setDoorHits(data || []);
      } catch {
        if (!cancelled) setDoorHits([]);
      } finally {
        if (!cancelled) setDoorSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [modalOpen, doorQuery, getHeaders]);

  useEffect(() => {
    const seated = (addEvent?.secciones || []).some((section) => String(section.tipoEntrada) === String(addTipoId));
    if (!seated || !addSeats.length) return;
    changeAddQty(addSeats.length);
  }, [addSeats, addTipoId, addEvent]);

  useEffect(() => {
    if (!addEvent || !addTipoId) return undefined;
    if (addMode === 'app' && !pickedUser) {
      setCashQuote(null);
      setCashQuoteError('');
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setCashQuoting(true);
      try {
        const h = await getHeaders();
        const { data } = await clubApi.post(
          `/events/admin/${addEvent._id}/cash-quote`,
          {
            userId: addMode === 'app' ? pickedUser?._id : undefined,
            tipoEntradaId: addTipoId,
            cantidad: addQty,
            asistentes: addHolders.slice(0, addQty).map((h, index) => ({
              nombre: h.nombre || '',
              apellido: h.apellido || '',
              dni: h.dni || '',
              asiento: addSeats[index]
                ? {
                    seccionId: addSeats[index].seccionId,
                    seccionNombre: addSeats[index].seccionNombre,
                    fila: addSeats[index].fila,
                    numero: addSeats[index].numero,
                  }
                : undefined,
            })),
          },
          { headers: h },
        );
        if (!cancelled) {
          setCashQuote(data);
          setCashQuoteError('');
        }
      } catch (e) {
        if (!cancelled) {
          setCashQuote(null);
          setCashQuoteError(e.response?.data?.message || 'No se pudo calcular el precio.');
        }
      } finally {
        if (!cancelled) setCashQuoting(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addEvent, addMode, pickedUser, addTipoId, addQty, addHolders, addSeats, getHeaders]);

  const copyBuyerToFirstTicket = () => {
    const person = addMode === 'app' ? pickedUser : guest;
    setAddHolders((prev) => {
      const next = [...prev];
      next[0] = seedHolder(person);
      return next;
    });
  };

  const pickAppUser = (user) => {
    setPickedUser(user);
    setBuyerQuery('');
    setBuyerHits([]);
    setAddHolders((prev) => {
      const next = [...prev];
      const first = next[0] || { nombre: '', apellido: '', dni: '' };
      if (!first.nombre && !first.apellido && !first.dni) next[0] = seedHolder(user);
      return next;
    });
  };

  const setHolderField = (idx, key, value) => {
    setAddHolders((prev) => {
      const next = [...prev];
      const current = next[idx] || { nombre: '', apellido: '', dni: '' };
      next[idx] = {
        ...current,
        [key]: key === 'dni' ? String(value).replace(/\D/g, '').slice(0, 10) : value,
      };
      return next;
    });
  };

  const changeAddQty = (nextQty) => {
    const qty = Math.max(1, Math.min(20, nextQty));
    setAddQty(qty);
    resizeAddHolders(qty, addMode === 'app' ? pickedUser : guest);
  };

  const submitCashSale = async () => {
    if (!addEvent) return;
    if (addMode === 'app' && !pickedUser) {
      setSellNotice('Elegí un usuario de la app.');
      return;
    }
    if (addMode === 'fuera') {
      if (!guest.nombre.trim() || !guest.apellido.trim() || !guest.email.trim()) {
        setSellNotice('Nombre, apellido y email son obligatorios.');
        return;
      }
    }
    const seated = (addEvent.secciones || []).some((section) => String(section.tipoEntrada) === String(addTipoId));
    if (seated && addSeats.length !== addQty) {
      setSellNotice('Elegí un asiento en el plano.');
      return;
    }
    const asistentes = addHolders.slice(0, addQty).map((h, index) => ({
      nombre: String(h.nombre || '').trim(),
      apellido: String(h.apellido || '').trim(),
      dni: String(h.dni || '').replace(/\D/g, ''),
      asiento: addSeats[index]
        ? {
            seccionId: addSeats[index].seccionId,
            seccionNombre: addSeats[index].seccionNombre,
            fila: addSeats[index].fila,
            numero: addSeats[index].numero,
          }
        : undefined,
    }));
    const seen = new Set();
    for (let i = 0; i < addQty; i += 1) {
      const person = asistentes[i] || { nombre: '', apellido: '', dni: '' };
      if (!person.nombre || !person.apellido || person.dni.length < 6 || person.dni.length > 10) {
        setSellNotice(`Entrada ${i + 1}: completá nombre, apellido y DNI de quien entra.`);
        return;
      }
      if (seen.has(person.dni)) {
        setSellNotice(`El DNI ${person.dni} está repetido. Cada entrada es de una persona.`);
        return;
      }
      seen.add(person.dni);
    }
    setSellNotice('');
    setCashSaving(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post(
        `/events/admin/${addEvent._id}/cash-sale`,
        {
          userId: addMode === 'app' ? pickedUser._id : undefined,
          nombre: guest.nombre.trim(),
          apellido: guest.apellido.trim(),
          email: guest.email.trim(),
          dni: guest.dni.replace(/\D/g, ''),
          tipoEntradaId: addTipoId,
          cantidad: addQty,
          asistentes,
        },
        { headers: h },
      );
      setCashDone(data);
      await load();
      if (ordersEvent?._id) {
        try {
          const { data: nextOrders } = await clubApi.get(`/events/admin/${ordersEvent._id}/orders`, {
            headers: h,
          });
          setOrders(nextOrders || []);
        } catch {
          /* the compradores list refreshes the next time it opens */
        }
      }
    } catch (e) {
      setSellNotice(e.response?.data?.message || 'Revisá los datos e intentá de nuevo.');
    } finally {
      setCashSaving(false);
    }
  };

  const tipoNombreById = useMemo(() => {
    const map = {};
    (ordersEvent?.tiposEntrada || []).forEach((t) => {
      map[String(t._id)] = t.nombre;
    });
    return map;
  }, [ordersEvent]);

  const ordersStats = useMemo(() => {
    let entradasConfirmadas = 0;
    let recaudado = 0;
    let pendientes = 0;
    let compradores = 0;
    for (const o of orders) {
      if (o.estado === 'pagada' || o.estado === 'gratis') {
        entradasConfirmadas += Number(o.cantidad) || 0;
        recaudado += Number(o.montoTotal) || 0;
        compradores += 1;
      } else if (o.estado === 'pendiente_pago') {
        pendientes += 1;
      }
    }
    return { entradasConfirmadas, recaudado, pendientes, compradores, total: orders.length };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = ordersSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (ordersFilter === 'pagada' && o.estado !== 'pagada') return false;
      if (ordersFilter === 'gratis' && o.estado !== 'gratis') return false;
      if (ordersFilter === 'pendiente_pago' && o.estado !== 'pendiente_pago') return false;
      if (
        ordersFilter === 'otros' &&
        !['cancelada', 'expirada'].includes(o.estado)
      ) {
        return false;
      }
      if (!q) return true;
      const blob = [
        o.comprador?.nombre,
        o.comprador?.apellido,
        o.comprador?.email,
        o.comprador?.dni,
        o.reglaAplicada?.nombre,
        tipoNombreById[String(o.tipoEntrada)],
        ORDER_ESTADO_LABEL[o.estado],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [orders, ordersSearch, ordersFilter, tipoNombreById]);

  const updateTipo = (idx, patch) => {
    setForm((f) => {
      const tiposEntrada = [...f.tiposEntrada];
      tiposEntrada[idx] = { ...tiposEntrada[idx], ...patch };
      return { ...f, tiposEntrada };
    });
  };

  const removeTipo = (idx) => {
    setPlacingSection(null);
    setForm((f) => {
      if (f.tiposEntrada.length <= 1) return f;
      return {
        ...f,
        tiposEntrada: f.tiposEntrada.filter((_, i) => i !== idx),
        secciones: (f.secciones || [])
          .filter((section) => section.tipoIndex !== idx)
          .map((section) => ({
            ...section,
            tipoIndex: section.tipoIndex > idx ? section.tipoIndex - 1 : section.tipoIndex,
          })),
      };
    });
  };

  const reglaFromSaved = (discount) => ({
    nombre: discount.nombre || 'Descuento',
    roles: discount.roles || [],
    cuotasSociales: (discount.cuotasSociales || []).map((id) => String(id?._id || id)),
    planes: (discount.planes || []).map((id) => String(id?._id || id)),
    modo: discount.modo || 'porcentaje',
    valor: String(discount.valor ?? 0),
    maxEntradasConDescuento: String(discount.maxEntradasConDescuento || 1),
    activo: discount.activo !== false,
  });

  const applySavedDiscount = (discount) => {
    if (!discount) return;
    const nextIdx = form.reglasDescuento.length;
    setForm((current) => ({
      ...current,
      reglasDescuento: [...current.reglasDescuento, reglaFromSaved(discount)],
    }));
    setExpandedReglaIdx(nextIdx);
  };

  const addPickedDiscounts = () => {
    const chosen = discounts.filter((discount) => discountPickIds.includes(String(discount._id)));
    if (chosen.length) {
      setForm((current) => ({
        ...current,
        reglasDescuento: [...current.reglasDescuento, ...chosen.map(reglaFromSaved)],
      }));
      setExpandedReglaIdx(null);
    }
    setDiscountPickerOpen(false);
    setDiscountPickIds([]);
  };

  const saveRuleTemplate = async (rule) => {
    const nombre = String(rule?.nombre || '').trim();
    if (!nombre) {
      showAlert('Descuento', 'Poné un nombre para poder reutilizarlo.');
      return;
    }
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.post(
        '/events/admin/discounts',
        {
          nombre,
          roles: rule.roles || [],
          cuotasSociales: rule.cuotasSociales || [],
          planes: rule.planes || [],
          modo: rule.modo,
          valor: Number(rule.valor) || 0,
          maxEntradasConDescuento: Math.max(1, parseInt(rule.maxEntradasConDescuento, 10) || 1),
        },
        { headers },
      );
      setDiscounts((prev) => [...prev.filter((item) => String(item._id) !== String(data?._id)), data]);
      showAlert('Listo', 'El descuento quedó guardado para usarlo en otros eventos.');
    } catch (e) {
      showAlert('Descuento', e.response?.data?.message || 'No se pudo guardar el descuento.');
    }
  };

  const updateRegla = (idx, patch) => {
    setForm((f) => {
      const reglasDescuento = [...f.reglasDescuento];
      reglasDescuento[idx] = { ...reglasDescuento[idx], ...patch };
      return { ...f, reglasDescuento };
    });
  };

  const toggleInArray = (arr, id) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  const updateSeccion = (idx, patch) => {
    setForm((current) => {
      const secciones = [...(current.secciones || [])];
      secciones[idx] = { ...secciones[idx], ...patch };
      return { ...current, secciones };
    });
  };

  const toggleTipoSeccion = (idx) => {
    setPlacingSection(null);
    setForm((current) => {
      const existing = (current.secciones || []).some((section) => section.tipoIndex === idx);
      if (existing) {
        return {
          ...current,
          secciones: (current.secciones || []).filter((section) => section.tipoIndex !== idx),
        };
      }
      return {
        ...current,
        secciones: [
          ...(current.secciones || []),
          {
            nombre: current.tiposEntrada[idx]?.nombre || '',
            filas: '5',
            asientosPorFila: '10',
            tipoIndex: idx,
            precio: current.tiposEntrada[idx]?.precio || '0',
            x: 50,
            y: 40,
            w: 0,
            h: 0,
          },
        ],
      };
    });
  };

  const nudgeSeccion = (idx, dx, dy, dw, dh) => {
    setForm((current) => {
      const secciones = [...(current.secciones || [])];
      const section = secciones[idx];
      if (!section) return current;
      const w = Math.max(8, Math.min(80, (Number(section.w) || 24) + dw));
      const h = Math.max(8, Math.min(80, (Number(section.h) || 16) + dh));
      secciones[idx] = {
        ...section,
        w,
        h,
        x: Math.max(0, Math.min(100 - w, (Number(section.x) || 0) + dx)),
        y: Math.max(0, Math.min(100 - h, (Number(section.y) || 0) + dy)),
      };
      return { ...current, secciones };
    });
  };

  const beginPlacing = (idx) => {
    const section = form.secciones?.[idx];
    if (!section) return;
    const w = Number(section.w) > 0 ? Number(section.w) : 24;
    const h = Number(section.h) > 0 ? Number(section.h) : 16;
    const hadArea = Number(section.w) > 0 && Number(section.h) > 0;
    updateSeccion(idx, {
      w,
      h,
      x: Math.max(0, Math.min(100 - w, hadArea ? Number(section.x) || 0 : (Number(section.x) || 50) - w / 2)),
      y: Math.max(0, Math.min(100 - h, hadArea ? Number(section.y) || 0 : (Number(section.y) || 40) - h / 2)),
    });
    setPlacingSection(idx);
  };

  const renderStadiumMap = () => (
    <View>
      <Field
        label="Plano del estadio"
        theme={theme}
        hint={
          Platform.OS === 'web'
            ? 'Arrastrá el área para moverla y una esquina para cambiar el tamaño.'
            : 'Hay un solo plano. Tocá para mover el área y ajustala con los botones.'
        }
      >
        {form.mapaEstadioUrl ? (
          <StadiumAreaStage
            uri={form.mapaEstadioUrl}
            sections={form.secciones || []}
            activeIndex={placingSection}
            color={colorMarca}
            onChange={(idx, box) => updateSeccion(idx, box)}
            onPressPoint={(px, py) => {
              const section = form.secciones?.[placingSection];
              if (!section) return;
              const w = Number(section.w) > 0 ? Number(section.w) : 24;
              const h = Number(section.h) > 0 ? Number(section.h) : 16;
              updateSeccion(placingSection, {
                w,
                h,
                x: Math.max(0, Math.min(100 - w, px - w / 2)),
                y: Math.max(0, Math.min(100 - h, py - h / 2)),
              });
            }}
            style={[styles.mapStage, { backgroundColor: theme.surface, borderColor: theme.border }]}
          />
        ) : (
          <TouchableOpacity
            style={[styles.imagePicker, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => uploadEventImage('estadio')}
            disabled={uploadingImage}
          >
            <View style={styles.imagePlaceholder}>
              {uploadingImage ? (
                <ClubSpinLoader size={40} />
              ) : (
                <>
                  <Ionicons name="map-outline" size={32} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, marginTop: 8, fontWeight: '600' }}>Subir plano</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}
        {form.mapaEstadioUrl ? (
          <View style={styles.imageActions}>
            <TouchableOpacity onPress={() => uploadEventImage('estadio')} disabled={uploadingImage}>
              <Text style={{ color: colorMarca, fontWeight: '700' }}>
                {uploadingImage ? 'Subiendo…' : 'Cambiar'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setForm((current) => ({ ...current, mapaEstadioUrl: '' }))}>
              <Text style={{ color: '#ef4444', fontWeight: '600' }}>Quitar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Field>
      {placingSection != null && form.mapaEstadioUrl ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: colorMarca, fontWeight: '700', marginBottom: 8 }}>
            Área de {form.secciones[placingSection]?.nombre || 'el sector'}
          </Text>
          <View style={styles.mapControls}>
            {Platform.OS === 'web'
              ? null
              : [
                  ['←', -4, 0, 0, 0],
                  ['↑', 0, -4, 0, 0],
                  ['↓', 0, 4, 0, 0],
                  ['→', 4, 0, 0, 0],
                  ['Ancho −', 0, 0, -4, 0],
                  ['Ancho +', 0, 0, 4, 0],
                  ['Alto −', 0, 0, 0, -4],
                  ['Alto +', 0, 0, 0, 4],
                ].map(([label, dx, dy, dw, dh]) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => nudgeSeccion(placingSection, dx, dy, dw, dh)}
                    style={[styles.mapControl, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '800' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
            <TouchableOpacity
              onPress={() => setPlacingSection(null)}
              style={[styles.mapControl, { borderColor: colorMarca, backgroundColor: colorMarca }]}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Listo</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderStepDatos = () => (
    <View>
      <Text style={[styles.stepIntro, { color: theme.textMuted }]}>
        Información básica del evento
      </Text>

      <Field
        label="Imagen"
        theme={theme}
        hint="Opcional · recortá al encuadre de la tarjeta (16:9)"
      >
        <TouchableOpacity
          style={[styles.imagePicker, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={uploadEventImage}
          disabled={uploadingImage}
        >
          {form.imagenUrl ? (
            <Image source={{ uri: form.imagenUrl }} style={styles.imagePreview} />
          ) : (
            <View style={styles.imagePlaceholder}>
              {uploadingImage ? (
                <ClubSpinLoader size={40} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={32} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, marginTop: 8, fontWeight: '600' }}>
                    Subir imagen
                  </Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>
        {form.imagenUrl ? (
          <View style={styles.imageActions}>
            <TouchableOpacity onPress={uploadEventImage} disabled={uploadingImage}>
              <Text style={{ color: colorMarca, fontWeight: '700' }}>
                {uploadingImage ? 'Subiendo…' : 'Cambiar'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setForm((f) => ({ ...f, imagenUrl: '' }))}>
              <Text style={{ color: '#ef4444', fontWeight: '600' }}>Quitar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Field>

      <Field label="Título" theme={theme}>
        <TextInput
          style={inputStyle}
          value={form.titulo}
          onChangeText={(titulo) => setForm((f) => ({ ...f, titulo }))}
          placeholder="Nombre del evento"
          placeholderTextColor={theme.textMuted}
        />
      </Field>
      <Field label="Lugar" theme={theme}>
        <TextInput
          style={inputStyle}
          value={form.lugar}
          onChangeText={(lugar) => setForm((f) => ({ ...f, lugar }))}
          placeholder="Predio / salón"
          placeholderTextColor={theme.textMuted}
        />
      </Field>
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Field label="Fecha" theme={theme} hint="dd/mm/aaaa">
            <TextInput
              style={inputStyle}
              value={form.fechaInicioDisplay}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, fechaInicioDisplay: maskDateDDMMAAAA(v) }))
              }
              keyboardType="number-pad"
              placeholder="dd/mm/aaaa"
              placeholderTextColor={theme.textMuted}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Hora" theme={theme} hint="HH:MM">
            <TextInput
              style={inputStyle}
              value={form.horaInicio}
              onChangeText={(v) => setForm((f) => ({ ...f, horaInicio: maskTimeHHMM(v) }))}
              keyboardType="number-pad"
              placeholder="18:00"
              placeholderTextColor={theme.textMuted}
              maxLength={5}
            />
          </Field>
        </View>
      </View>
      <Field label="Descripción" theme={theme}>
        <TextInput
          style={[...inputStyle, styles.textarea]}
          value={form.descripcion}
          onChangeText={(descripcion) => setForm((f) => ({ ...f, descripcion }))}
          multiline
          placeholder="Detalles para socios y visitantes"
          placeholderTextColor={theme.textMuted}
        />
      </Field>

      <Field
        label="Control de ingreso del evento"
        theme={theme}
        hint="Estas personas ven el escáner de este evento en su app. El ingreso de socios sigue aparte."
      >
        {(form.controlIngreso || []).length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {form.controlIngreso.map((person) => (
              <View
                key={person._id}
                style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center' }]}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>
                  {[person.nombre, person.apellido].filter(Boolean).join(' ') || 'Usuario'}
                  {person.rol ? ` · ${USER_ROL_LABELS[person.rol] || person.rol}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setForm((f) => ({
                      ...f,
                      controlIngreso: (f.controlIngreso || []).filter((u) => u._id !== person._id),
                    }))
                  }
                  hitSlop={8}
                  style={{ marginLeft: 6 }}
                >
                  <Ionicons name="close" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <TextInput
          style={inputStyle}
          value={doorQuery}
          onChangeText={setDoorQuery}
          placeholder="Buscar por nombre o DNI"
          placeholderTextColor={theme.textMuted}
        />
        {doorSearching ? <ClubSpinLoader size={40} style={{ marginTop: 8 }} /> : null}
        {doorHits
          .filter((u) => !(form.controlIngreso || []).some((p) => p._id === String(u._id)))
          .map((u) => (
            <TouchableOpacity
              key={u._id}
              onPress={() => {
                setForm((f) => ({
                  ...f,
                  controlIngreso: [
                    ...(f.controlIngreso || []),
                    {
                      _id: String(u._id),
                      nombre: u.nombre || '',
                      apellido: u.apellido || '',
                      rol: u.rol || '',
                    },
                  ],
                }));
                setDoorQuery('');
                setDoorHits([]);
              }}
              style={{
                paddingVertical: 10,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {[u.nombre, u.apellido].filter(Boolean).join(' ')}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                {USER_ROL_LABELS[u.rol] || u.rol || 'Usuario'}
              </Text>
            </TouchableOpacity>
          ))}
      </Field>
    </View>
  );

  const renderStepEntradas = () => (
    <View>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Tipos de entrada</Text>
          <Text style={[styles.stepIntro, { color: theme.textMuted, marginBottom: 0 }]}>
            Cada tipo puede tener un sector. Si lo tiene, el comprador elige el asiento.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addPill, { borderColor: colorMarca }]}
          onPress={() => {
            const nextIdx = form.tiposEntrada.length;
            setForm((f) => ({ ...f, tiposEntrada: [...f.tiposEntrada, emptyTipo()] }));
            setExpandedTipoIdx(nextIdx);
          }}
        >
          <Ionicons name="add" size={18} color={colorMarca} />
          <Text style={{ color: colorMarca, fontWeight: '700', marginLeft: 4 }}>Agregar</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.label, { color: theme.textMuted, marginTop: 4 }]}>Estadio</Text>
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
        Reutilizá uno guardado o creá uno nuevo. Si hay un solo tipo de entrada, todos los sectores usan ese tipo. Cada sector tiene su propio precio.
      </Text>
      <View style={styles.reglaActions}>
        <TouchableOpacity
          onPress={() => {
            setStadiumPickId(form.estadioId ? String(form.estadioId) : '');
            setStadiumPickerOpen(true);
          }}
          style={[styles.addPill, { borderColor: colorMarca, flex: 1, minWidth: 0 }]}
        >
          <Ionicons name="business-outline" size={16} color={colorMarca} />
          <Text style={{ color: colorMarca, fontWeight: '800', marginLeft: 6, flexShrink: 1 }} numberOfLines={1}>
            {form.estadioId
              ? stadiums.find((stadium) => String(stadium._id) === String(form.estadioId))?.nombre || 'Estadios guardados'
              : 'Estadios guardados'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setStadiumMode('create');
            setStadiumOpen(true);
          }}
          style={[styles.addPill, { borderColor: colorMarca }]}
        >
          <Ionicons name="add" size={16} color={colorMarca} />
          <Text style={{ color: colorMarca, fontWeight: '800', marginLeft: 4 }}>Nuevo</Text>
        </TouchableOpacity>
      </View>
      {form.tiposEntrada.map((t, idx) => {
        const open = expandedTipoIdx === idx;
        const sections = (form.secciones || [])
          .map((section, secIdx) => ({ section, secIdx }))
          .filter((item) => item.section.tipoIndex === idx);
        const hasSection = sections.length > 0;
        const seatCount = sections.reduce(
          (sum, item) =>
            sum + (parseInt(item.section.filas, 10) || 0) * (parseInt(item.section.asientosPorFila, 10) || 0),
          0,
        );
        return (
          <View
            key={t._id || `t-${idx}`}
            style={[styles.subCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <TouchableOpacity
              style={styles.foldHeader}
              onPress={() => setExpandedTipoIdx(open ? null : idx)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.subCardTitle, { color: theme.text }]} numberOfLines={1}>
                  {t.nombre?.trim() || `Tipo ${idx + 1}`}
                </Text>
                {!open ? (
                  <Text style={[styles.foldSummary, { color: theme.textMuted }]}>
                    {hasSection
                      ? `${sections
                          .map((item) => `$${item.section.precio || 0}`)
                          .filter((price, priceIdx, list) => list.indexOf(price) === priceIdx)
                          .join(' / ')} · ${sections.length} sector${sections.length === 1 ? '' : 'es'} · ${seatCount} asientos`
                      : `$${t.precio || 0} · cupo ${t.cupo || 0}`}
                    {t.vendidas != null ? ` · ${t.vendidas} vendidas` : ''}
                  </Text>
                ) : null}
              </View>
              <FoldableChevron open={open} color={theme.textMuted} size={20} />
            </TouchableOpacity>
            {form.tiposEntrada.length > 1 ? (
              <View style={styles.reglaActions}>
                <TouchableOpacity
                  onPress={() => {
                    removeTipo(idx);
                    setExpandedTipoIdx((cur) => {
                      if (cur == null) return null;
                      if (cur === idx) return Math.max(0, idx - 1);
                      if (cur > idx) return cur - 1;
                      return cur;
                    });
                  }}
                  style={[styles.reglaAction, { borderColor: '#ef4444' }]}
                >
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Quitar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <Foldable open={open}>
              <View style={styles.foldBody}>
                <Field label="Nombre" theme={theme}>
                  <TextInput
                    style={inputStyle}
                    value={t.nombre}
                    onChangeText={(nombre) => updateTipo(idx, { nombre })}
                    placeholder="General, VIP…"
                    placeholderTextColor={theme.textMuted}
                  />
                </Field>
                {hasSection ? (
                  <Text style={[styles.fieldHint, { color: theme.textMuted, marginBottom: 10 }]}>
                    El precio se define en cada sector.
                  </Text>
                ) : (
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Field label="Precio ($)" theme={theme}>
                      <TextInput
                        style={inputStyle}
                        value={t.precio}
                        onChangeText={(precio) => updateTipo(idx, { precio })}
                        keyboardType="decimal-pad"
                      />
                    </Field>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Cupo" theme={theme}>
                      <TextInput
                        style={inputStyle}
                        value={t.cupo}
                        onChangeText={(cupo) => updateTipo(idx, { cupo })}
                        keyboardType="number-pad"
                      />
                    </Field>
                  </View>
                </View>
                )}
                <TouchableOpacity
                  onPress={() => toggleTipoSeccion(idx)}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}
                >
                  <Ionicons
                    name={hasSection ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={hasSection ? colorMarca : theme.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Tiene sector</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      El comprador elige el asiento en el plano.
                    </Text>
                  </View>
                </TouchableOpacity>
                {hasSection ? (
                  <View>
                    {sections.map(({ section, secIdx }) => (
                      <View key={`sec-${secIdx}`}>
                        <View style={styles.row}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Field label="Sector" theme={theme}>
                              <TextInput
                                style={inputStyle}
                                value={section.nombre}
                                onChangeText={(nombre) => updateSeccion(secIdx, { nombre })}
                                placeholder="Nombre del sector"
                                placeholderTextColor={theme.textMuted}
                              />
                            </Field>
                          </View>
                          <View style={{ width: 110 }}>
                            <Field label="Precio ($)" theme={theme}>
                              <TextInput
                                style={inputStyle}
                                value={String(section.precio ?? '')}
                                onChangeText={(precio) => updateSeccion(secIdx, { precio })}
                                keyboardType="decimal-pad"
                              />
                            </Field>
                          </View>
                        </View>
                        <View style={styles.row}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Field label="Filas" theme={theme}>
                              <TextInput
                                style={inputStyle}
                                value={String(section.filas)}
                                onChangeText={(filas) => updateSeccion(secIdx, { filas: filas.replace(/\D/g, '') })}
                                keyboardType="number-pad"
                              />
                            </Field>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Field label="Asientos por fila" theme={theme}>
                              <TextInput
                                style={inputStyle}
                                value={String(section.asientosPorFila)}
                                onChangeText={(asientosPorFila) =>
                                  updateSeccion(secIdx, { asientosPorFila: asientosPorFila.replace(/\D/g, '') })
                                }
                                keyboardType="number-pad"
                              />
                            </Field>
                          </View>
                        </View>
                        <View style={styles.imageActions}>
                          <TouchableOpacity
                            onPress={() => beginPlacing(secIdx)}
                            disabled={!form.mapaEstadioUrl}
                          >
                            <Text style={{ color: form.mapaEstadioUrl ? colorMarca : theme.textMuted, fontWeight: '700' }}>
                              {placingSection === secIdx ? 'Marcando el área…' : 'Ubicar en el plano'}
                            </Text>
                          </TouchableOpacity>
                          {sections.length > 1 ? (
                            <TouchableOpacity
                              onPress={() => {
                                setPlacingSection(null);
                                setForm((current) => ({
                                  ...current,
                                  secciones: current.secciones.filter((_, index) => index !== secIdx),
                                }));
                              }}
                            >
                              <Text style={{ color: '#ef4444', fontWeight: '600' }}>Quitar sector</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ))}
                    {renderStadiumMap()}
                  </View>
                ) : null}
                {t.vendidas != null ? (
                  <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                    Vendidas / en hold: {t.vendidas}
                  </Text>
                ) : null}
              </View>
            </Foldable>
          </View>
        );
      })}
    </View>
  );

  const reglaSummary = (r) => {
    const modoLabel =
      r.modo === 'gratis'
        ? 'Gratis'
        : r.modo === 'precio_fijo'
          ? `$${r.valor || 0}`
          : `${r.valor || 0}%`;
    const roles = (r.roles || []).length ? (r.roles || []).join(', ') : 'cualquier rol';
    return `${modoLabel} · máx ${r.maxEntradasConDescuento || 1} · ${roles}`;
  };

  const renderStepDescuentos = () => (
    <View>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Reglas de descuento</Text>
          <Text style={[styles.stepIntro, { color: theme.textMuted, marginBottom: 0 }]}>
            Tocá una regla para editarla. Orden = prioridad. Con deuda no aplica descuento.
          </Text>
        </View>
      </View>
      <View style={styles.reglaActions}>
        <TouchableOpacity
          onPress={() => {
            setDiscountPickIds([]);
            setDiscountPickerOpen(true);
          }}
          style={[styles.addPill, { borderColor: colorMarca }]}
        >
          <Ionicons name="pricetag-outline" size={16} color={colorMarca} />
          <Text style={{ color: colorMarca, fontWeight: '800', marginLeft: 6 }}>Descuentos guardados</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setDiscountOpen(true)}
          style={[styles.addPill, { borderColor: colorMarca }]}
        >
          <Ionicons name="add" size={16} color={colorMarca} />
          <Text style={{ color: colorMarca, fontWeight: '800', marginLeft: 4 }}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {form.reglasDescuento.length === 0 ? (
        <View
          style={[styles.emptyRules, { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          <Ionicons name="pricetag-outline" size={28} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted, marginTop: 8, textAlign: 'center' }}>
            Sin reglas: todos pagan precio de lista. Elegí descuentos guardados para este evento.
          </Text>
        </View>
      ) : null}

      {form.reglasDescuento.map((r, idx) => {
        const open = expandedReglaIdx === idx;
        return (
          <View
            key={r._id || `r-${idx}`}
            style={[styles.subCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <TouchableOpacity
              style={styles.foldHeader}
              onPress={() => setExpandedReglaIdx(open ? null : idx)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.subCardTitle, { color: theme.text }]} numberOfLines={1}>
                  {r.nombre?.trim() || `Regla ${idx + 1}`}
                </Text>
                {!open ? (
                  <Text style={[styles.foldSummary, { color: theme.textMuted }]} numberOfLines={2}>
                    {reglaSummary(r)}
                  </Text>
                ) : null}
              </View>
              <FoldableChevron open={open} color={theme.textMuted} size={20} />
            </TouchableOpacity>
            <View style={styles.reglaActions}>
              <TouchableOpacity
                onPress={() => saveRuleTemplate(r)}
                style={[styles.reglaAction, { borderColor: colorMarca, flex: 1 }]}
              >
                <Text style={{ color: colorMarca, fontWeight: '700' }} numberOfLines={1}>
                  Guardar para reusar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setForm((f) => ({
                    ...f,
                    reglasDescuento: f.reglasDescuento.filter((_, i) => i !== idx),
                  }));
                  setExpandedReglaIdx((cur) => {
                    if (cur == null) return null;
                    if (cur === idx) return null;
                    if (cur > idx) return cur - 1;
                    return cur;
                  });
                }}
                style={[styles.reglaAction, { borderColor: '#ef4444' }]}
              >
                <Text style={{ color: '#ef4444', fontWeight: '700' }}>Quitar</Text>
              </TouchableOpacity>
            </View>

            <Foldable open={open}>
              <View style={styles.foldBody}>
                <Field label="Nombre" theme={theme}>
                  <TextInput
                    style={inputStyle}
                    value={r.nombre}
                    onChangeText={(nombre) => updateRegla(idx, { nombre })}
                    placeholder="Ej. Socio cuota plena"
                    placeholderTextColor={theme.textMuted}
                  />
                </Field>

                <Text style={[styles.ruleSection, { color: theme.text }]}>Quién</Text>
                <Text style={[styles.label, { color: theme.textMuted, marginTop: 0 }]}>Roles</Text>
                <View style={styles.chips}>
                  {ROLES.map((role) => (
                    <Chip
                      key={role.id}
                      label={role.label}
                      on={(r.roles || []).includes(role.id)}
                      colorMarca={colorMarca}
                      theme={theme}
                      onPress={() =>
                        updateRegla(idx, { roles: toggleInArray(r.roles || [], role.id) })
                      }
                    />
                  ))}
                </View>

                {(pickers.cuotasSociales || []).length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Cuotas sociales</Text>
                    <View style={styles.chips}>
                      {(pickers.cuotasSociales || []).map((c) => {
                        const id = String(c._id);
                        return (
                          <Chip
                            key={id}
                            label={c.nombre}
                            on={(r.cuotasSociales || []).includes(id)}
                            colorMarca={colorMarca}
                            theme={theme}
                            onPress={() =>
                              updateRegla(idx, {
                                cuotasSociales: toggleInArray(r.cuotasSociales || [], id),
                              })
                            }
                          />
                        );
                      })}
                    </View>
                  </>
                ) : null}

                {(pickers.planes || []).length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Planes</Text>
                    <View style={styles.chips}>
                      {(pickers.planes || []).map((p) => {
                        const id = String(p._id);
                        return (
                          <Chip
                            key={id}
                            label={p.nombre}
                            on={(r.planes || []).includes(id)}
                            colorMarca={colorMarca}
                            theme={theme}
                            onPress={() =>
                              updateRegla(idx, { planes: toggleInArray(r.planes || [], id) })
                            }
                          />
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <Text style={[styles.ruleSection, { color: theme.text }]}>Cómo</Text>
                <View style={styles.chips}>
                  {MODO_OPTIONS.map((m) => (
                    <Chip
                      key={m.id}
                      label={m.label}
                      on={r.modo === m.id}
                      colorMarca={colorMarca}
                      theme={theme}
                      onPress={() => updateRegla(idx, { modo: m.id })}
                    />
                  ))}
                </View>
                {r.modo !== 'gratis' ? (
                  <Field
                    label={r.modo === 'porcentaje' ? 'Porcentaje' : 'Precio fijo ($)'}
                    theme={theme}
                  >
                    <TextInput
                      style={inputStyle}
                      value={r.valor}
                      onChangeText={(valor) => updateRegla(idx, { valor })}
                      keyboardType="decimal-pad"
                    />
                  </Field>
                ) : null}

                <Text style={[styles.ruleSection, { color: theme.text }]}>Límite</Text>
                <Field
                  label="Máx. entradas con descuento"
                  theme={theme}
                  hint="El resto se cobra a precio de lista"
                >
                  <TextInput
                    style={inputStyle}
                    value={r.maxEntradasConDescuento}
                    onChangeText={(maxEntradasConDescuento) =>
                      updateRegla(idx, { maxEntradasConDescuento })
                    }
                    keyboardType="number-pad"
                  />
                </Field>
              </View>
            </Foldable>
          </View>
        );
      })}
    </View>
  );

  const visibleEvents = useMemo(() => {
    const source = canManageEvents ? events : events.filter((ev) => ev.estado !== 'borrador');
    return source
      .filter((ev) => eventDayStillOpen(ev.fechaInicio))
      .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio));
  }, [events, canManageEvents]);

  const renderEvent = ({ item }) => {
    const disp = toDisplayDate(item.fechaInicio);
    const time = toDisplayTime(item.fechaInicio);
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardTop}>
          {item.imagenUrl ? (
            <Image source={{ uri: item.imagenUrl }} style={styles.listThumb} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{item.titulo}</Text>
            <Text style={{ color: theme.textMuted, marginTop: 4 }}>
              {disp}
              {time ? ` · ${time}` : ''}
              {item.lugar ? ` · ${item.lugar}` : ''}
            </Text>
            <Text style={[styles.badge, { color: colorMarca }]}>
              {ESTADOS_LABEL[item.estado] || item.estado}
            </Text>
          </View>
        </View>
        <View style={[styles.actions, { borderTopColor: theme.border }]}>
          {canSellEvent(item) ? (
            <TouchableOpacity
              onPress={() => openAdd(item)}
              style={[styles.actionBtn, { borderColor: colorMarca, backgroundColor: colorMarca }]}
            >
              <Ionicons name="cash-outline" size={15} color="#fff" />
              <Text style={[styles.actionTxt, { color: '#fff' }]}>Vender</Text>
            </TouchableOpacity>
          ) : null}
          {canManageEvents && (
            <TouchableOpacity
              onPress={() => openEdit(item)}
              style={[styles.actionBtn, { borderColor: theme.text, backgroundColor: isDarkMode ? 'transparent' : '#ffffff' }]}
            >
              <Ionicons name="create-outline" size={15} color={theme.text} />
              <Text style={[styles.actionTxt, { color: theme.text }]}>Editar</Text>
            </TouchableOpacity>
          )}
          {canManageEvents && item.estado === 'borrador' && (
            <TouchableOpacity
              onPress={() => publish(item)}
              style={[styles.actionBtn, { borderColor: theme.text, backgroundColor: isDarkMode ? 'transparent' : '#ffffff' }]}
            >
              <Ionicons name="rocket-outline" size={15} color={theme.text} />
              <Text style={[styles.actionTxt, { color: theme.text }]}>Publicar</Text>
            </TouchableOpacity>
          )}
          {canManageEvents ? (
            <TouchableOpacity
              onPress={() => shareLink(item)}
              style={[styles.actionBtn, { borderColor: theme.text, backgroundColor: isDarkMode ? 'transparent' : '#ffffff' }]}
            >
              <Ionicons name="link-outline" size={15} color={theme.text} />
              <Text style={[styles.actionTxt, { color: theme.text }]}>Link</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => openOrders(item)}
            style={[styles.actionBtn, { borderColor: theme.text, backgroundColor: isDarkMode ? 'transparent' : '#ffffff' }]}
          >
            <Ionicons name="people-outline" size={15} color={theme.text} />
            <Text style={[styles.actionTxt, { color: theme.text }]}>Compradores</Text>
          </TouchableOpacity>
          {canManageEvents && item.estado === 'publicado' && (
            <TouchableOpacity
              onPress={() => cancelEv(item)}
              style={[styles.actionBtn, { borderColor: '#ef4444', backgroundColor: '#ef4444' }]}
            >
              <Ionicons name="close-circle-outline" size={15} color="#fff" />
              <Text style={[styles.actionTxt, { color: '#fff' }]}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const isLastStep = formStep >= FORM_STEPS.length - 1;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        title="Eventos"
        subtitle={
          canManageEvents
            ? undefined
            : canSellTickets
              ? 'Vendé entradas y revisá quién compró'
              : 'Quién compró entradas'
        }
        onBack={() => navigation.goBack()}
        rightAccessory={
          canManageEvents ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setDiscountOpen(true)}
                style={styles.headerDiscountBtn}
                accessibilityRole="button"
                accessibilityLabel="Descuentos"
              >
                <MaterialCommunityIcons name="percent-outline" size={20} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStadiumMode('manage');
                  setStadiumOpen(true);
                }}
                style={styles.headerStadiumBtn}
                accessibilityRole="button"
                accessibilityLabel="Estadios"
              >
                <Ionicons name="business-outline" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
      {canManageEvents ? (
        <TouchableOpacity
          style={[styles.linkBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => shareLink(null)}
        >
          <Ionicons name="globe-outline" size={18} color={colorMarca} />
          <Text style={{ color: theme.textMuted, marginLeft: 8, flex: 1 }} numberOfLines={1}>
            {publicListUrl()}
          </Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={visibleEvents}
            keyExtractor={(item) => String(item._id)}
            renderItem={renderEvent}
            contentContainerStyle={{ padding: 16, paddingBottom: canManageEvents ? 100 : 40, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
            ListEmptyComponent={
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
                {events.length
                  ? 'No hay eventos próximos.'
                  : canManageEvents
                    ? 'Todavía no hay eventos. Creá el primero.'
                    : 'No hay eventos publicados.'}
              </Text>
            }
          />
        </View>
      )}

      {canManageEvents ? (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colorMarca }]} onPress={openCreate}>
          <Ionicons name="add" size={30} color="#ffffff" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeFormModal}>
        <View style={{ flex: 1, height: windowHeight }}>
        <KeyboardAvoidingView
          style={[styles.ordersOverlay, { height: windowHeight }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.ordersBackdrop} onPress={closeFormModal} accessibilityLabel="Cerrar" />
          <SafeAreaView
            edges={['bottom']}
            style={[styles.ordersSheet, { backgroundColor: theme.background }]}
          >
          <View style={[styles.ordersHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={closeFormModal}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={[
                styles.ordersBack,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9' },
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.ordersTitle, { color: theme.text }]} numberOfLines={1}>
                {editing ? 'Editar evento' : 'Nuevo evento'}
              </Text>
            </View>
          </View>

          <View style={[styles.stepper, { borderBottomColor: theme.border }]}>
            {FORM_STEPS.map((step, idx) => {
              const active = idx === formStep;
              const done = idx < formStep;
              return (
                <TouchableOpacity
                  key={step.key}
                  style={styles.stepTab}
                  onPress={() => {
                    if (idx > formStep) {
                      for (let s = formStep; s < idx; s += 1) {
                        if (!validateStep(s)) return;
                      }
                    }
                    setFormStep(idx);
                  }}
                >
                  <Text
                    style={[
                      styles.stepTabLabel,
                      {
                        color: active || done ? colorMarca : theme.textMuted,
                        fontWeight: active ? '800' : '600',
                      },
                    ]}
                  >
                    {step.label}
                  </Text>
                  <View
                    style={[
                      styles.stepUnderline,
                      {
                        backgroundColor: active ? colorMarca : done ? `${colorMarca}66` : 'transparent',
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            style={{ maxHeight: formListMax }}
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
              {formStep === 0 ? renderStepDatos() : null}
              {formStep === 1 ? renderStepEntradas() : null}
              {formStep === 2 ? renderStepDescuentos() : null}
            </ScrollView>

            <View
              style={[
                styles.footerBar,
                { borderTopColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              {formStep > 0 ? (
                <TouchableOpacity
                  style={[styles.footerSecondary, { borderColor: theme.border }]}
                  onPress={goBack}
                >
                  <Text style={{ color: theme.text, fontWeight: '700' }}>Atrás</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <TouchableOpacity
                style={[
                  styles.footerPrimary,
                  { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 },
                ]}
                onPress={isLastStep ? save : goNext}
                disabled={saving}
              >
                {saving && isLastStep ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.footerPrimaryText}>
                    {isLastStep ? 'Guardar' : 'Siguiente'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
          {discountPickerOpen ? (
            <View style={[StyleSheet.absoluteFill, styles.discountAlertOverlay]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setDiscountPickerOpen(false)} />
              <View style={[styles.discountAlertCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.discountAlertTitle, { color: theme.text }]}>Descuentos guardados</Text>
                <Text style={[styles.discountAlertMessage, { color: theme.textMuted }]}>
                  {discounts.length
                    ? 'Elegí los que querés sumar a este evento.'
                    : 'Todavía no hay descuentos. Creálos con Nuevo.'}
                </Text>
                <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                  {discounts.map((discount) => {
                    const id = String(discount._id);
                    const on = discountPickIds.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() =>
                          setDiscountPickIds((current) =>
                            current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                          )
                        }
                        style={[styles.discountAlertRow, { borderColor: theme.border }]}
                      >
                        <Ionicons
                          name={on ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={on ? colorMarca : theme.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: '800' }}>{discount.nombre}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {discount.modo === 'gratis'
                              ? 'Gratis'
                              : discount.modo === 'precio_fijo'
                                ? `$${discount.valor || 0}`
                                : `${discount.valor || 0}%`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={styles.discountAlertActions}>
                  <TouchableOpacity
                    onPress={() => setDiscountPickerOpen(false)}
                    style={[styles.discountAlertBtn, { borderColor: theme.border, borderWidth: 1 }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Cancelar</Text>
                  </TouchableOpacity>
                  {discounts.length ? (
                    <TouchableOpacity
                      onPress={addPickedDiscounts}
                      disabled={!discountPickIds.length}
                      style={[
                        styles.discountAlertBtn,
                        { backgroundColor: colorMarca, opacity: discountPickIds.length ? 1 : 0.45 },
                      ]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Agregar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
          {stadiumPickerOpen ? (
            <View style={[StyleSheet.absoluteFill, styles.discountAlertOverlay]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setStadiumPickerOpen(false)} />
              <View style={[styles.discountAlertCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.discountAlertTitle, { color: theme.text }]}>Estadios guardados</Text>
                <Text style={[styles.discountAlertMessage, { color: theme.textMuted }]}>
                  {stadiums.length
                    ? 'Elegí el estadio de este evento.'
                    : 'Todavía no hay estadios. Creá uno con Nuevo.'}
                </Text>
                <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                  {stadiums.map((stadium) => {
                    const id = String(stadium._id);
                    const on = stadiumPickId === id;
                    const sectorCount = (stadium.secciones || []).length;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => setStadiumPickId(id)}
                        style={[styles.discountAlertRow, { borderColor: theme.border }]}
                      >
                        <Ionicons
                          name={on ? 'radio-button-on' : 'radio-button-off'}
                          size={22}
                          color={on ? colorMarca : theme.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: '800' }}>{stadium.nombre}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {sectorCount} sector{sectorCount === 1 ? '' : 'es'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={styles.discountAlertActions}>
                  <TouchableOpacity
                    onPress={() => setStadiumPickerOpen(false)}
                    style={[styles.discountAlertBtn, { borderColor: theme.border, borderWidth: 1 }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700' }}>Cancelar</Text>
                  </TouchableOpacity>
                  {stadiums.length ? (
                    <TouchableOpacity
                      onPress={() => {
                        const stadium = stadiums.find((item) => String(item._id) === stadiumPickId);
                        if (stadium) applyStadium(stadium);
                        setStadiumPickerOpen(false);
                      }}
                      disabled={!stadiumPickId}
                      style={[
                        styles.discountAlertBtn,
                        { backgroundColor: colorMarca, opacity: stadiumPickId ? 1 : 0.45 },
                      ]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Usar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
          <DiscountLibrary
            embedded
            mode="create"
            visible={discountOpen}
            onClose={() => setDiscountOpen(false)}
            onCreated={(discount) => {
              setDiscounts((prev) => [...prev, discount]);
              applySavedDiscount(discount);
            }}
            hint="Queda guardado para usarlo en este evento y en los próximos."
            saveLabel="Guardar y usar"
            getHeaders={getHeaders}
            theme={theme}
            colorMarca={colorMarca}
            pickers={pickers}
          />
          <StadiumLibrary
            embedded
            visible={stadiumOpen}
            mode={stadiumMode}
            onClose={() => setStadiumOpen(false)}
            stadiums={stadiums}
            reload={load}
            onUse={applyStadium}
            requestMapUpload={requestStadiumMap}
            getHeaders={getHeaders}
            theme={theme}
            colorMarca={colorMarca}
            uploading={uploadingImage}
          />
          <AlertHost active={modalOpen} />
          <WebImageCropModal
            embedded
            visible={Boolean(cropUri)}
            imageUri={cropUri}
            aspect={[16, 9]}
            colorMarca={colorMarca}
            onCancel={() => {
              setCropUri(null);
              finishStadiumMap(null);
            }}
            onConfirm={confirmCroppedImage}
          />
        </View>
      </Modal>

      <Modal visible={ordersOpen} animationType="slide" transparent onRequestClose={() => setOrdersOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.ordersOverlay, { height: windowHeight }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.ordersBackdrop} onPress={() => setOrdersOpen(false)} accessibilityLabel="Cerrar" />
          <SafeAreaView
            edges={['bottom']}
            style={[styles.ordersSheet, { backgroundColor: theme.background }]}
          >
          <View style={[styles.ordersHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={() => setOrdersOpen(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={[
                styles.ordersBack,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9' },
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.ordersTitle, { color: theme.text }]} numberOfLines={1}>
                Compradores
              </Text>
              {ordersEvent?.titulo ? (
                <Text style={[styles.ordersSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {ordersEvent.titulo}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.ordersToolbar}>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {ordersStats.entradasConfirmadas}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Entradas</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  ${formatMoney(ordersStats.recaudado)}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Recaudado</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {ordersStats.compradores}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Compras OK</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color: ordersStats.pendientes
                        ? isDarkMode
                          ? '#fbbf24'
                          : '#b45309'
                        : theme.text,
                    },
                  ]}
                >
                  {ordersStats.pendientes}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Pendientes</Text>
              </View>
            </View>

            <View
              style={[
                styles.ordersSearch,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Ionicons name="search" size={18} color={theme.textMuted} />
              <TextInput
                style={[styles.ordersSearchInput, { color: theme.text }]}
                value={ordersSearch}
                onChangeText={setOrdersSearch}
                placeholder="Buscar por nombre, email, DNI…"
                placeholderTextColor={theme.textMuted}
              />
              {ordersSearch ? (
                <TouchableOpacity onPress={() => setOrdersSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              {ORDER_FILTERS.map((f) => {
                const on = ordersFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setOrdersFilter(f.id)}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: on ? colorMarca : theme.border,
                        backgroundColor: on ? `${colorMarca}22` : theme.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: on ? colorMarca : theme.text, fontWeight: '700', fontSize: 13 }}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {ordersLoading ? (
            <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredOrders}
              keyExtractor={(o) => String(o._id)}
              style={{ maxHeight: ordersListMax }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: canSellEvent(ordersEvent) ? 100 : 32,
              }}
              ListEmptyComponent={
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 32 }}>
                  {orders.length
                    ? 'Ningún comprador coincide con el filtro.'
                    : 'Todavía no hay compras para este evento.'}
                </Text>
              }
              renderItem={({ item: o }) => {
                const tone = ORDER_ESTADO_TONE[o.estado] || ORDER_ESTADO_TONE.expirada;
                const tipoNombre =
                  tipoNombreById[String(o.tipoEntrada)] || 'Entrada';
                const fromApp = !!o.comprador?.user;
                const name = `${o.comprador?.apellido || ''} ${o.comprador?.nombre || ''}`.trim() || 'Sin nombre';
                return (
                  <View
                    style={[
                      styles.buyerCard,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.buyerTop}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.buyerName, { color: theme.text }]} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={1}>
                          {o.comprador?.email || 'Sin email'}
                          {o.comprador?.dni ? ` · DNI ${o.comprador.dni}` : ''}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.estadoPill,
                          { backgroundColor: tone.bg, borderColor: tone.border },
                        ]}
                      >
                        <Text style={{ color: tone.fg, fontWeight: '800', fontSize: 12 }}>
                          {ORDER_ESTADO_LABEL[o.estado] || o.estado}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.buyerMetaRow}>
                      <View style={styles.buyerMetaItem}>
                        <Ionicons name="ticket-outline" size={14} color={theme.textMuted} />
                        <Text style={[styles.buyerMetaText, { color: theme.text }]}>
                          {tipoNombre} × {o.cantidad}
                        </Text>
                      </View>
                      <View style={styles.buyerMetaItem}>
                        <Ionicons
                          name={fromApp ? 'phone-portrait-outline' : 'globe-outline'}
                          size={14}
                          color={theme.textMuted}
                        />
                        <Text style={[styles.buyerMetaText, { color: theme.textMuted }]}>
                          {o.medioPago === 'efectivo' ? 'Efectivo' : fromApp ? 'App' : 'Web'}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.buyerBottom, { borderTopColor: theme.border }]}>
                      <View style={{ flex: 1 }}>
                        {o.reglaAplicada?.nombre ? (
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            {o.reglaAplicada.nombre}
                            {o.cantidadConDescuento
                              ? ` · ${o.cantidadConDescuento} c/desc`
                              : ''}
                            {o.cantidadPrecioLleno
                              ? ` + ${o.cantidadPrecioLleno} lleno`
                              : ''}
                          </Text>
                        ) : o.descuentoBloqueadoPorDeuda ? (
                          <Text style={{ color: isDarkMode ? '#fbbf24' : '#b45309', fontSize: 12 }}>
                            Sin descuento (cuotas vencidas)
                          </Text>
                        ) : (
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            Precio de lista
                          </Text>
                        )}
                        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                          {formatOrderWhen(o.createdAt)}
                        </Text>
                        {!fromApp && ['pagada', 'gratis'].includes(o.estado) && o.comprador?.email ? (
                          <TouchableOpacity
                            onPress={() => shareTicketLink(o._id, o.comprador.email)}
                            style={{ marginTop: 8 }}
                          >
                            <Text style={{ color: colorMarca, fontWeight: '700' }}>Link de las entradas</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={[styles.buyerAmount, { color: theme.text }]}>
                        ${formatMoney(o.montoTotal)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
          {canSellEvent(ordersEvent) ? (
            <TouchableOpacity
              style={[styles.fab, { backgroundColor: colorMarca }]}
              onPress={() => openAdd(ordersEvent)}
            >
              <Ionicons name="add" size={30} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
          </SafeAreaView>
          <AlertHost active={ordersOpen} />
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(addEvent)} animationType="slide" transparent onRequestClose={closeAdd}>
        <KeyboardAvoidingView
          style={[styles.ordersOverlay, { height: windowHeight }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.ordersBackdrop} onPress={closeAdd} accessibilityLabel="Cerrar" />
          <SafeAreaView
            edges={['bottom']}
            style={[styles.ordersSheet, { backgroundColor: theme.background }]}
          >
          <View style={[styles.ordersHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={closeAdd}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={[
                styles.ordersBack,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9' },
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.ordersTitle, { color: theme.text }]} numberOfLines={1}>
                {cashDone ? 'Entradas listas' : 'Vender'}
              </Text>
              {addEvent?.titulo ? (
                <Text style={[styles.ordersSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {addEvent.titulo}
                </Text>
              ) : null}
            </View>
          </View>
          {cashDone ? (
            <ScrollView
              style={{ maxHeight: sellListMax }}
              contentContainerStyle={styles.formScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.stepIntro, { color: theme.textMuted }]}>
                {Number(cashDone.montoTotal) > 0
                  ? `Cobro en efectivo: $${formatMoney(cashDone.montoTotal)}.`
                  : 'Quedó registrada sin cargo.'}
                {addMode === 'app'
                  ? ' Si la persona usa la app, también las ve en Mis entradas.'
                  : ' Mostrale el QR o el código para entrar.'}
              </Text>
              {(cashDone.tickets || []).map((ticket, idx) => {
                const who = `${ticket.titular?.apellido || ''} ${ticket.titular?.nombre || ''}`.trim();
                return (
                  <View
                    key={String(ticket._id || idx)}
                    style={[styles.qrCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <Text style={[styles.buyerName, { color: theme.text }]}>
                      {who || `Entrada ${idx + 1}`}
                    </Text>
                    {ticket.titular?.dni ? (
                      <Text style={{ color: theme.text, fontWeight: '700', marginTop: 4 }}>
                        DNI {ticket.titular.dni}
                      </Text>
                    ) : null}
                    <Text style={{ color: theme.textMuted, marginTop: 2, marginBottom: 12 }}>
                      {ticket.tipoEntradaNombre || cashQuote?.tipoEntradaNombre || 'Entrada'}
                      {ticket.codigo ? ` · ${ticket.codigo}` : ''}
                    </Text>
                    {ticket.qrValue ? (
                      <View style={styles.qrWrap}>
                        <QRCode value={ticket.qrValue} size={180} backgroundColor="#fff" color="#111827" />
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {ticketPageUrl(
                cashDone.orderId,
                addMode === 'app' ? pickedUser?.email : guest.email,
              ) ? (
                <View style={[styles.linkBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.buyerName, { color: theme.text }]}>Link para el visitante</Text>
                  <Text style={{ color: theme.textMuted, marginTop: 4, marginBottom: 10 }} selectable>
                    {ticketPageUrl(
                      cashDone.orderId,
                      addMode === 'app' ? pickedUser?.email : guest.email,
                    )}
                  </Text>
                  <TouchableOpacity
                    style={[styles.footerPrimary, { backgroundColor: colorMarca }]}
                    onPress={() =>
                      shareTicketLink(
                        cashDone.orderId,
                        addMode === 'app' ? pickedUser?.email : guest.email,
                      )
                    }
                  >
                    <Text style={styles.footerPrimaryText}>Compartir link</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.footerPrimary, { backgroundColor: colorMarca, marginTop: 8 }]}
                onPress={closeAdd}
              >
                <Text style={styles.footerPrimaryText}>Listo</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <ScrollView
                style={{ maxHeight: sellListMax }}
                contentContainerStyle={styles.formScroll}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.whenTabs, { marginHorizontal: 0, borderColor: theme.border }]}>
                  {[
                    { id: 'app', label: 'En la app' },
                    { id: 'fuera', label: 'Fuera de la app' },
                  ].map((tab) => {
                    const on = addMode === tab.id;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[styles.whenTab, { backgroundColor: on ? colorMarca : theme.surface }]}
                        onPress={() => setAddMode(tab.id)}
                      >
                        <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '700' }}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {addMode === 'app' ? (
                  <View>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Buscar usuario</Text>
                    <View
                      style={[
                        styles.ordersSearch,
                        { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 8 },
                      ]}
                    >
                      <Ionicons name="search" size={18} color={theme.textMuted} />
                      <TextInput
                        style={[styles.ordersSearchInput, { color: theme.text }]}
                        value={buyerQuery}
                        onChangeText={(text) => {
                          setBuyerQuery(text);
                          if (pickedUser) setPickedUser(null);
                        }}
                        placeholder="Nombre, email o DNI"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="none"
                      />
                      {buyerSearching ? <ClubSpinLoader size={26} /> : null}
                    </View>
                    {pickedUser ? (
                      <View
                        style={[
                          styles.hitRow,
                          { borderColor: colorMarca, backgroundColor: `${colorMarca}14` },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.buyerName, { color: theme.text }]}>
                            {`${pickedUser.apellido || ''} ${pickedUser.nombre || ''}`.trim()}
                          </Text>
                          <Text style={{ color: theme.textMuted, marginTop: 2 }}>
                            {[pickedUser.email, pickedUser.dni ? `DNI ${pickedUser.dni}` : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => setPickedUser(null)} hitSlop={8}>
                          <Ionicons name="close" size={20} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      buyerHits.map((user) => (
                        <TouchableOpacity
                          key={String(user._id)}
                          style={[styles.hitRow, { borderColor: theme.border, backgroundColor: theme.surface }]}
                          onPress={() => pickAppUser(user)}
                        >
                          <Text style={[styles.buyerName, { color: theme.text }]}>
                            {`${user.apellido || ''} ${user.nombre || ''}`.trim()}
                          </Text>
                          <Text style={{ color: theme.textMuted, marginTop: 2 }}>
                            {[user.email, user.dni ? `DNI ${user.dni}` : ''].filter(Boolean).join(' · ')}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                    {!pickedUser && buyerQuery.trim().length >= 2 && !buyerSearching && !buyerHits.length ? (
                      <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                        Nadie coincide. Cambiá a Fuera de la app para cargarla a mano.
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View>
                    <Text style={[styles.stepIntro, { color: theme.textMuted, marginTop: 12 }]}>
                      Persona que no tiene usuario. El precio es el de lista, sin descuento de socio.
                    </Text>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                      value={guest.nombre}
                      onChangeText={(nombre) => setGuest((g) => ({ ...g, nombre }))}
                      placeholder="Nombre"
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.label, { color: theme.textMuted }]}>Apellido</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                      value={guest.apellido}
                      onChangeText={(apellido) => setGuest((g) => ({ ...g, apellido }))}
                      placeholder="Apellido"
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.label, { color: theme.textMuted }]}>Email</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                      value={guest.email}
                      onChangeText={(email) => setGuest((g) => ({ ...g, email }))}
                      placeholder="Email"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <Text style={[styles.label, { color: theme.textMuted }]}>DNI</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                      value={guest.dni}
                      onChangeText={(dni) => setGuest((g) => ({ ...g, dni: dni.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="Opcional"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="number-pad"
                    />
                  </View>
                )}

                <Text style={[styles.label, { color: theme.textMuted }]}>Tipo de entrada</Text>
                <View style={styles.chips}>
                  {(addEvent?.tiposEntrada || [])
                    .filter((t) => t.activo !== false)
                    .map((tipo) => (
                      <Chip
                        key={String(tipo._id)}
                        label={`${tipo.nombre} · $${formatMoney(tipo.precio)}`}
                        on={String(tipo._id) === String(addTipoId)}
                        colorMarca={colorMarca}
                        theme={theme}
                        onPress={() => {
                          setAddTipoId(String(tipo._id));
                          setAddSeats([]);
                        }}
                      />
                    ))}
                </View>

                {(addEvent?.secciones || []).some((section) => String(section.tipoEntrada) === String(addTipoId)) ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Asiento</Text>
                    <StadiumSeatPicker
                      imageUrl={addEvent.mapaEstadioUrl}
                      sections={(addEvent.secciones || []).filter(
                        (section) => String(section.tipoEntrada) === String(addTipoId),
                      )}
                      occupied={cashQuote?.ocupados || []}
                      selected={addSeats}
                      onChange={setAddSeats}
                      color={colorMarca}
                      theme={theme}
                    />
                  </View>
                ) : (
                <View>
                <Text style={[styles.label, { color: theme.textMuted }]}>Cantidad</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    onPress={() => changeAddQty(addQty - 1)}
                  >
                    <Ionicons name="remove" size={20} color={theme.text} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, { color: theme.text }]}>{addQty}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    onPress={() => changeAddQty(addQty + 1)}
                  >
                    <Ionicons name="add" size={20} color={theme.text} />
                  </TouchableOpacity>
                </View>
                </View>
                )}

                <View style={styles.sectionHead}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>Quién entra</Text>
                    <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                      Nombre, apellido y DNI de cada entrada. En la puerta se compara el DNI.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={copyBuyerToFirstTicket} style={{ marginBottom: 10 }}>
                  <Text style={{ color: colorMarca, fontWeight: '700' }}>Usar datos de quien paga</Text>
                </TouchableOpacity>
                {addHolders.slice(0, addQty).map((holder, idx) => (
                  <View
                    key={`holder-${idx}`}
                    style={[styles.subCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  >
                    <Text style={[styles.subCardTitle, { color: theme.text, marginTop: 8 }]}>
                      Entrada {idx + 1}
                    </Text>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={holder.nombre}
                      onChangeText={(v) => setHolderField(idx, 'nombre', v)}
                      placeholder="Nombre"
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.label, { color: theme.textMuted }]}>Apellido</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={holder.apellido}
                      onChangeText={(v) => setHolderField(idx, 'apellido', v)}
                      placeholder="Apellido"
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.label, { color: theme.textMuted }]}>DNI</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginBottom: 10 }]}
                      value={holder.dni}
                      onChangeText={(v) => setHolderField(idx, 'dni', v)}
                      placeholder="DNI"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="number-pad"
                    />
                  </View>
                ))}
              </ScrollView>
              {sellNotice ? (
                <Text style={styles.sellNotice}>{sellNotice}</Text>
              ) : null}
              <View style={[styles.footerBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  {cashQuoting ? (
                    <ClubSpinLoader size={40} />
                  ) : cashQuote ? (
                    <>
                      <Text style={[styles.buyerAmount, { color: theme.text }]}>
                        ${formatMoney(cashQuote.montoTotal)}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                        {cashQuote.descuentoBloqueadoPorDeuda && !cashQuote.cantidadConDescuento
                          ? 'Sin descuento: tiene cuotas vencidas'
                          : cashQuote.cantidadConDescuento
                            ? `Descuento en ${cashQuote.cantidadConDescuento} entrada${cashQuote.cantidadConDescuento === 1 ? '' : 's'}${cashQuote.reglaAplicada?.nombre ? ` (${cashQuote.reglaAplicada.nombre})` : ''}`
                            : Number(cashQuote.montoTotal) > 0
                              ? 'Precio de lista'
                              : 'Sin cargo'}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: cashQuoteError ? '#b45309' : theme.textMuted, fontSize: 13 }}>
                      {cashQuoteError || (addMode === 'app' ? 'Elegí un usuario' : 'Precio de lista')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.footerPrimary,
                    { backgroundColor: colorMarca, opacity: cashSaving || !cashQuote ? 0.55 : 1 },
                  ]}
                  disabled={cashSaving || !cashQuote}
                  onPress={submitCashSale}
                >
                  {cashSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.footerPrimaryText}>
                      {Number(cashQuote?.montoTotal) > 0 ? 'Cobrar efectivo' : 'Registrar'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
          </SafeAreaView>
          <AlertHost active={Boolean(addEvent)} />
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel || closeAlert}
      />

      <DiscountLibrary
        visible={discountOpen && !modalOpen}
        mode="manage"
        discounts={discounts}
        onClose={() => setDiscountOpen(false)}
        onSaved={(discount) => {
          setDiscounts((prev) => {
            const id = String(discount?._id);
            if (prev.some((item) => String(item._id) === id)) {
              return prev.map((item) => (String(item._id) === id ? discount : item));
            }
            return [...prev, discount];
          });
        }}
        onDeleted={(id) => setDiscounts((prev) => prev.filter((item) => String(item._id) !== String(id)))}
        hint="Queda guardado para usarlo en cualquier evento."
        saveLabel="Guardar descuento"
        getHeaders={getHeaders}
        theme={theme}
        colorMarca={colorMarca}
        pickers={pickers}
      />

      <StadiumLibrary
        visible={stadiumOpen && !modalOpen}
        mode={stadiumMode}
        onClose={() => setStadiumOpen(false)}
        stadiums={stadiums}
        reload={load}
        onUse={stadiumMode === 'manage' && !modalOpen ? null : applyStadium}
        requestMapUpload={requestStadiumMap}
        getHeaders={getHeaders}
        theme={theme}
        colorMarca={colorMarca}
        uploading={uploadingImage}
      >
        <WebImageCropModal
          embedded
          visible={Boolean(cropUri) && stadiumOpen && !modalOpen}
          imageUri={cropUri}
          aspect={[16, 9]}
          colorMarca={colorMarca}
          onCancel={() => {
            setCropUri(null);
            finishStadiumMap(null);
          }}
          onConfirm={confirmCroppedImage}
        />
      </StadiumLibrary>

      <WebImageCropModal
        visible={Boolean(cropUri) && !modalOpen && !stadiumOpen}
        imageUri={cropUri}
        aspect={[16, 9]}
        colorMarca={colorMarca}
        onCancel={() => {
          setCropUri(null);
          finishStadiumMap(null);
        }}
        onConfirm={confirmCroppedImage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  linkBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  listThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#e2e8f0' },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  badge: { marginTop: 6, fontWeight: '600', fontSize: 13 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  actionTxt: { fontSize: 12, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepTab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 0,
  },
  stepTabLabel: { fontSize: 14, marginBottom: 10 },
  stepUnderline: { alignSelf: 'stretch', height: 3, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  formScroll: { padding: 16, paddingBottom: 24 },
  stepIntro: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  fieldBlock: { marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  fieldHint: { fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  whenTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  whenTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  discountAlertOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 30,
    elevation: 30,
  },
  discountAlertCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },
  discountAlertTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  discountAlertMessage: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 14 },
  discountAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  discountAlertActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  discountAlertBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDiscountBtn: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStadiumBtn: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  reglaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 2,
  },
  reglaAction: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  foldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  foldBody: { paddingBottom: 12, paddingHorizontal: 2 },
  foldSummary: { fontSize: 13, marginTop: 2 },
  subCardTitle: { fontSize: 15, fontWeight: '800' },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 10,
  },
  imagePicker: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: Platform.OS === 'web' ? 100 : 140,
    ...(Platform.OS === 'web'
      ? { maxWidth: 280, width: '100%', alignSelf: 'flex-start' }
      : {}),
  },
  mapStage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    ...(Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'flex-start' } : {}),
  },
  imagePreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    resizeMode: 'cover',
    ...(Platform.OS === 'web' ? { maxHeight: 158 } : {}),
  },
  imagePlaceholder: {
    height: Platform.OS === 'web' ? 100 : 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mapControl: {
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  emptyRules: {
    borderWidth: 1,
    borderRadius: 14,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  ruleSection: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 4,
  },
  row: { flexDirection: 'row' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  sellNotice: {
    color: '#b45309',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerPrimary: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ordersOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  ordersBackdrop: { flex: 1 },
  ordersSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '96%',
    overflow: 'hidden',
  },
  ordersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 5,
  },
  ordersBack: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTitle: { fontSize: 17, fontWeight: '800' },
  ordersSub: { fontSize: 12, marginTop: 2 },
  ordersToolbar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statValue: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  ordersSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    gap: 8,
    marginBottom: 10,
  },
  ordersSearchInput: { flex: 1, fontSize: 15, paddingVertical: 6 },
  filterChips: { gap: 8, paddingBottom: 8 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buyerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  buyerTop: { flexDirection: 'row', alignItems: 'flex-start' },
  buyerName: { fontSize: 16, fontWeight: '800' },
  estadoPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  buyerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  buyerMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  buyerMetaText: { fontSize: 13, fontWeight: '600' },
  buyerBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buyerAmount: { fontSize: 18, fontWeight: '800' },
  hitRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { fontSize: 20, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  qrCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  qrWrap: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    alignSelf: 'center',
  },
  linkBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
});
