import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Modal, TextInput, ScrollView, RefreshControl, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { clubApi } from '../../utils/api';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import {
  generateTimeSlots,
  getSlotStatus,
  getDayName,
  todayYmd,
  calendarPartsToYmd,
  timeOverlaps,
} from '../../utils/timeSlots';
import { formatJsDateToDisplay, isoCalendarWeekday, isoCalendarDateToDisplay } from '../../utils/dateDisplay';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import {
  rentalSaldoPendiente,
  rentalNeedsFullPayment,
  fmtRentalMoney,
  PAGO_CONCEPTO_LABEL,
} from './alquileres/rentalPaymentUtils';
import { pickPaginatedRows } from '../../utils/paginatedApi';
import { copyText } from '../../utils/copyText';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DN = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const SLOTS = generateTimeSlots(6, 23);
const PAGO_COLOR = { pendiente: '#ef4444', señado: '#f59e0b', pagado: '#10b981' };
const PAGO_LABEL = { pendiente: 'Pendiente', señado: 'Señado', pagado: 'Pagado' };

const TABS = [
  { key: 'calendario', label: 'Calendario', icon: 'calendar-outline' },
  { key: 'reservas', label: 'Reservas', icon: 'list-outline' },
  { key: 'balance', label: 'Balance', icon: 'cash-outline' },
];

