import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PagerView from '../../components/AppPagerView';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../utils/api';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import { TABS, METODOS, MN, fmtMoney } from './finanzas/finanzasConstants';
import { finanzasStyles as s } from './finanzas/finanzasStyles';
import AtletasPagosTab from './finanzas/AtletasPagosTab';
import FamiliasTab from './finanzas/FamiliasTab';
import PlanesTab from './finanzas/PlanesTab';
import ComprobantesReviewTab from './finanzas/ComprobantesReviewTab';
import NominaTab from './finanzas/NominaTab';
import GastosTab from './finanzas/GastosTab';
import PaymentHistoryModal from './finanzas/PaymentHistoryModal';
import SelectPaymentsModal from '../../components/SelectPaymentsModal';
import PaymentPaySummary from '../../components/PaymentPaySummary';
import { useBadges } from '../../context/BadgeContext';
import BadgeDot from '../../components/BadgeDot';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { isClubOwnerRole, ADMIN_APP_ROLES } from '../../constants/appRoles';

const financeHeader = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  monthNavBtn: { padding: 4 },
  monthNavText: { color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 108, textAlign: 'center' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 28,
  },
  menuHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginBottom: 10 },
  menuTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 12, marginBottom: 6 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 12,
  },
  menuItemTxt: { flex: 1, fontSize: 15, fontWeight: '600' },
  menuDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12, marginVertical: 4 },
});