export default function AlquileresScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';
  const spacesCacheKey = clubData?.urlIdentifier ? `admin-alquileres-spaces:${clubData.urlIdentifier}` : '';

  const [spaces, setSpaces] = useState(() => readScreenCache(spacesCacheKey)?.list ?? []);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sessions, setSessions] = useState([]);
  const [cancelledSessions, setCancelledSessions] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [activeTab, setActiveTab] = useState('calendario');
  const [allRentals, setAllRentals] = useState([]);
  const [isLoadingRentals, setIsLoadingRentals] = useState(false);
  const [rentalsPage, setRentalsPage] = useState(1);
  const [rentalsHasMore, setRentalsHasMore] = useState(false);
  const [loadingMoreRentals, setLoadingMoreRentals] = useState(false);
  const [reservasSpaceFilter, setReservasSpaceFilter] = useState('');
  const [balanceData, setBalanceData] = useState(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceHistorialHasMore, setBalanceHistorialHasMore] = useState(false);
  const [balanceHistorialPage, setBalanceHistorialPage] = useState(1);
  const [loadingMoreHistorial, setLoadingMoreHistorial] = useState(false);
  const [payingRentalId, setPayingRentalId] = useState(null);
  const [mpReady, setMpReady] = useState(false);
  const [detailMpMode, setDetailMpMode] = useState(false);
  const [mpCreating, setMpCreating] = useState(false);
  const [mpSenaMonto, setMpSenaMonto] = useState('');
  const [mpLinkResult, setMpLinkResult] = useState(null);

  const [isLoadingGrid, setIsLoadingGrid] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ nombreCliente:'', telefonoCliente:'', horaInicio:'18:00', horaFin:'19:00', montoTotal:'', señaPagada:'0' });

  // Detail bottom sheet
  const [detailRental, setDetailRental] = useState(null);

  const [alertConfig, setAlertConfig] = useState({ visible:false, title:'', message:'', showCancel:false, isDanger:false, onConfirm:()=>{}, onCancel:()=>{} });
  const [detailAlertConfig, setDetailAlertConfig] = useState({ visible:false, title:'', message:'', showCancel:false, isDanger:false, onConfirm:()=>{}, onCancel:()=>{} });
  const showAlert = (t,m) => setAlertConfig({ visible:true, title:t, message:m, onConfirm:()=>setAlertConfig(p=>({...p,visible:false})), onCancel:()=>setAlertConfig(p=>({...p,visible:false})) });

  const closeDetailRental = () => {
    setDetailRental(null);
    setDetailMpMode(false);
    setMpLinkResult(null);
    setMpCreating(false);
    setDetailAlertConfig((p) => ({ ...p, visible: false }));
  };

  const setRentalAlert = (config, embedded = false) => {
    const setter = embedded ? setDetailAlertConfig : setAlertConfig;
    setter((p) => ({ ...p, ...config }));
  };

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` };
  };

  const fetchMpReady = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    try {
      const h = await getHeaders();
      const { data } = await clubApi.get('/mercadopago/integration', { headers: h });
      setMpReady(data?.tokenSource === 'club' || data?.tokenSource === 'server_env');
    } catch {
      setMpReady(false);
    }
  }, [clubData?.urlIdentifier]);

  useEffect(() => {
    fetchMpReady();
  }, [fetchMpReady]);

  const fetchSpacesData = useCallback(async () => {
    const h = await getHeaders();
    const r = await clubApi.get('/spaces', { headers: h });
    return { list: r.data || [] };
  }, [clubData?.urlIdentifier]);

  const applySpaces = useCallback((data) => {
    const list = data.list ?? [];
    setSpaces(list);
    setSelectedSpace((prev) => {
      if (prev && list.some((s) => String(s._id) === String(prev))) return prev;
      return list[0]?._id ?? null;
    });
  }, []);

  const { loading: isLoadingSpaces, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: spacesCacheKey,
    enabled: !!spacesCacheKey,
    fetchData: fetchSpacesData,
    onFetched: applySpaces,
    onFetchError: () => {
      showAlert('Error', 'No se pudieron cargar los espacios.');
    },
  });

  const showInitialSpacesLoader = isLoadingSpaces && spaces.length === 0;

  useEffect(() => {
    setSelectedDate(todayYmd());
  }, []);
  useEffect(() => { if (selectedSpace) fetchSchedules(); }, [selectedSpace]);
  useEffect(() => { if (selectedSpace && selectedDate) fetchDayData(); }, [selectedSpace, selectedDate]);

  const syncRentalInLists = useCallback((updated) => {
    if (!updated?._id) return;
    setAllRentals((prev) => prev.map((r) => (String(r._id) === String(updated._id) ? updated : r)));
    setRentals((prev) => prev.map((r) => (String(r._id) === String(updated._id) ? updated : r)));
    setDetailRental((prev) => (prev && String(prev._id) === String(updated._id) ? updated : prev));
  }, []);

  const handleRefresh = () => {
    onRefresh();
    if (selectedSpace && selectedDate) fetchDayData();
    if (activeTab === 'reservas') fetchAllRentals({ page: 1, append: false });
    if (activeTab === 'balance') fetchBalance({ page: 1, append: false });
  };

  const fetchBalance = async ({ page = 1, append = false } = {}) => {
    if (append) setLoadingMoreHistorial(true);
    else setIsLoadingBalance(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get('/rentals/balance', { headers: h, params: { page, limit: 30 } });
      const payload = r.data || {};
      setBalanceData((prev) => ({
        totalFacturado: payload.totalFacturado,
        totalCobrado: payload.totalCobrado,
        totalPendiente: payload.totalPendiente,
        reservasActivas: payload.reservasActivas,
        reservasPagadas: payload.reservasPagadas,
        reservasConSaldo: payload.reservasConSaldo,
        historial: append
          ? [...(prev?.historial || []), ...(payload.historial || [])]
          : payload.historial || [],
      }));
      setBalanceHistorialHasMore(payload.hasMore ?? false);
      setBalanceHistorialPage(payload.page || page);
    } catch (e) {
      console.log('Error balance', e);
      showAlert('Error', 'No se pudo cargar el balance.');
    } finally {
      if (append) setLoadingMoreHistorial(false);
      else setIsLoadingBalance(false);
    }
  };

  const fetchAllRentals = async ({ page = 1, append = false } = {}) => {
    if (append) setLoadingMoreRentals(true);
    else setIsLoadingRentals(true);
    try {
      const h = await getHeaders();
      const params = { page, limit: 30 };
      if (reservasSpaceFilter) params.espacio = reservasSpaceFilter;
      const r = await clubApi.get('/rentals', { headers: h, params });
      const list = r.data.rentals || [];
      setAllRentals((prev) => (append ? [...prev, ...list] : list));
      setRentalsPage(r.data.page || page);
      setRentalsHasMore(r.data.hasMore ?? false);
    } catch (e) {
      console.log('Error rentals list', e);
      showAlert('Error', 'No se pudieron cargar las reservas.');
    } finally {
      if (append) setLoadingMoreRentals(false);
      else setIsLoadingRentals(false);
    }
  };

  const loadMoreRentals = () => {
    if (!rentalsHasMore || loadingMoreRentals || isLoadingRentals) return;
    fetchAllRentals({ page: rentalsPage + 1, append: true });
  };

  const loadMoreBalanceHistorial = () => {
    if (!balanceHistorialHasMore || loadingMoreHistorial || isLoadingBalance) return;
    fetchBalance({ page: balanceHistorialPage + 1, append: true });
  };

  useEffect(() => {
    if (activeTab === 'reservas') fetchAllRentals({ page: 1, append: false });
    if (activeTab === 'balance') fetchBalance({ page: 1, append: false });
  }, [activeTab, reservasSpaceFilter]);

  const openMpCobro = (rental) => {
    if (!rental || rentalSaldoPendiente(rental) <= 0) return;
    const total = Number(rental.montoTotal) || 0;
    const cobrado = Number(rental.señaPagada) || 0;
    const defaultSena = cobrado > 0 ? '' : String(Math.max(1, Math.round(total / 2)));
    setMpSenaMonto(defaultSena);
    setMpLinkResult(null);
    setMpCreating(false);
    setDetailMpMode(true);
  };

  const backFromMpMode = () => {
    setDetailMpMode(false);
    setMpLinkResult(null);
    setMpCreating(false);
  };

  const createMpLink = async (concepto) => {
    if (!detailRental?._id || mpCreating) return;
    setMpCreating(true);
    try {
      const h = await getHeaders();
      const body = { rentalId: detailRental._id, concepto };
      if (concepto === 'sena') {
        body.monto = Number(mpSenaMonto);
      }
      const { data } = await clubApi.post('/mercadopago/create-preference-rental', body, { headers: h });
      setMpLinkResult(data);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo crear el link de Mercado Pago.');
    } finally {
      setMpCreating(false);
    }
  };

  const copyMpLink = async () => {
    if (!mpLinkResult?.linkDePago) return;
    try {
      await copyText(mpLinkResult.linkDePago);
      showAlert('Listo', 'Link copiado. Pegalo en WhatsApp o mail al cliente.');
    } catch {
      showAlert('Error', 'No se pudo copiar el link.');
    }
  };

  const openMpLink = async () => {
    const url = mpLinkResult?.linkDePago;
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      showAlert('Error', 'No se pudo abrir Mercado Pago.');
    }
  };

  const handlePayTotal = (rental, embedded = false) => {
    const saldo = rentalSaldoPendiente(rental);
    if (saldo <= 0) return;
    setRentalAlert({
      visible: true,
      title: 'Registrar pago total',
      message: `¿Marcar como pagado el saldo de ${fmtRentalMoney(saldo)} de ${rental.nombreCliente}?`,
      showCancel: true,
      confirmText: 'Pagar total',
      cancelText: 'Volver',
      onConfirm: async () => {
        setRentalAlert({ visible: false }, embedded);
        setPayingRentalId(rental._id);
        try {
          const h = await getHeaders();
          const { data } = await clubApi.post(`/rentals/${rental._id}/pagar-total`, {}, { headers: h });
          syncRentalInLists(data);
          fetchDayData();
          fetchAllRentals({ page: 1, append: false });
          fetchBalance({ page: 1, append: false });
          showAlert('Listo', 'Pago registrado correctamente.');
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo registrar el pago.');
        } finally {
          setPayingRentalId(null);
        }
      },
      onCancel: () => setRentalAlert({ visible: false }, embedded),
    }, embedded);
  };

  const fetchSchedules = async () => {
    try {
      const h = await getHeaders();
      const r = await clubApi.get(`/schedules/espacio/${selectedSpace}`, { headers: h });
      setSchedules(r.data);
    } catch(e) { console.log('Error schedules', e); }
  };

  const fetchDayData = async () => {
    setIsLoadingGrid(true);
    try {
      const h = await getHeaders();
      const [sesRes, renRes] = await Promise.all([
        clubApi.get(
          `/sessions/espacio/${selectedSpace}?fechaInicio=${selectedDate}&fechaFin=${selectedDate}&incluirCanceladas=true`,
          { headers: h },
        ),
        clubApi.get(`/rentals/espacio/${selectedSpace}?fecha=${selectedDate}`, { headers: h }),
      ]);
      const allSessions = pickPaginatedRows(sesRes.data, 'sessions');
      setSessions(allSessions.filter((s) => s.estado !== 'cancelada'));
      setCancelledSessions(allSessions.filter((s) => s.estado === 'cancelada'));
      setRentals(renRes.data);
    } catch(e) { console.log('Error day data', e); }
    finally { setIsLoadingGrid(false); }
  };

  const handleSaveRental = async () => {
    if (!formData.nombreCliente || !formData.telefonoCliente || !formData.horaInicio || !formData.horaFin || !formData.montoTotal)
      return showAlert('Error','Todos los campos son obligatorios.');
    if (!isValidTimeHHMM(formData.horaInicio) || !isValidTimeHHMM(formData.horaFin))
      return showAlert('Error','Usá horarios en formato HH:MM (24 h).');
    if (!(formData.horaInicio < formData.horaFin))
      return showAlert('Error','La hora de fin debe ser posterior a la de inicio.');

    const hi = formData.horaInicio;
    const hf = formData.horaFin;
    const daySchedulesNow = schedules.filter((s) => s.diaSemana === getDayName(selectedDate));
    const choqueSesion = sessions.some(
      (s) => s.estado !== 'cancelada' && timeOverlaps(hi, hf, s.horaInicio, s.horaFin),
    );
    const choqueAlquiler = rentals.some((r) => timeOverlaps(hi, hf, r.horaInicio, r.horaFin));
    const liberadoPorCancel = cancelledSessions.some((s) =>
      timeOverlaps(hi, hf, s.horaInicio, s.horaFin),
    );
    const choqueGrilla =
      !liberadoPorCancel &&
      daySchedulesNow.some((sch) => timeOverlaps(hi, hf, sch.horaInicio, sch.horaFin));
    if (choqueSesion || choqueAlquiler || choqueGrilla) {
      return showAlert(
        'Horario ocupado',
        'Ese rango choca con un entrenamiento, la grilla fija u otro alquiler. Elegí un horario libre del calendario.',
      );
    }

    setIsSaving(true);
    try {
      const h = await getHeaders();
      await clubApi.post('/rentals', { ...formData, espacio: selectedSpace, fecha: selectedDate, montoTotal: Number(formData.montoTotal), señaPagada: Number(formData.señaPagada) }, { headers: h });
      fetchDayData();
      fetchAllRentals({ page: 1, append: false });
      fetchBalance({ page: 1, append: false });
      setIsModalVisible(false);
      setFormData({ nombreCliente:'', telefonoCliente:'', horaInicio:'18:00', horaFin:'19:00', montoTotal:'', señaPagada:'0' });
      showAlert('Éxito','Reserva creada correctamente.');
    } catch(error) { showAlert('Error', error.response?.data?.message || 'No se pudo crear la reserva.'); }
    finally { setIsSaving(false); }
  };

  const handleDeleteRental = (rental, embedded = false) => {
    setRentalAlert({
      visible: true,
      title: 'Cancelar Alquiler',
      message: `¿Cancelar la reserva de ${rental.nombreCliente}?\nSe liberará el horario. El registro y los cobros se conservan.`,
      showCancel: true,
      isDanger: true,
      confirmText: 'Cancelar Reserva',
      cancelText: 'Volver',
      onConfirm: async () => {
        setRentalAlert({ visible: false }, embedded);
        try {
          const h = await getHeaders();
          await clubApi.delete(`/rentals/${rental._id}`, { headers: h });
          closeDetailRental();
          fetchDayData();
          fetchAllRentals({ page: 1, append: false });
          fetchBalance({ page: 1, append: false });
          showAlert('Listo', 'Alquiler cancelado y horario liberado.');
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo cancelar.');
        }
      },
      onCancel: () => setRentalAlert({ visible: false }, embedded),
    }, embedded);
  };

  const openNewRental = (hora) => {
    const hi = hora || '18:00';
    const hNum = parseInt(hi.split(':')[0]);
    const hf = String(hNum+1).padStart(2,'0')+':00';
    setFormData({ nombreCliente:'', telefonoCliente:'', horaInicio:hi, horaFin:hf, montoTotal:'', señaPagada:'0' });
    setIsModalVisible(true);
  };

  // Calendar
  const getDIM = (y,m) => new Date(y,m+1,0).getDate();
  const getFD = (y,m) => new Date(y,m,1).getDay();
  const genDays = () => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const dim = getDIM(y, m);
    const fd = getFD(y, m);
    const days = [];
    for (let i = 0; i < fd; i++) days.push(null);
    for (let day = 1; day <= dim; day++) {
      days.push({ day, str: calendarPartsToYmd(y, m, day) });
    }
    return days;
  };
  const chgMonth = (o) => {
    const n = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + o, 1);
    setCurrentMonth(n);
  };
  const todayStr = todayYmd();

  const filteredReservas = allRentals;

  const renderReservaCard = (r) => {
    const pc = PAGO_COLOR[r.estadoPago] || '#999';
    const fechaTxt = isoCalendarDateToDisplay(r.fecha) || formatJsDateToDisplay(r.fecha) || '—';
    const saldo = rentalSaldoPendiente(r);
    const cobrado = Number(r.señaPagada) || 0;
    const busy = String(payingRentalId) === String(r._id);
    return (
      <View style={[styles.reservaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => setDetailRental(r)} activeOpacity={0.75}>
          <View style={styles.reservaTop}>
            <Text style={[styles.reservaName, { color: theme.text }]} numberOfLines={1}>
              {r.nombreCliente}
            </Text>
            <View style={{ backgroundColor: pc, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{PAGO_LABEL[r.estadoPago]}</Text>
            </View>
          </View>
          <Text style={[styles.reservaMeta, { color: theme.textMuted }]}>
            {r.espacio?.nombre || 'Espacio'} · {fechaTxt} · {r.horaInicio}–{r.horaFin}
          </Text>
          <View style={styles.reservaMoneyRow}>
            <Text style={[styles.reservaAmount, { color: theme.text }]}>Total {fmtRentalMoney(r.montoTotal)}</Text>
            <Text style={[styles.reservaPaid, { color: '#10b981' }]}>Cobrado {fmtRentalMoney(cobrado)}</Text>
            {saldo > 0 ? (
              <Text style={[styles.reservaDue, { color: '#ef4444' }]}>Debe {fmtRentalMoney(saldo)}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
        {rentalNeedsFullPayment(r) ? (
          <TouchableOpacity
            style={[styles.payTotalBtn, { backgroundColor: cc, opacity: busy ? 0.7 : 1 }]}
            onPress={() => handlePayTotal(r)}
            disabled={busy}
            activeOpacity={0.75}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="card-outline" size={16} color="#fff" />
                <Text style={styles.payTotalBtnTxt}>Pagar total ({fmtRentalMoney(saldo)})</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderHistorialRow = (h) => {
    const fechaPago = isoCalendarDateToDisplay(h.fecha) || formatJsDateToDisplay(h.fecha) || '—';
    const fechaReserva = isoCalendarDateToDisplay(h.fechaReserva) || formatJsDateToDisplay(h.fechaReserva) || '—';
    return (
      <View style={[styles.historialRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.historialTitle, { color: theme.text }]} numberOfLines={1}>
            {h.nombreCliente}
          </Text>
          <Text style={[styles.historialMeta, { color: theme.textMuted }]}>
            {PAGO_CONCEPTO_LABEL[h.concepto] || h.concepto} · {fechaPago}
          </Text>
          <Text style={[styles.historialSub, { color: theme.textMuted }]} numberOfLines={1}>
            {h.espacio} · reserva {fechaReserva} {h.horaInicio}–{h.horaFin}
          </Text>
        </View>
        <Text style={[styles.historialAmount, { color: '#10b981' }]}>{fmtRentalMoney(h.monto)}</Text>
      </View>
    );
  };

  // Check if date has scheduled trainings for the selected space
  const dayName = selectedDate ? getDayName(selectedDate) : '';
  const daySchedules = schedules.filter(s => s.diaSemana === dayName);

  const renderSlot = ({ item: slot }) => {
    const status = getSlotStatus(slot, sessions, rentals, daySchedules, cancelledSessions);
    let bg, icon, label, sub, onTap;

    if (status.tipo === 'alquiler') {
      const r = status.data;
      const pc = PAGO_COLOR[r.estadoPago] || '#999';
      bg = '#f59e0b18';
      icon = <Ionicons name="football-outline" size={18} color="#d97706" />;
      label = r.nombreCliente;
      sub = <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
        <View style={{backgroundColor:pc,paddingHorizontal:8,paddingVertical:2,borderRadius:10}}>
          <Text style={{color:'#fff',fontSize:10,fontWeight:'bold'}}>{PAGO_LABEL[r.estadoPago]}</Text>
        </View>
        <Text style={{color:theme.textMuted,fontSize:12}}>${r.montoTotal}</Text>
      </View>;
      onTap = () => setDetailRental(r);
    } else if (status.tipo === 'entrenamiento') {
      const s = status.data;
      bg = isDarkMode ? '#4b5563' : '#d1d5db';
      icon = <Ionicons name="fitness-outline" size={18} color={isDarkMode ? '#9ca3af' : '#6b7280'} />;
      label = s.categoria?.nombre || 'Entrenamiento';
      sub = (
        <Text style={{ color: isDarkMode ? '#d1d5db' : '#6b7280', fontSize: 12 }}>No disponible</Text>
      );
      onTap = null;
    } else {
      bg = '#10b98110';
      icon = <Ionicons name="add-circle-outline" size={18} color="#10b981" />;
      label = 'Disponible';
      sub = <Text style={{color:'#10b981',fontSize:12}}>Toque para reservar</Text>;
      onTap = () => openNewRental(slot.horaInicio);
    }

    const isUnavailable = status.tipo === 'entrenamiento';

    return (
      <TouchableOpacity disabled={!onTap} onPress={onTap} activeOpacity={0.7}
        style={[styles.slotRow, { backgroundColor: bg }]}>
        <View style={styles.slotTime}>
          <Text style={{fontWeight:'bold',fontSize:13,color:isUnavailable ? (isDarkMode ? '#e5e7eb' : '#374151') : theme.text}}>{slot.horaInicio}</Text>
          <Text style={{fontSize:10,color:isUnavailable ? (isDarkMode ? '#d1d5db' : '#6b7280') : theme.textMuted}}>{slot.horaFin}</Text>
        </View>
        <View style={[styles.slotDivider, isUnavailable && { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />
        <View style={{marginRight:10}}>{icon}</View>
        <View style={{flex:1}}>
          <Text style={{fontWeight:'600',color:isUnavailable ? (isDarkMode ? '#f3f4f6' : '#374151') : theme.text,fontSize:14}}>{label}</Text>
          {sub}
        </View>
        {status.tipo === 'alquiler' && <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <AdminScreenHeader
        theme={theme}
        colorMarca={cc}
        kicker="Gestión"
        title="Reservas de canchas"
        subtitle="Alquileres externos"
        onBack={() => navigation.goBack()}
      />

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { borderBottomColor: cc, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Ionicons name={t.icon} size={18} color={active ? cc : theme.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? cc : theme.textMuted, fontWeight: active ? 'bold' : 'normal' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
          if (!nearBottom) return;
          if (activeTab === 'reservas') loadMoreRentals();
          if (activeTab === 'balance') loadMoreBalanceHistorial();
        }}
        refreshControl={<RefreshControl refreshing={refreshing || isLoadingRentals || isLoadingBalance} onRefresh={handleRefresh} tintColor={cc} />}
      >
        {activeTab === 'balance' ? (
          isLoadingBalance && !balanceData ? (
            <ActivityIndicator color={cc} style={{ marginTop: 30 }} />
          ) : (
            <>
              <View style={styles.balanceStats}>
                <View style={[styles.balanceStat, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.balanceStatVal, { color: theme.text }]}>
                    {fmtRentalMoney(balanceData?.totalFacturado)}
                  </Text>
                  <Text style={[styles.balanceStatLbl, { color: theme.textMuted }]}>Facturado</Text>
                </View>
                <View style={[styles.balanceStat, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.balanceStatVal, { color: '#10b981' }]}>
                    {fmtRentalMoney(balanceData?.totalCobrado)}
                  </Text>
                  <Text style={[styles.balanceStatLbl, { color: theme.textMuted }]}>Cobrado</Text>
                </View>
                <View style={[styles.balanceStat, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.balanceStatVal, { color: '#ef4444' }]}>
                    {fmtRentalMoney(balanceData?.totalPendiente)}
                  </Text>
                  <Text style={[styles.balanceStatLbl, { color: theme.textMuted }]}>Por cobrar</Text>
                </View>
              </View>
              <Text style={[styles.balanceHint, { color: theme.textMuted }]}>
                {balanceData?.reservasActivas || 0} reservas activas · {balanceData?.reservasPagadas || 0} pagadas ·{' '}
                {balanceData?.reservasConSaldo || 0} con saldo
              </Text>
              <Text style={[styles.label, { color: theme.textMuted, marginTop: 16, marginBottom: 10 }]}>
                Historial de cobros
              </Text>
              {(balanceData?.historial || []).length === 0 ? (
                <Text style={[styles.emptyReservas, { color: theme.textMuted }]}>Todavía no hay cobros registrados.</Text>
              ) : (
                (balanceData?.historial || []).map((h, i) => (
                  <View key={`${h.rentalId}-${h.fecha}-${i}`}>{renderHistorialRow(h)}</View>
                ))
              )}
              {loadingMoreHistorial ? <ActivityIndicator color={cc} style={{ marginVertical: 12 }} /> : null}
            </>
          )
        ) : activeTab === 'reservas' ? (
          <>
            <Text style={[styles.label, { color: theme.textMuted, marginBottom: 10 }]}>Filtrar por espacio</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[{ _id: '', nombre: 'Todos' }, ...spaces]}
              keyExtractor={(s) => String(s._id || 'all')}
              style={{ maxHeight: 50, flexGrow: 0, marginBottom: 15 }}
              renderItem={({ item }) => {
                const on = String(reservasSpaceFilter) === String(item._id || '');
                return (
                  <TouchableOpacity
                    style={[
                      styles.spaceChip,
                      on ? { backgroundColor: cc, borderColor: cc } : { backgroundColor: theme.background, borderColor: theme.border },
                    ]}
                    onPress={() => setReservasSpaceFilter(item._id || '')}
                  >
                    <Text style={{ color: on ? '#fff' : theme.text }}>{item.nombre}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            {isLoadingRentals && filteredReservas.length === 0 ? (
              <ActivityIndicator color={cc} style={{ marginTop: 30 }} />
            ) : filteredReservas.length === 0 ? (
              <Text style={[styles.emptyReservas, { color: theme.textMuted }]}>
                No hay reservas{reservasSpaceFilter ? ' para este espacio' : ''}.
              </Text>
            ) : (
              <View style={{ paddingBottom: 24 }}>
                {filteredReservas.map((r) => (
                  <View key={String(r._id)}>{renderReservaCard(r)}</View>
                ))}
                {loadingMoreRentals ? <ActivityIndicator color={cc} style={{ marginVertical: 12 }} /> : null}
              </View>
            )}
          </>
        ) : showInitialSpacesLoader ? <ActivityIndicator color={cc} style={{marginTop:20}} /> : (
          <>
            <Text style={[styles.label, { color: theme.textMuted, marginBottom: 10 }]}>Seleccionar Espacio</Text>
            <FlatList horizontal showsHorizontalScrollIndicator={false} data={spaces} keyExtractor={s=>s._id}
              style={{ maxHeight:50, flexGrow:0, marginBottom:15 }}
              renderItem={({item})=>(
                <TouchableOpacity style={[styles.spaceChip, selectedSpace===item._id ? {backgroundColor:cc,borderColor:cc} : {backgroundColor:theme.background,borderColor:theme.border}]}
                  onPress={()=>setSelectedSpace(item._id)}>
                  <Text style={{color:selectedSpace===item._id?'#fff':theme.text}}>{item.nombre}</Text>
                </TouchableOpacity>
              )} />

            {/* Mini Calendar */}
            <View style={[styles.calBox, { backgroundColor: theme.surface }]}>
              <View style={styles.calHead}>
                <TouchableOpacity onPress={()=>chgMonth(-1)}><Ionicons name="chevron-back" size={22} color={theme.text}/></TouchableOpacity>
                <Text style={{fontWeight:'bold',fontSize:15,color:theme.text}}>{MN[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
                <TouchableOpacity onPress={()=>chgMonth(1)}><Ionicons name="chevron-forward" size={22} color={theme.text}/></TouchableOpacity>
              </View>
              <View style={styles.daysHeader}>{DN.map((d,i)=><Text key={i} style={[styles.dayHdrTxt,{color:theme.textMuted}]}>{d}</Text>)}</View>
              <View style={styles.daysGrid}>
                {genDays().map((dt, i) => {
                  if (!dt) return <View key={i} style={styles.dayCell} />;
                  const sel = dt.str === selectedDate;
                  const isToday = dt.str === todayStr;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.dayCell,
                        sel && { backgroundColor: cc, borderRadius: 20 },
                        !sel && isToday && { borderWidth: 2, borderColor: cc, borderRadius: 20 },
                      ]}
                      onPress={() => setSelectedDate(dt.str)}
                    >
                      <Text
                        style={[
                          { color: theme.text, textAlign: 'center' },
                          sel && { color: '#fff', fontWeight: 'bold' },
                          !sel && isToday && { color: cc, fontWeight: 'bold' },
                        ]}
                      >
                        {dt.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Time Grid */}
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <Text style={[styles.label, { color: theme.textMuted }]}>
                Horarios — {formatJsDateToDisplay(selectedDate) || selectedDate}
              </Text>
              {dayName ? (
                <Text style={{ fontSize: 12, color: cc, fontWeight: '600' }}>
                  {isoCalendarWeekday(selectedDate, { style: 'long' }) || dayName}
                </Text>
              ) : null}
            </View>

            {isLoadingGrid ? <ActivityIndicator color={cc} style={{marginVertical:30}} /> : (
              <View style={{paddingBottom:90}}>
                {SLOTS.map((slot,i) => (
                  <View key={i}>{renderSlot({ item: slot })}</View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {activeTab === 'calendario' ? (
      <TouchableOpacity style={[styles.fab, { backgroundColor: '#10b981' }]} onPress={()=>openNewRental(null)}>
        <Ionicons name="calendar-outline" size={24} color="#fff" />
      </TouchableOpacity>
      ) : null}

      {/* New Rental Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nuevo Alquiler</Text>
              <TouchableOpacity onPress={()=>setIsModalVisible(false)}><Ionicons name="close" size={28} color={theme.icon}/></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ color: cc, fontWeight: 'bold', marginBottom: 15 }}>
                Fecha: {formatJsDateToDisplay(selectedDate)} — {isoCalendarWeekday(selectedDate, { style: 'long' }) || dayName}
              </Text>
              <Text style={[styles.label,{color:theme.textMuted}]}>Nombre del Cliente</Text>
              <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                placeholder="Ej: Juan Pérez" placeholderTextColor={theme.textMuted}
                value={formData.nombreCliente} onChangeText={v=>setFormData({...formData,nombreCliente:v})} />
              <Text style={[styles.label,{color:theme.textMuted}]}>Teléfono</Text>
              <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                placeholder="Ej: 1123456789" placeholderTextColor={theme.textMuted} keyboardType="phone-pad"
                value={formData.telefonoCliente} onChangeText={v=>setFormData({...formData,telefonoCliente:v})} />
              <View style={styles.row}>
                <View style={{flex:1,marginRight:10}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Hora Inicio</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="18:00" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={5}
                    value={formData.horaInicio} onChangeText={v=>setFormData({...formData,horaInicio:maskTimeHHMM(v)})} />
                </View>
                <View style={{flex:1}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Hora Fin</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="19:00" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={5}
                    value={formData.horaFin} onChangeText={v=>setFormData({...formData,horaFin:maskTimeHHMM(v)})} />
                </View>
              </View>
              <View style={styles.row}>
                <View style={{flex:1,marginRight:10}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Monto Total ($)</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="10000" placeholderTextColor={theme.textMuted} keyboardType="numeric"
                    value={formData.montoTotal} onChangeText={v=>setFormData({...formData,montoTotal:v})} />
                </View>
                <View style={{flex:1}}>
                  <Text style={[styles.label,{color:theme.textMuted}]}>Seña Pagada ($)</Text>
                  <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                    placeholder="0" placeholderTextColor={theme.textMuted} keyboardType="numeric"
                    value={formData.señaPagada} onChangeText={v=>setFormData({...formData,señaPagada:v})} />
                </View>
              </View>
              <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#10b981',marginTop:15}]} onPress={handleSaveRental} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveBtnText}>Confirmar Reserva</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rental Detail Bottom Sheet (MP cobro vive acá — no apilar otro Modal) */}
      <Modal
        visible={!!detailRental}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={closeDetailRental}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {detailRental && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {detailMpMode ? 'Mercado Pago' : 'Detalle Alquiler'}
                  </Text>
                  <TouchableOpacity onPress={closeDetailRental}>
                    <Ionicons name="close" size={28} color={theme.icon} />
                  </TouchableOpacity>
                </View>

                {detailMpMode ? (
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <Text style={{ color: theme.textMuted, marginBottom: 12, lineHeight: 20 }}>
                      Generá un link de pago para {detailRental.nombreCliente}. El saldo actual es{' '}
                      {fmtRentalMoney(rentalSaldoPendiente(detailRental))}.
                    </Text>

                    {!mpLinkResult ? (
                      <>
                        {Number(detailRental.señaPagada) <= 0 ? (
                          <View style={{ marginBottom: 14 }}>
                            <Text style={[styles.label, { color: theme.textMuted }]}>Monto de seña</Text>
                            <TextInput
                              style={[
                                styles.input,
                                {
                                  backgroundColor: theme.background,
                                  borderColor: theme.border,
                                  color: theme.text,
                                },
                              ]}
                              keyboardType="numeric"
                              value={mpSenaMonto}
                              onChangeText={setMpSenaMonto}
                              placeholder="Ej. 5000"
                              placeholderTextColor={theme.textMuted}
                            />
                            <TouchableOpacity
                              style={[
                                styles.saveBtn,
                                { backgroundColor: '#009EE3', marginBottom: 10, opacity: mpCreating ? 0.7 : 1 },
                              ]}
                              onPress={() => createMpLink('sena')}
                              disabled={mpCreating}
                            >
                              {mpCreating ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <Text style={styles.saveBtnText}>
                                  Link de seña ({fmtRentalMoney(mpSenaMonto)})
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        ) : null}

                        <TouchableOpacity
                          style={[
                            styles.saveBtn,
                            { backgroundColor: '#009EE3', marginBottom: 10, opacity: mpCreating ? 0.7 : 1 },
                          ]}
                          onPress={() =>
                            createMpLink(Number(detailRental.señaPagada) > 0 ? 'saldo' : 'total')
                          }
                          disabled={mpCreating}
                        >
                          {mpCreating ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.saveBtnText}>
                              {Number(detailRental.señaPagada) > 0
                                ? `Link de saldo (${fmtRentalMoney(rentalSaldoPendiente(detailRental))})`
                                : `Link de total (${fmtRentalMoney(rentalSaldoPendiente(detailRental))})`}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </>
                    ) : (
                      <View>
                        <Text style={{ color: theme.text, fontWeight: '700', marginBottom: 6 }}>
                          Listo · {fmtRentalMoney(mpLinkResult.monto)}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
                          Mostrá el QR al cliente en mostrador, o copiá el link para mandarlo.
                        </Text>
                        <View
                          style={{
                            alignSelf: 'center',
                            backgroundColor: '#fff',
                            padding: 14,
                            borderRadius: 12,
                            marginBottom: 14,
                            borderWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          <QRCode
                            value={mpLinkResult.linkDePago}
                            size={200}
                            backgroundColor="#fff"
                            color="#111827"
                          />
                        </View>
                        <Text
                          style={{
                            color: theme.textMuted,
                            fontSize: 12,
                            marginBottom: 14,
                            lineHeight: 17,
                          }}
                          selectable
                          numberOfLines={2}
                        >
                          {mpLinkResult.linkDePago}
                        </Text>
                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: '#009EE3', marginBottom: 10 }]}
                          onPress={copyMpLink}
                        >
                          <Ionicons name="copy-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.saveBtnText}>Copiar link</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: cc, marginBottom: 10 }]}
                          onPress={openMpLink}
                        >
                          <Ionicons name="open-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.saveBtnText}>Abrir checkout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: theme.border, marginBottom: 10 }]}
                          onPress={() => setMpLinkResult(null)}
                        >
                          <Text style={[styles.saveBtnText, { color: theme.text }]}>Generar otro link</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: theme.border, marginTop: 4 }]}
                      onPress={backFromMpMode}
                    >
                      <Text style={[styles.saveBtnText, { color: theme.text }]}>Volver al detalle</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                      <View
                        style={{
                          backgroundColor: PAGO_COLOR[detailRental.estadoPago] + '20',
                          width: 70,
                          height: 70,
                          borderRadius: 35,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginBottom: 10,
                        }}
                      >
                        <Ionicons name="person" size={32} color={PAGO_COLOR[detailRental.estadoPago]} />
                      </View>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text }}>
                        {detailRental.nombreCliente}
                      </Text>
                      <View
                        style={{
                          backgroundColor: PAGO_COLOR[detailRental.estadoPago],
                          paddingHorizontal: 14,
                          paddingVertical: 4,
                          borderRadius: 12,
                          marginTop: 8,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                          {PAGO_LABEL[detailRental.estadoPago]}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.detailRow, { backgroundColor: theme.background }]}>
                      <Ionicons name="call-outline" size={18} color={cc} />
                      <Text style={{ color: theme.text, marginLeft: 10, flex: 1 }}>
                        {detailRental.telefonoCliente}
                      </Text>
                    </View>
                    <View style={[styles.detailRow, { backgroundColor: theme.background }]}>
                      <Ionicons name="calendar-outline" size={18} color={cc} />
                      <Text style={{ color: theme.text, marginLeft: 10, flex: 1 }}>
                        {isoCalendarDateToDisplay(detailRental.fecha) ||
                          formatJsDateToDisplay(detailRental.fecha)}
                      </Text>
                    </View>
                    <View style={[styles.detailRow, { backgroundColor: theme.background }]}>
                      <Ionicons name="location-outline" size={18} color={cc} />
                      <Text style={{ color: theme.text, marginLeft: 10, flex: 1 }}>
                        {detailRental.espacio?.nombre || '—'}
                      </Text>
                    </View>
                    <View style={[styles.detailRow, { backgroundColor: theme.background }]}>
                      <Ionicons name="time-outline" size={18} color={cc} />
                      <Text style={{ color: theme.text, marginLeft: 10, flex: 1 }}>
                        {detailRental.horaInicio} a {detailRental.horaFin}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                      <View style={[styles.detailRow, { backgroundColor: theme.background, flex: 1 }]}>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Total</Text>
                        <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 18 }}>
                          {fmtRentalMoney(detailRental.montoTotal)}
                        </Text>
                      </View>
                      <View style={[styles.detailRow, { backgroundColor: theme.background, flex: 1 }]}>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Cobrado</Text>
                        <Text style={{ color: '#10b981', fontWeight: 'bold', fontSize: 18 }}>
                          {fmtRentalMoney(detailRental.señaPagada)}
                        </Text>
                      </View>
                    </View>
                    {rentalSaldoPendiente(detailRental) > 0 ? (
                      <View style={[styles.detailRow, { backgroundColor: theme.background, marginBottom: 12 }]}>
                        <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
                        <Text style={{ color: theme.text, marginLeft: 10, flex: 1, fontWeight: '600' }}>
                          Saldo pendiente: {fmtRentalMoney(rentalSaldoPendiente(detailRental))}
                        </Text>
                      </View>
                    ) : null}
                    {rentalNeedsFullPayment(detailRental) ? (
                      <TouchableOpacity
                        style={[
                          styles.saveBtn,
                          {
                            backgroundColor: cc,
                            marginBottom: 12,
                            opacity: String(payingRentalId) === String(detailRental._id) ? 0.7 : 1,
                          },
                        ]}
                        onPress={() => handlePayTotal(detailRental, true)}
                        disabled={String(payingRentalId) === String(detailRental._id)}
                        activeOpacity={0.75}
                      >
                        {String(payingRentalId) === String(detailRental._id) ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="cash-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.saveBtnText}>Registrar pago (efectivo)</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {mpReady && rentalNeedsFullPayment(detailRental) ? (
                      <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: '#009EE3', marginBottom: 12 }]}
                        onPress={() => openMpCobro(detailRental)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="wallet-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.saveBtnText}>Cobrar con Mercado Pago</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: '#ef4444' }]}
                      onPress={() => handleDeleteRental(detailRental, true)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.saveBtnText}>Cancelar Reserva</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}

                <CustomAlert
                  embedded
                  visible={detailAlertConfig.visible}
                  title={detailAlertConfig.title}
                  message={detailAlertConfig.message}
                  showCancel={detailAlertConfig.showCancel}
                  isDanger={detailAlertConfig.isDanger}
                  confirmText={detailAlertConfig.confirmText}
                  onConfirm={detailAlertConfig.onConfirm}
                  cancelText={detailAlertConfig.cancelText}
                  onCancel={detailAlertConfig.onCancel}
                />
              </>
            )}
          </View>
        </View>
      </Modal>


      <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message}
        showCancel={alertConfig.showCancel} isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm}
        cancelText={alertConfig.cancelText} onCancel={alertConfig.onCancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  body:{flex:1,padding:20},
  tabs:{flexDirection:'row',paddingHorizontal:16},
  tab:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:12},
  tabLabel:{fontSize:13},
  balanceStats:{flexDirection:'row',gap:10,marginBottom:8},
  balanceStat:{flex:1,borderRadius:12,padding:12,alignItems:'center'},
  balanceStatVal:{fontSize:14,fontWeight:'800'},
  balanceStatLbl:{fontSize:10,marginTop:4,textAlign:'center'},
  balanceHint:{fontSize:13,lineHeight:18,marginTop:4},
  historialRow:{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:12,padding:14,marginBottom:8},
  historialTitle:{fontSize:15,fontWeight:'700'},
  historialMeta:{fontSize:12,marginTop:2},
  historialSub:{fontSize:11,marginTop:4},
  historialAmount:{fontSize:15,fontWeight:'800'},
  reservaCard:{borderWidth:1,borderRadius:12,padding:14,marginBottom:10},
  reservaTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:6},
  reservaName:{fontSize:16,fontWeight:'700',flex:1},
  reservaMeta:{fontSize:13,lineHeight:18},
  reservaMoneyRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},
  reservaAmount:{fontSize:13,fontWeight:'700'},
  reservaPaid:{fontSize:13,fontWeight:'600'},
  reservaDue:{fontSize:13,fontWeight:'700'},
  payTotalBtn:{marginTop:12,height:42,borderRadius:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  payTotalBtnTxt:{color:'#fff',fontWeight:'800',fontSize:13},
  emptyReservas:{textAlign:'center',marginTop:40,fontSize:15,paddingHorizontal:24},
  spaceChip:{paddingHorizontal:15,paddingVertical:10,borderRadius:20,borderWidth:1,marginRight:8,height:40,justifyContent:'center'},
  calBox:{borderRadius:12,padding:15,marginBottom:20,elevation:2},
  calHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:15},
  daysHeader:{flexDirection:'row',justifyContent:'space-around',marginBottom:10},
  dayHdrTxt:{width:30,textAlign:'center',fontSize:12,fontWeight:'bold'},
  daysGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start'},
  dayCell:{width:'14.28%',height:40,justifyContent:'center',alignItems:'center'},
  slotRow:{flexDirection:'row',alignItems:'center',padding:12,borderRadius:10,marginBottom:6},
  slotTime:{width:50,alignItems:'center'},
  slotDivider:{width:1,height:30,backgroundColor:'rgba(0,0,0,0.1)',marginHorizontal:10},
  fab:{position:'absolute',bottom:20,right:20,width:60,height:60,borderRadius:30,justifyContent:'center',alignItems:'center',elevation:5},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},
  modalContent:{borderTopLeftRadius:25,borderTopRightRadius:25,padding:25,paddingBottom:40,maxHeight:'85%'},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  modalTitle:{fontSize:20,fontWeight:'bold'},
  label:{fontSize:13,marginBottom:5,fontWeight:'600',marginLeft:4},
  row:{flexDirection:'row',marginBottom:10},
  input:{height:48,borderWidth:1,borderRadius:12,paddingHorizontal:15,marginBottom:15},
  saveBtn:{height:50,borderRadius:12,justifyContent:'center',alignItems:'center',flexDirection:'row'},
  saveBtnText:{color:'#fff',fontSize:16,fontWeight:'bold'},
  detailRow:{padding:14,borderRadius:12,marginBottom:10,flexDirection:'row',alignItems:'center'},
});