export default function FinanzasScreen({ route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';
  const { hub, refresh } = useBadges();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const finanzasTabBadge = (key) => {
    if (key === 'atletas') return hub('finanzasAtletas');
    return 0;
  };
  const revisionBadge = hub('finanzasRevision');

  const [tab, setTab] = useState(() => route?.params?.initialTab || 'atletas');
  const pagerRef = useRef(null);
  const openRevision = () => setTab('revision');
  const leaveRevision = () => selectMainTab('atletas');
  const openPlanes = () => setTab('planes');
  const leavePlanes = () => selectMainTab('atletas');
  const [viewerRol, setViewerRol] = useState('');
  const canManageClubFinances = isClubOwnerRole(viewerRol);
  const canRunPeriodActions = ADMIN_APP_ROLES.includes(viewerRol);
  const visibleTabs = canManageClubFinances
    ? TABS
    : TABS.filter((t) => t.key === 'atletas' || t.key === 'familias');
  const mainTabIndex = Math.max(
    0,
    visibleTabs.findIndex((t) => t.key === tab),
  );

  const selectMainTab = useCallback(
    (key) => {
      setTab(key);
      const idx = visibleTabs.findIndex((t) => t.key === key);
      if (idx >= 0) {
        try {
          pagerRef.current?.setPage(idx);
        } catch {
          /* pager not ready */
        }
      }
    },
    [visibleTabs],
  );
  const [periodBusy, setPeriodBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  useEffect(() => {
    const next = route?.params?.initialTab;
    if (next) setTab(next);
  }, [route?.params?.initialTab]);

  useEffect(() => {
    if (canManageClubFinances) return;
    if (tab === 'planes' || tab === 'nomina' || tab === 'gastos') selectMainTab('atletas');
  }, [canManageClubFinances, tab, selectMainTab]);

  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');

  const paymentsCacheKey =
    clubData?.urlIdentifier && tab === 'atletas'
      ? filtroEstado === 'vencido'
        ? `finanzas-atletas:${clubData.urlIdentifier}:vencidos:${debouncedBusqueda}`
        : `finanzas-atletas:${clubData.urlIdentifier}:${mes}:${anio}:${filtroEstado}:${debouncedBusqueda}`
      : '';

  const showMonthNav =
    (tab === 'atletas' && filtroEstado !== 'vencido') ||
    tab === 'familias' ||
    tab === 'nomina' ||
    tab === 'gastos';
  const showVencidosHeader = tab === 'atletas' && filtroEstado === 'vencido';
  const showCuotaPeriodActions =
    showMonthNav && canRunPeriodActions && tab !== 'nomina' && tab !== 'gastos';
  const showRevisionHeader = tab === 'revision';
  const showPlanesHeader = tab === 'planes';
  const hideMainTabs = showRevisionHeader || showPlanesHeader;

  const [athletes, setAthletes] = useState(() => readScreenCache(paymentsCacheKey)?.athletes ?? []);
  const PAYMENTS_PAGE_SIZE = 50;
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsHasMore, setPaymentsHasMore] = useState(false);
  const [loadingMorePayments, setLoadingMorePayments] = useState(false);
  const EMPTY_PAYMENT_STATS = {
    totalFacturado: 0,
    totalCobrado: 0,
    pendientes: 0,
    pagados: 0,
    vencidos: 0,
    porcentajeCobranza: 0,
    porcentajePrev: 0,
    totalCobradoPrev: 0,
  };
  const [paymentStats, setPaymentStats] = useState(EMPTY_PAYMENT_STATS);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  useEffect(() => {
    if (!paymentsCacheKey) return;
    const cached = readScreenCache(paymentsCacheKey);
    setAthletes(cached?.athletes ?? []);
    setPaymentsPage(cached?.page ?? 1);
    setPaymentsHasMore(cached?.hasMore ?? false);
  }, [paymentsCacheKey]);

  const [siblings, setSiblings] = useState([]);
  const [isLoadingSiblings, setIsLoadingSiblings] = useState(false);
  const FAMILIAS_PAGE_SIZE = 30;
  const [siblingsPage, setSiblingsPage] = useState(1);
  const [siblingsHasMore, setSiblingsHasMore] = useState(false);
  const [loadingMoreSiblings, setLoadingMoreSiblings] = useState(false);
  const [familiasBusqueda, setFamiliasBusqueda] = useState('');
  const [debouncedFamiliasBusqueda, setDebouncedFamiliasBusqueda] = useState('');
  const [globalFamilyDiscount, setGlobalFamilyDiscount] = useState(0);
  const [globalDiscountInput, setGlobalDiscountInput] = useState('0');
  const [isSavingGlobalDiscount, setIsSavingGlobalDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState({});

  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [selectPaymentsList, setSelectPaymentsList] = useState([]);
  const [selectSubtitle, setSelectSubtitle] = useState('');
  const [selectNameByAtleta, setSelectNameByAtleta] = useState({});

  const [payModal, setPayModal] = useState(false);
  const pendingPayModalRef = useRef(false);
  const [bulkPayments, setBulkPayments] = useState([]);
  const [bulkLabel, setBulkLabel] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [payMethod, setPayMethod] = useState('efectivo');
  const [payNotes, setPayNotes] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  const [historyModal, setHistoryModal] = useState(false);
  const [historyAtleta, setHistoryAtleta] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const [plans, setPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [disciplines, setDisciplines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoadingStructure, setIsLoadingStructure] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [planFormVisible, setPlanFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planNombre, setPlanNombre] = useState('');
  const [planMonto, setPlanMonto] = useState('');
  const [planDescripcion, setPlanDescripcion] = useState('');
  const [planDiaVenc, setPlanDiaVenc] = useState('10');
  const [planRecargoPct, setPlanRecargoPct] = useState('0');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    onConfirm: () => {},
    onCancel: () => {},
  });
  const showAlert = (t, m) =>
    setAlertConfig({
      visible: true,
      title: t,
      message: m,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBusqueda(filtroBusqueda.trim()), 550);
    return () => clearTimeout(t);
  }, [filtroBusqueda]);

  const isSearchPending = filtroBusqueda.trim() !== debouncedBusqueda;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFamiliasBusqueda(familiasBusqueda.trim()), 550);
    return () => clearTimeout(t);
  }, [familiasBusqueda]);

  const isFamiliasSearchPending = familiasBusqueda.trim() !== debouncedFamiliasBusqueda;

  const buildSiblingsUrl = useCallback(
    (page) => {
      let url = `/financial/siblings?mes=${mes}&anio=${anio}&page=${page}&limit=${FAMILIAS_PAGE_SIZE}`;
      if (debouncedFamiliasBusqueda) {
        url += `&search=${encodeURIComponent(debouncedFamiliasBusqueda)}`;
      }
      return url;
    },
    [mes, anio, debouncedFamiliasBusqueda],
  );

  const mergeFamiliasDiscountInput = useCallback((familias, reset = false) => {
    setDiscountInput((prev) => {
      const di = reset ? {} : { ...prev };
      familias.forEach((g) => {
        const pct = g.descuentoFamiliar ?? 0;
        di[g.tutor._id] = pct != null && pct !== '' ? String(pct) : '';
      });
      return di;
    });
  }, []);

  const buildPaymentStatsUrl = useCallback(() => {
    if (filtroEstado === 'vencido') return '/financial/payments/stats?scope=vencidos';
    return `/financial/payments/stats?mes=${mes}&anio=${anio}`;
  }, [mes, anio, filtroEstado]);

  const fetchPaymentStats = useCallback(async () => {
    if (tab !== 'atletas') return;
    setIsLoadingStats(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get(buildPaymentStatsUrl(), { headers: h });
      setPaymentStats(r.data || EMPTY_PAYMENT_STATS);
    } catch {
      setPaymentStats(EMPTY_PAYMENT_STATS);
    } finally {
      setIsLoadingStats(false);
    }
  }, [tab, buildPaymentStatsUrl, clubData?.urlIdentifier]);

  useEffect(() => {
    if (tab === 'atletas') fetchPaymentStats();
  }, [tab, mes, anio, filtroEstado, fetchPaymentStats]);

  const buildPaymentsUrl = useCallback(
    (page) => {
      let url = `/financial/payments?estado=${filtroEstado}&page=${page}&limit=${PAYMENTS_PAGE_SIZE}`;
      if (filtroEstado !== 'vencido') {
        url += `&mes=${mes}&anio=${anio}`;
      }
      if (debouncedBusqueda) url += `&search=${encodeURIComponent(debouncedBusqueda)}`;
      return url;
    },
    [mes, anio, filtroEstado, debouncedBusqueda],
  );

  const fetchPaymentsData = useCallback(async () => {
    const h = await getHeaders();
    const r = await clubApi.get(buildPaymentsUrl(1), { headers: h });
    return {
      athletes: r.data.athletes || [],
      page: r.data.page || 1,
      hasMore: r.data.hasMore ?? false,
    };
  }, [buildPaymentsUrl, clubData?.urlIdentifier]);

  const applyPayments = useCallback((data) => {
    setAthletes(data.athletes ?? []);
    setPaymentsPage(data.page ?? 1);
    setPaymentsHasMore(data.hasMore ?? false);
  }, []);

  const loadMorePayments = useCallback(async () => {
    if (loadingMorePayments || !paymentsHasMore) return;
    setLoadingMorePayments(true);
    try {
      const h = await getHeaders();
      const nextPage = paymentsPage + 1;
      const r = await clubApi.get(buildPaymentsUrl(nextPage), { headers: h });
      const more = r.data.athletes || [];
      setAthletes((prev) => [...prev, ...more]);
      setPaymentsPage(r.data.page ?? nextPage);
      setPaymentsHasMore(r.data.hasMore ?? false);
    } catch {
      showAlert('Error', 'No se pudieron cargar más atletas.');
    } finally {
      setLoadingMorePayments(false);
    }
  }, [loadingMorePayments, paymentsHasMore, paymentsPage, buildPaymentsUrl, clubData?.urlIdentifier]);

  const {
    loading: isLoadingPay,
    refreshing,
    onRefresh: refreshPayments,
    reload: reloadPayments,
  } = useCachedFocusLoad({
    cacheKey: paymentsCacheKey,
    enabled: !!paymentsCacheKey,
    fetchData: fetchPaymentsData,
    onFetched: applyPayments,
    onFetchError: () => {
      showAlert('Error', 'No se pudieron cargar los pagos.');
    },
  });

  const showPaymentsLoading = isLoadingPay && athletes.length === 0;
  const isRefreshingPayments = isLoadingPay && athletes.length > 0;

  const [otherTabRefreshing, setOtherTabRefreshing] = useState(false);
  const tabRefreshing = tab === 'atletas' ? refreshing : otherTabRefreshing;

  const fetchSiblingsFirstPage = useCallback(async () => {
    setIsLoadingSiblings(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get(buildSiblingsUrl(1), { headers: h });
      const familias = r.data.familias || [];
      const globalPct = r.data.globalDescuento ?? 0;
      setSiblings(familias);
      setGlobalFamilyDiscount(globalPct);
      setGlobalDiscountInput(String(globalPct));
      mergeFamiliasDiscountInput(familias, true);
      setSiblingsPage(r.data.page ?? 1);
      setSiblingsHasMore(r.data.hasMore ?? false);
    } catch {
      showAlert('Error', 'No se pudieron cargar las familias.');
    } finally {
      setIsLoadingSiblings(false);
    }
  }, [buildSiblingsUrl, clubData?.urlIdentifier, mergeFamiliasDiscountInput]);

  const loadMoreSiblings = useCallback(async () => {
    if (loadingMoreSiblings || !siblingsHasMore) return;
    setLoadingMoreSiblings(true);
    try {
      const h = await getHeaders();
      const page = siblingsPage + 1;
      const r = await clubApi.get(buildSiblingsUrl(page), { headers: h });
      const familias = r.data.familias || [];
      setSiblings((prev) => [...prev, ...familias]);
      mergeFamiliasDiscountInput(familias);
      setSiblingsPage(r.data.page ?? page);
      setSiblingsHasMore(r.data.hasMore ?? false);
    } catch {
      showAlert('Error', 'No se pudieron cargar más familias.');
    } finally {
      setLoadingMoreSiblings(false);
    }
  }, [
    buildSiblingsUrl,
    clubData?.urlIdentifier,
    loadingMoreSiblings,
    siblingsHasMore,
    siblingsPage,
    mergeFamiliasDiscountInput,
  ]);

  useEffect(() => {
    if (tab === 'familias') fetchSiblingsFirstPage();
  }, [mes, anio, tab, debouncedFamiliasBusqueda, fetchSiblingsFirstPage]);

  useEffect(() => {
    if (tab === 'planes') {
      fetchPlans();
      fetchStructure();
    }
  }, [tab]);

  const fetchPayments = async (opts = {}) => {
    const { skipListLoading = false } = opts;
    if (skipListLoading) {
      await reloadPayments({ background: true });
      return;
    }
    await reloadPayments();
  };

  const fetchPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.get('/financial/plans', { headers: h });
      setPlans(r.data || []);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los planes.');
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const fetchStructure = async () => {
    setIsLoadingStructure(true);
    try {
      const h = await getHeaders();
      const [discRes, catRes] = await Promise.all([
        clubApi.get('/disciplines', { headers: h }),
        clubApi.get('/categories', { headers: h }),
      ]);
      setDisciplines(discRes.data || []);
      setCategories(catRes.data || []);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar disciplinas y categorías.');
    } finally {
      setIsLoadingStructure(false);
    }
  };

  const openPlanForm = (plan = null) => {
    setEditingPlan(plan);
    setPlanNombre(plan?.nombre || '');
    setPlanMonto(plan?.monto != null ? String(plan.monto) : '');
    setPlanDescripcion(plan?.descripcion || '');
    setPlanDiaVenc(plan?.diaVencimiento != null ? String(plan.diaVencimiento) : '10');
    setPlanRecargoPct(
      plan?.porcentajeRecargo != null && plan.porcentajeRecargo !== ''
        ? String(plan.porcentajeRecargo)
        : '0'
    );
    setPlanFormVisible(true);
  };

  const savePlan = async () => {
    const nombre = planNombre.trim();
    const monto = parseFloat(String(planMonto).replace(',', '.'));
    const dia = parseInt(planDiaVenc, 10);
    const recargo = parseInt(planRecargoPct, 10);
    if (!nombre) return showAlert('Error', 'Poné un nombre para el plan.');
    if (isNaN(monto) || monto < 0) return showAlert('Error', 'Revisá el monto.');
    if (isNaN(dia) || dia < 1 || dia > 28) return showAlert('Error', 'El día de vencimiento tiene que estar entre 1 y 28.');
    if (isNaN(recargo) || recargo < 0 || recargo > 100) {
      return showAlert('Error', 'Recargo por vencimiento: porcentaje entre 0 y 100.');
    }

    setIsSavingPlan(true);
    try {
      const h = await getHeaders();
      const body = {
        nombre,
        monto,
        descripcion: planDescripcion.trim() || undefined,
        diaVencimiento: dia,
        porcentajeRecargo: recargo,
      };
      if (editingPlan?._id) {
        await clubApi.put(`/financial/plans/${editingPlan._id}`, body, { headers: h });
        showAlert('Éxito', 'Plan actualizado.');
      } else {
        await clubApi.post('/financial/plans', body, { headers: h });
        showAlert('Éxito', 'Plan creado.');
      }
      setPlanFormVisible(false);
      fetchPlans();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el plan.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const archivePlan = (plan) => {
    setAlertConfig({
      visible: true,
      title: 'Archivar plan',
      message: `¿Archivamos "${plan.nombre}"? No se va a asignar a inscripciones nuevas.`,
      showCancel: true,
      isDanger: true,
      confirmText: 'Archivar',
      onConfirm: async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        try {
          const h = await getHeaders();
          await clubApi.delete(`/financial/plans/${plan._id}`, { headers: h });
          showAlert('Listo', 'Plan archivado.');
          fetchPlans();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo archivar.');
        }
      },
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const reactivatePlan = async (plan) => {
    try {
      const h = await getHeaders();
      await clubApi.patch(`/financial/plans/${plan._id}/reactivate`, {}, { headers: h });
      showAlert('Listo', 'Plan reactivado.');
      fetchPlans();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo reactivar.');
    }
  };

  const assignPlan = async (targetType, targetId, planId) => {
    setIsSavingAssignment(true);
    try {
      const h = await getHeaders();
      const body = { planDefault: planId || null };
      if (targetType === 'discipline') {
        const disc = disciplines.find((d) => String(d._id) === String(targetId));
        await clubApi.put(
          `/disciplines/${targetId}`,
          { nombre: disc?.nombre, planDefault: planId || null },
          { headers: h }
        );
      } else {
        await clubApi.put(`/categories/${targetId}`, body, { headers: h });
      }
      showAlert('Éxito', 'Plan asignado.');
      await fetchStructure();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo asignar el plan.');
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      tab === 'atletas' ? reloadPayments({ background: true }) : Promise.resolve(),
      tab === 'atletas' ? fetchPaymentStats() : Promise.resolve(),
      tab === 'familias' ? fetchSiblingsFirstPage() : Promise.resolve(),
      tab === 'planes' ? Promise.all([fetchPlans(), fetchStructure()]) : Promise.resolve(),
    ]);
  };

  const onRefresh = async () => {
    if (tab === 'atletas') {
      await Promise.all([refreshPayments(), fetchPaymentStats()]);
      return;
    }
    setOtherTabRefreshing(true);
    try {
      if (tab === 'familias') await fetchSiblingsFirstPage();
      if (tab === 'planes') await Promise.all([fetchPlans(), fetchStructure()]);
    } finally {
      setOtherTabRefreshing(false);
    }
  };

  const saveGlobalFamilyDiscount = async () => {
    const pct = parseInt(globalDiscountInput, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) return showAlert('Error', 'Porcentaje inválido (0-100).');
    setIsSavingGlobalDiscount(true);
    try {
      const h = await getHeaders();
      const r = await clubApi.patch('/financial/family-discount/global', { porcentaje: pct }, { headers: h });
      setGlobalFamilyDiscount(r.data.descuentoFamiliarGlobal ?? pct);
      setGlobalDiscountInput(String(r.data.descuentoFamiliarGlobal ?? pct));
      showAlert('Éxito', r.data.message);
      fetchSiblingsFirstPage();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setIsSavingGlobalDiscount(false);
    }
  };

  const applyDiscount = async (tutorId) => {
    const pct = parseInt(discountInput[tutorId], 10);
    if (isNaN(pct) || pct < 0 || pct > 100) return showAlert('Error', 'Porcentaje inválido (0-100).');
    try {
      const h = await getHeaders();
      const r = await clubApi.patch('/financial/siblings/discount', { tutorId, porcentaje: pct }, { headers: h });
      showAlert('Éxito', r.data.message);
      fetchSiblingsFirstPage();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo aplicar.');
    }
  };

  const buildNameMap = (hijos = []) => {
    const map = {};
    hijos.forEach((h) => {
      map[String(h._id)] = `${h.nombre || ''} ${h.apellido || ''}`.trim();
    });
    return map;
  };

  const openSelectPayments = (cuotas, subtitle, hijos = []) => {
    const payables = (cuotas || []).filter((p) => ['pendiente', 'vencido'].includes(p.estado));
    if (!payables.length) return;
    setSelectPaymentsList(payables);
    setSelectSubtitle(subtitle);
    setSelectNameByAtleta(buildNameMap(hijos));
    setSelectModalOpen(true);
  };

  const closePayModal = () => {
    setPayModal(false);
    setBulkPayments([]);
    setBulkLabel('');
    setSelectedPayment(null);
  };

  const showPayModal = () => {
    if (Platform.OS === 'ios' && (selectModalOpen || historyModal)) {
      pendingPayModalRef.current = true;
      setSelectModalOpen(false);
      setHistoryModal(false);
      return;
    }
    setPayModal(true);
  };

  const handleNestedModalDismissed = () => {
    if (!pendingPayModalRef.current) return;
    pendingPayModalRef.current = false;
    setPayModal(true);
  };

  const confirmSelectedPayments = (selected) => {
    if (!selected?.length) return;
    setBulkPayments(selected);
    setBulkLabel(selectSubtitle);
    setSelectedPayment(selected.length === 1 ? selected[0] : null);
    setPayMethod('efectivo');
    setPayNotes('');
    if (Platform.OS === 'ios') {
      pendingPayModalRef.current = true;
      setSelectModalOpen(false);
    } else {
      setSelectModalOpen(false);
      setPayModal(true);
    }
  };

  const openPayModal = (p, atletaCtx) => {
    const a = atletaCtx || p?.atleta || historyAtleta;
    const payment = a ? { ...p, atleta: a } : p;
    setSelectedPayment(payment);
    setBulkPayments([]);
    setBulkLabel('');
    setPayMethod('efectivo');
    setPayNotes('');
    showPayModal();
  };

  const paymentSelectLabel = (p) => {
    const aid = String(p.atleta?._id || p.atleta || '');
    const nombre = selectNameByAtleta[aid];
    const meses = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ];
    const periodo = `${meses[(p.mes || 1) - 1]} ${p.anio}`;
    const plan = p.plan?.nombre || 'Cuota';
    if (nombre) return `${nombre} · ${periodo} · ${plan}`;
    return `${periodo} · ${plan}`;
  };

  const openHistory = (atleta) => {
    setHistoryAtleta(atleta);
    setHistoryModal(true);
  };

  const handleRegisterPay = async () => {
    setIsPaying(true);
    try {
      const h = await getHeaders();
      if (bulkPayments.length > 0) {
        if (bulkPayments.length === 1) {
          await clubApi.patch(
            `/financial/payments/${bulkPayments[0]._id}/pay`,
            { metodoPago: payMethod, notasAdmin: payNotes },
            { headers: h },
          );
          showAlert('Éxito', 'Pago registrado correctamente.');
        } else {
          const r = await clubApi.patch(
            '/financial/payments/pay-bulk',
            {
              paymentIds: bulkPayments.map((p) => p._id),
              metodoPago: payMethod,
              notasAdmin: payNotes,
            },
            { headers: h },
          );
          showAlert('Éxito', r.data.message);
        }
        closePayModal();
        await refreshAll();
        setHistoryRefresh((k) => k + 1);
      } else if (selectedPayment) {
        await clubApi.patch(
          `/financial/payments/${selectedPayment._id}/pay`,
          { metodoPago: payMethod, notasAdmin: payNotes },
          { headers: h },
        );
        closePayModal();
        await refreshAll();
        setHistoryRefresh((k) => k + 1);
        showAlert('Éxito', 'Pago registrado correctamente.');
      }
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo registrar.');
    } finally {
      setIsPaying(false);
    }
  };

  const chgMonth = (d) => {
    let m = mes + d;
    let a = anio;
    if (m > 12) {
      m = 1;
      a++;
    }
    if (m < 1) {
      m = 12;
      a--;
    }
    setMes(m);
    setAnio(a);
  };

  const runGenerateMonth = () => {
    setAlertConfig({
      visible: true,
      title: 'Generar cuotas',
      message: `¿Generamos las cuotas de ${MN[mes - 1]} ${anio} para las inscripciones activas con plan? Las que ya están creadas se dejan como están.`,
      showCancel: true,
      confirmText: 'Generar',
      onConfirm: async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        setPeriodBusy(true);
        try {
          const h = await getHeaders();
          const { data } = await clubApi.post(
            '/financial/payments/generate',
            { mes, anio },
            { headers: h },
          );
          const st = data?.estadisticas || {};
          showAlert(
            'Listo',
            `Creadas: ${st.cuotasCreadas || 0}. Omitidas: ${st.cuotasOmitidas || 0}. Sin plan: ${st.inscripcionesSinPlan || 0}.`,
          );
          await fetchPayments();
          refresh?.();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudieron generar las cuotas.');
        } finally {
          setPeriodBusy(false);
        }
      },
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const runCheckOverdue = () => {
    setAlertConfig({
      visible: true,
      title: 'Chequear vencidos',
      message: '¿Marcamos como vencidas las cuotas pendientes cuya fecha ya pasó? Si el plan tiene recargo, se aplica.',
      showCancel: true,
      confirmText: 'Chequear',
      onConfirm: async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        setPeriodBusy(true);
        try {
          const h = await getHeaders();
          const { data } = await clubApi.post('/financial/payments/check-overdue', {}, { headers: h });
          showAlert('Listo', data?.message || `Vencidas: ${data?.vencidas || 0}.`);
          await fetchPayments();
          refresh?.();
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo chequear vencidos.');
        } finally {
          setPeriodBusy(false);
        }
      },
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const runAvisarMorosos = () => {
    setAlertConfig({
      visible: true,
      title: 'Avisar morosos',
      message:
        'Se enviará un aviso (app + push) a tutores/atletas con cuotas vencidas. Se reenvía aunque ya hayan recibido uno antes.',
      showCancel: true,
      confirmText: 'Avisar',
      onConfirm: async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        setPeriodBusy(true);
        try {
          const h = await getHeaders();
          const { data } = await clubApi.post(
            '/financial/notifications/send-reminders',
            { force: true, onlyVencidas: true, morosos: true },
            { headers: h },
          );
          showAlert('Listo', data?.message || 'Avisos enviados.');
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudieron enviar los avisos.');
        } finally {
          setPeriodBusy(false);
        }
      },
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const runReconcileMp = () => {
    setAlertConfig({
      visible: true,
      title: 'Sincronizar Mercado Pago',
      message:
        'Buscamos pagos aprobados en Mercado Pago que todavía figuren como pendientes en el club y los marcamos como pagados.',
      showCancel: true,
      confirmText: 'Sincronizar',
      onConfirm: async () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        setPeriodBusy(true);
        try {
          const h = await getHeaders();
          const { data } = await clubApi.post(
            '/mercadopago/reconcile-payments',
            { days: 30 },
            { headers: h },
          );
          showAlert('Listo', data?.message || 'Sincronización terminada.');
          await fetchPayments();
          refresh?.();
        } catch (e) {
          showAlert(
            'Error',
            e.response?.data?.message || 'No se pudo sincronizar con Mercado Pago.',
          );
        } finally {
          setPeriodBusy(false);
        }
      },
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const paymentsToPay = bulkPayments.length > 0 ? bulkPayments : selectedPayment ? [selectedPayment] : [];

  const summaryLineLabel = (p) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const periodo = `${meses[(p.mes || 1) - 1]} ${p.anio}`;
    const plan = p.plan?.nombre || 'Cuota';
    const cat = p.categoria?.nombre ? ` · ${p.categoria.nombre}` : '';
    const aid = String(p.atleta?._id || p.atleta || '');
    const nombre = p.atleta?.nombre
      ? `${p.atleta.nombre} ${p.atleta.apellido || ''}`.trim()
      : selectNameByAtleta[aid];
    if (nombre) return `${nombre} · ${periodo} · ${plan}${cat}`;
    return `${periodo} · ${plan}${cat}`;
  };

  const renderPayModalContent = () => (
    <>
      <View style={s.modalHeader}>
        <Text style={[s.modalTitle, { color: theme.text }]}>
          {paymentsToPay.length > 1 ? 'Registrar pagos' : 'Registrar Pago'}
        </Text>
        <TouchableOpacity onPress={closePayModal}>
          <Ionicons name="close" size={28} color={theme.icon} />
        </TouchableOpacity>
      </View>

      <PaymentPaySummary
        title={bulkLabel || undefined}
        subtitle={
          paymentsToPay.length > 1
            ? `${paymentsToPay.length} cuotas seleccionadas`
            : undefined
        }
        payments={paymentsToPay}
        getLineLabel={summaryLineLabel}
        theme={theme}
        primaryColor={cc}
        maxListHeight={paymentsToPay.length > 3 ? 220 : 120}
      />
      <Text style={[s.label, { color: theme.textMuted }]}>Método de Pago</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
        {METODOS.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[
              s.filterChip,
              {
                backgroundColor: payMethod === m.value ? cc : theme.background,
                borderColor: payMethod === m.value ? cc : theme.border,
              },
            ]}
            onPress={() => setPayMethod(m.value)}
          >
            <Ionicons name={m.icon} size={14} color={payMethod === m.value ? '#fff' : cc} style={{ marginRight: 4 }} />
            <Text style={{ color: payMethod === m.value ? '#fff' : theme.text, fontSize: 12 }}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[s.label, { color: theme.textMuted }]}>Notas (opcional)</Text>
      <TextInput
        style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
        placeholder="Observaciones"
        placeholderTextColor={theme.textMuted}
        value={payNotes}
        onChangeText={setPayNotes}
      />
      <TouchableOpacity
        style={[s.saveBtn, { backgroundColor: '#10b981' }]}
        onPress={handleRegisterPay}
        disabled={isPaying}
      >
        {isPaying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.saveBtnTxt}>
              {paymentsToPay.length > 1 ? 'Confirmar pagos' : 'Confirmar Pago'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AdminScreenHeader
        theme={theme}
        colorMarca={cc}
        kicker="Finanzas"
        title={showRevisionHeader ? 'Revisión' : showPlanesHeader ? 'Planes' : 'Pagos'}
        subtitle={
          showRevisionHeader
            ? 'Comprobantes pendientes'
            : showPlanesHeader
              ? 'Planes de cuota'
              : showVencidosHeader
                ? 'Todas las cuotas vencidas'
                : undefined
        }
        onBack={
          showRevisionHeader || showPlanesHeader
            ? showPlanesHeader
              ? leavePlanes
              : leaveRevision
            : undefined
        }
        rightAccessory={
          <TouchableOpacity
            style={financeHeader.iconBtn}
            onPress={() => setMoreOpen(true)}
            accessibilityLabel="Más acciones"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            {revisionBadge > 0 && !showRevisionHeader ? (
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#ef4444',
                  borderWidth: 1,
                  borderColor: '#fff',
                }}
              />
            ) : null}
          </TouchableOpacity>
        }
        bottomRightAccessory={
          showMonthNav ? (
            <View style={financeHeader.monthRow}>
              <TouchableOpacity
                style={financeHeader.monthNavBtn}
                onPress={() => chgMonth(-1)}
                accessibilityLabel="Mes anterior"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={financeHeader.monthNavText} numberOfLines={1}>
                {MN[mes - 1]} {anio}
              </Text>
              <TouchableOpacity
                style={financeHeader.monthNavBtn}
                onPress={() => chgMonth(1)}
                accessibilityLabel="Mes siguiente"
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={financeHeader.menuOverlay} onPress={() => setMoreOpen(false)}>
          <Pressable style={[financeHeader.menuSheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={financeHeader.menuHandle} />
            <Text style={[financeHeader.menuTitle, { color: theme.text }]}>Acciones</Text>
            {!showRevisionHeader ? (
              <TouchableOpacity
                style={financeHeader.menuItem}
                onPress={() => {
                  setMoreOpen(false);
                  openRevision();
                }}
              >
                <Ionicons name="document-attach-outline" size={20} color={cc} />
                <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Revisión de comprobantes</Text>
                <BadgeDot count={revisionBadge} />
              </TouchableOpacity>
            ) : null}
            {canManageClubFinances && !showPlanesHeader ? (
              <TouchableOpacity
                style={financeHeader.menuItem}
                onPress={() => {
                  setMoreOpen(false);
                  openPlanes();
                }}
              >
                <Ionicons name="document-text-outline" size={20} color={cc} />
                <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Planes de cuota</Text>
              </TouchableOpacity>
            ) : null}
            {canRunPeriodActions && (showCuotaPeriodActions || showVencidosHeader) ? (
              <View style={[financeHeader.menuDivider, { backgroundColor: theme.border }]} />
            ) : null}
            {canRunPeriodActions && showCuotaPeriodActions ? (
              <>
                <TouchableOpacity
                  style={financeHeader.menuItem}
                  disabled={periodBusy}
                  onPress={() => {
                    setMoreOpen(false);
                    runGenerateMonth();
                  }}
                >
                  <Ionicons name="flash-outline" size={20} color={cc} />
                  <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Generar cuotas del mes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={financeHeader.menuItem}
                  disabled={periodBusy}
                  onPress={() => {
                    setMoreOpen(false);
                    runCheckOverdue();
                  }}
                >
                  <Ionicons name="alert-circle-outline" size={20} color={cc} />
                  <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Chequear vencidos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={financeHeader.menuItem}
                  disabled={periodBusy}
                  onPress={() => {
                    setMoreOpen(false);
                    runAvisarMorosos();
                  }}
                >
                  <Ionicons name="notifications-outline" size={20} color={cc} />
                  <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Avisar morosos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={financeHeader.menuItem}
                  disabled={periodBusy}
                  onPress={() => {
                    setMoreOpen(false);
                    runReconcileMp();
                  }}
                >
                  <Ionicons name="sync-outline" size={20} color={cc} />
                  <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Sincronizar Mercado Pago</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {canRunPeriodActions && showVencidosHeader && !showCuotaPeriodActions ? (
              <TouchableOpacity
                style={financeHeader.menuItem}
                disabled={periodBusy}
                onPress={() => {
                  setMoreOpen(false);
                  runAvisarMorosos();
                }}
              >
                <Ionicons name="notifications-outline" size={20} color={cc} />
                <Text style={[financeHeader.menuItemTxt, { color: theme.text }]}>Avisar morosos</Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {!hideMainTabs ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ borderBottomWidth: 1, borderBottomColor: theme.border, flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: 8,
              flexGrow: 1,
              justifyContent: visibleTabs.length <= 2 ? 'center' : 'flex-start',
            }}
          >
            {visibleTabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[
                  s.tab,
                  { flex: 0, paddingHorizontal: 14, minWidth: 88 },
                  tab === t.key && { borderBottomColor: cc, borderBottomWidth: 2 },
                ]}
                onPress={() => selectMainTab(t.key)}
              >
                <Ionicons name={t.icon} size={18} color={tab === t.key ? cc : theme.textMuted} />
                <Text
                  style={[
                    s.tabLabel,
                    {
                      color: tab === t.key ? cc : theme.textMuted,
                      fontWeight: tab === t.key ? 'bold' : 'normal',
                    },
                  ]}
                >
                  {t.label}
                </Text>
                <BadgeDot count={finanzasTabBadge(t.key)} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          <PagerView
            key={visibleTabs.map((t) => t.key).join('-')}
            ref={pagerRef}
            style={{ flex: 1 }}
            initialPage={mainTabIndex}
            onPageSelected={(e) => {
              const next = visibleTabs[e.nativeEvent.position];
              if (next?.key && next.key !== tab) setTab(next.key);
            }}
          >
            {visibleTabs.map((t) => (
              <View key={t.key} style={{ flex: 1 }} collapsable={false}>
                {t.key === 'atletas' ? (
                  <AtletasPagosTab
                    theme={theme}
                    primaryColor={cc}
                    mes={mes}
                    anio={anio}
                    athletes={athletes}
                    isLoadingPay={showPaymentsLoading}
                    isRefreshingPayments={isRefreshingPayments}
                    filtroBusqueda={filtroBusqueda}
                    setFiltroBusqueda={setFiltroBusqueda}
                    filtroEstado={filtroEstado}
                    setFiltroEstado={setFiltroEstado}
                    isSearchPending={isSearchPending}
                    refreshing={tabRefreshing}
                    onRefresh={onRefresh}
                    onPay={openPayModal}
                    onSelectPayments={(cuotas, subtitle, hijos) =>
                      openSelectPayments(cuotas, subtitle, hijos || [])
                    }
                    onHistory={openHistory}
                    hasMorePayments={paymentsHasMore}
                    loadingMorePayments={loadingMorePayments}
                    onLoadMorePayments={loadMorePayments}
                    paymentStats={paymentStats}
                    isLoadingStats={isLoadingStats}
                  />
                ) : null}
                {t.key === 'familias' ? (
                  <FamiliasTab
                    theme={theme}
                    primaryColor={cc}
                    mes={mes}
                    anio={anio}
                    siblings={siblings}
                    isLoading={isLoadingSiblings && siblings.length === 0}
                    isRefreshing={isLoadingSiblings && siblings.length > 0}
                    filtroBusqueda={familiasBusqueda}
                    setFiltroBusqueda={setFamiliasBusqueda}
                    isSearchPending={isFamiliasSearchPending}
                    refreshing={tabRefreshing}
                    onRefresh={onRefresh}
                    hasMoreFamilias={siblingsHasMore}
                    loadingMoreFamilias={loadingMoreSiblings}
                    onLoadMoreFamilias={loadMoreSiblings}
                    globalDiscount={globalFamilyDiscount}
                    globalDiscountInput={globalDiscountInput}
                    onGlobalDiscountChange={setGlobalDiscountInput}
                    onSaveGlobalDiscount={saveGlobalFamilyDiscount}
                    isSavingGlobalDiscount={isSavingGlobalDiscount}
                    discountInput={discountInput}
                    onDiscountChange={(tutorId, v) => setDiscountInput({ ...discountInput, [tutorId]: v })}
                    onApplyDiscount={applyDiscount}
                    onPayCuota={(p, h) => openPayModal(p, h)}
                    onSelectPayments={(cuotas, subtitle, hijos) =>
                      openSelectPayments(cuotas, subtitle, hijos || [])
                    }
                    onHistoryAtleta={openHistory}
                    canManageDiscounts={canManageClubFinances}
                  />
                ) : null}
                {t.key === 'nomina' ? (
                  <NominaTab
                    clubData={clubData}
                    theme={theme}
                    primaryColor={cc}
                    getHeaders={getHeaders}
                    showAlert={showAlert}
                    mes={mes}
                    anio={anio}
                  />
                ) : null}
                {t.key === 'gastos' ? (
                  <GastosTab
                    clubData={clubData}
                    theme={theme}
                    primaryColor={cc}
                    getHeaders={getHeaders}
                    showAlert={showAlert}
                    mes={mes}
                    anio={anio}
                  />
                ) : null}
              </View>
            ))}
          </PagerView>
        </>
      ) : null}

      {tab === 'revision' && (
        <ComprobantesReviewTab
          clubData={clubData}
          theme={theme}
          primaryColor={cc}
          getHeaders={getHeaders}
          showAlert={showAlert}
        />
      )}

      {tab === 'planes' && (
        <PlanesTab
          clubData={clubData}
          getHeaders={getHeaders}
          showAlert={showAlert}
          mes={mes}
          anio={anio}
          canEditSocialFee={canManageClubFinances}
          theme={theme}
          primaryColor={cc}
          plans={plans}
          isLoadingPlans={isLoadingPlans}
          disciplines={disciplines}
          categories={categories}
          isLoadingStructure={isLoadingStructure}
          refreshing={tabRefreshing}
          onRefresh={onRefresh}
          onCreatePlan={() => openPlanForm(null)}
          onEditPlan={openPlanForm}
          onArchivePlan={archivePlan}
          onReactivatePlan={reactivatePlan}
          onAssignPlan={assignPlan}
          isSavingAssignment={isSavingAssignment}
        />
      )}

      <SelectPaymentsModal
        visible={selectModalOpen}
        onClose={() => setSelectModalOpen(false)}
        title="Elegir cuotas a pagar"
        subtitle={selectSubtitle}
        payments={selectPaymentsList}
        getPaymentLabel={paymentSelectLabel}
        theme={theme}
        primaryColor={cc}
        onConfirm={confirmSelectedPayments}
        onDismiss={handleNestedModalDismissed}
      />

      <PaymentHistoryModal
        visible={historyModal}
        onClose={() => {
          setHistoryModal(false);
          setHistoryAtleta(null);
        }}
        atleta={historyAtleta}
        getHeaders={getHeaders}
        theme={theme}
        primaryColor={cc}
        refreshKey={historyRefresh}
        onPay={(p) => openPayModal(p, historyAtleta)}
        onDismiss={handleNestedModalDismissed}
      />

      <Modal
        visible={payModal}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={closePayModal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <SafeAreaView
              edges={['bottom']}
              style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '92%' }]}
            >
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {renderPayModalContent()}
              </ScrollView>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={planFormVisible} animationType="slide" transparent onRequestClose={() => setPlanFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <View style={[s.modalContent, { backgroundColor: theme.surface }]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: theme.text }]}>
                  {editingPlan ? 'Editar plan' : 'Nuevo plan'}
                </Text>
                <TouchableOpacity onPress={() => setPlanFormVisible(false)}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Nombre</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej: Cuota mensual U19"
                placeholderTextColor={theme.textMuted}
                value={planNombre}
                onChangeText={setPlanNombre}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Monto ($)</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej: 15000"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                value={planMonto}
                onChangeText={setPlanMonto}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Día de vencimiento (1-28)</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="10"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                value={planDiaVenc}
                onChangeText={setPlanDiaVenc}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Recargo por vencimiento (%)</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8, marginLeft: 4, lineHeight: 17 }}>
                Al vencer la cuota, se suma este porcentaje sobre el monto con descuentos ya aplicados.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                <TextInput
                  style={[
                    s.input,
                    { flex: 1, marginBottom: 0, backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                  ]}
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  value={planRecargoPct}
                  onChangeText={setPlanRecargoPct}
                />
                <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 16, marginLeft: 10 }}>%</Text>
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Descripción (opcional)</Text>
              <TextInput
                style={[
                  s.input,
                  s.textArea,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Notas internas del plan"
                placeholderTextColor={theme.textMuted}
                multiline
                value={planDescripcion}
                onChangeText={setPlanDescripcion}
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, opacity: isSavingPlan ? 0.6 : 1 }]}
                onPress={savePlan}
                disabled={isSavingPlan}
              >
                {isSavingPlan ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnTxt}>{editingPlan ? 'Guardar cambios' : 'Crear plan'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
        onConfirm={alertConfig.onConfirm}
        cancelText={alertConfig.cancelText}
        onCancel={alertConfig.onCancel}
      />
    </SafeAreaView>
  );
}
