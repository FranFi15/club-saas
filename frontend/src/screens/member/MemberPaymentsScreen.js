import React, { useCallback, useContext, useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Linking,
  SectionList,
  AppState,
  ScrollView,
} from 'react-native';
import { runAfterIosModalDismiss } from '../../utils/iosModalChain';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import { downloadPaymentReceipt } from '../../utils/paymentReceipt';
import { clubHeaders } from '../athlete/athleteApi';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { MIN_AGE_SELF_PAY } from '../../utils/ageHelper';
import { useBadgesOptional } from '../../context/BadgeContext';
import SelectPaymentsModal from '../../components/SelectPaymentsModal';
import MemberPayFlowModal from '../../components/MemberPayFlowModal';
import { subscribeMercadoPagoDeepLinks } from '../../utils/mpDeepLinks';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const EC = { pendiente: '#f59e0b', pagado: '#10b981', vencido: '#ef4444', en_revision: '#6366f1' };
const ESTADO_LABEL = {
  pendiente: 'pendiente',
  pagado: 'pagado',
  vencido: 'vencido',
  en_revision: 'en revisión del club',
};

export default function MemberPaymentsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const {
    isTutor,
    isSocio,
    memberId,
    puedePagar,
    cuotasEnApp,
    loading: memberLoading,
    profile,
  } = useMember();
  const badges = useBadgesOptional();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const paymentsCacheKey =
    clubData?.urlIdentifier && (isTutor || memberId)
      ? `member-payments:${clubData.urlIdentifier}:${isTutor ? 'tutor' : memberId}`
      : '';

  const [list, setList] = useState(() => readScreenCache(paymentsCacheKey)?.list ?? []);
  const [familyData, setFamilyData] = useState(() => readScreenCache(paymentsCacheKey)?.familyData ?? null);
  const [stats, setStats] = useState(() => readScreenCache(paymentsCacheKey)?.stats ?? {});
  const [mercadoPagoReady, setMercadoPagoReady] = useState(
    () => readScreenCache(paymentsCacheKey)?.mercadoPagoReady ?? false,
  );
  const [datosTransferencia, setDatosTransferencia] = useState(
    () => readScreenCache(paymentsCacheKey)?.datosTransferencia ?? null,
  );
  /** Tutor: 'all' | atletaId */
  const [cuotasFilterId, setCuotasFilterId] = useState('all');
  const [payingId, setPayingId] = useState(null);
  const [payingSelected, setPayingSelected] = useState(false);
  const [downloadingReciboId, setDownloadingReciboId] = useState(null);
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [payFlowOpen, setPayFlowOpen] = useState(false);
  const [pendingPayPayments, setPendingPayPayments] = useState([]);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const showCuotas = isTutor || cuotasEnApp;

  const applyPayments = useCallback((data) => {
    setList(data.list);
    setFamilyData(data.familyData);
    setStats(data.stats);
    setMercadoPagoReady(!!data.mercadoPagoReady);
    setDatosTransferencia(data.datosTransferencia ?? null);
  }, []);

  const fetchPayments = useCallback(async () => {
    if (!isTutor && !cuotasEnApp) {
      return { list: [], familyData: null, stats: {}, mercadoPagoReady: false, datosTransferencia: null };
    }
    if (!clubData?.urlIdentifier) {
      return { list: [], familyData: null, stats: {}, mercadoPagoReady: false, datosTransferencia: null };
    }
    const h = await clubHeaders(clubData);
    if (isTutor) {
      const res = await clubApi.get('/financial/payments/tutor-family', { headers: h });
      return {
        list: [],
        familyData: res.data,
        stats: res.data.stats || {},
        mercadoPagoReady: !!res.data.mercadoPagoReady,
        datosTransferencia: res.data.datosTransferencia ?? null,
      };
    }
    if (memberId) {
      const res = await clubApi.get(`/financial/payments/atleta/${memberId}`, {
        headers: h,
        params: { page: 1, limit: 100 },
      });
      return {
        list: res.data.payments || [],
        familyData: null,
        stats: res.data.stats || {},
        mercadoPagoReady: !!res.data.mercadoPagoReady,
        datosTransferencia: res.data.datosTransferencia ?? null,
      };
    }
    return { list: [], familyData: null, stats: {}, mercadoPagoReady: false, datosTransferencia: null };
  }, [clubData?.urlIdentifier, memberId, isTutor, cuotasEnApp]);

  const onPaymentsFocus = useCallback(() => {
    badges?.refresh?.();
  }, [badges]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: paymentsCacheKey,
    enabled: !!paymentsCacheKey && showCuotas,
    fetchData: fetchPayments,
    onFetched: applyPayments,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las cuotas.');
    },
    onFocus: onPaymentsFocus,
  });

  const pendingMpPaymentIdsRef = useRef([]);
  const syncingMpRef = useRef(false);

  const syncMercadoPagoPayments = useCallback(
    async ({ mpPaymentId, silent } = {}) => {
      const paymentIds = pendingMpPaymentIdsRef.current;
      if ((!paymentIds.length && !mpPaymentId) || !clubData?.urlIdentifier) return false;
      if (syncingMpRef.current) return false;
      syncingMpRef.current = true;
      try {
        const h = await clubHeaders(clubData);
        const { data } = await clubApi.post(
          '/mercadopago/sync-member-payments',
          {
            paymentIds: paymentIds.length ? paymentIds : undefined,
            mpPaymentId: mpPaymentId || undefined,
          },
          { headers: h },
        );
        if (data?.synced) {
          pendingMpPaymentIdsRef.current = [];
          await reload();
          badges?.refresh?.();
          if (!silent) {
            showAlert('Pago registrado', 'Tus cuotas ya figuran como pagadas.');
          }
          return true;
        }
        await reload();
        badges?.refresh?.();
        return false;
      } catch (e) {
        if (!silent) {
          showAlert(
            'Pago en proceso',
            e.response?.data?.message ||
              'Si ya pagaste, tirá hacia abajo para actualizar. Puede demorar unos segundos.',
          );
        } else {
          await reload();
        }
        return false;
      } finally {
        syncingMpRef.current = false;
      }
    },
    [clubData, reload, badges],
  );

  useEffect(() => {
    const unsub = subscribeMercadoPagoDeepLinks((event) => {
      if (event?.type !== 'payment') return;
      if (event.status === 'ok' || event.status === 'pending') {
        syncMercadoPagoPayments({ mpPaymentId: event.mpPaymentId, silent: false });
      }
    });
    return unsub;
  }, [syncMercadoPagoPayments]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pendingMpPaymentIdsRef.current.length) {
        syncMercadoPagoPayments({ silent: true });
      }
    });
    return () => sub.remove();
  }, [syncMercadoPagoPayments]);

  const showInitialLoader =
    (memberLoading || loading) &&
    list.length === 0 &&
    !(familyData?.hijos?.length);

  const fmt = (n) => `$${(n || 0).toLocaleString('es-AR')}`;

  const openPayFlow = (paymentsToPay) => {
    const payable = (paymentsToPay || []).filter((p) => ['pendiente', 'vencido'].includes(p.estado));
    if (!payable.length) return;
    setPendingPayPayments(payable);
    setPayFlowOpen(true);
  };

  const payPaymentsWithMp = async (paymentsToPay) => {
    const payable = (paymentsToPay || []).filter((p) => ['pendiente', 'vencido'].includes(p.estado));
    if (!payable.length) return;
    if (!isTutor && !puedePagar) {
      showAlert(
        'Pago en la app',
        `Solo atletas de ${MIN_AGE_SELF_PAY} años o más pueden pagar desde su cuenta. Un tutor puede abonar por vos.`,
      );
      return;
    }

    const single = payable.length === 1;
    if (single) setPayingId(payable[0]._id);
    else setPayingSelected(true);

    try {
      const h = await clubHeaders(clubData);
      const endpoint = single
        ? '/mercadopago/create-preference-member'
        : '/mercadopago/create-preference-family';
      const body = single
        ? { paymentId: payable[0]._id }
        : { paymentIds: payable.map((p) => p._id) };
      const res = await clubApi.post(endpoint, body, { headers: h });
      const url = res.data.linkDePago;
      if (!url) {
        showAlert('Error', 'No pudimos armar el link de pago. Probá de nuevo.');
        return;
      }
      pendingMpPaymentIdsRef.current = payable.map((p) => String(p._id));
      await Linking.openURL(url);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo iniciar el pago.');
    } finally {
      setPayingId(null);
      setPayingSelected(false);
    }
  };

  const hijoNameMap = useMemo(() => {
    const map = {};
    (familyData?.hijos || []).forEach((h) => {
      map[String(h._id)] = `${h.nombre} ${h.apellido}`;
    });
    return map;
  }, [familyData?.hijos]);

  const mpPaymentLabel = (p) => {
    const aid = String(p.atleta?._id || p.atleta || '');
    const nombre = hijoNameMap[aid];
    const periodo = `${MESES[(p.mes || 1) - 1]} ${p.anio}`;
    const plan = p.plan?.nombre || 'Cuota';
    return nombre ? `${nombre} · ${periodo} · ${plan}` : `${periodo} · ${plan}`;
  };

  const confirmMpPayments = (selected) => {
    setSelectModalOpen(false);
    runAfterIosModalDismiss(() => openPayFlow(selected));
  };

  const startMercadoPagoFromPending = () => {
    const pending = pendingPayPayments;
    setPayFlowOpen(false);
    setPendingPayPayments([]);
    runAfterIosModalDismiss(() => {
      payPaymentsWithMp(pending);
    });
  };

  const downloadRecibo = async (payment) => {
    if (!payment?._id || downloadingReciboId) return;
    setDownloadingReciboId(payment._id);
    try {
      const h = await clubHeaders(clubData);
      await downloadPaymentReceipt({ paymentId: payment._id, headers: h });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'No se pudo abrir el comprobante.');
    } finally {
      setDownloadingReciboId(null);
    }
  };

  const renderPaymentRow = (item, atletaNombre) => {
    const ec = EC[item.estado] || '#999';
    const canPay =
      (isTutor || (cuotasEnApp && puedePagar)) && ['pendiente', 'vencido'].includes(item.estado);
    const canDownloadRecibo = item.estado === 'pagado';
    const busy = payingId === item._id;
    const busyRecibo = downloadingReciboId === item._id;
    const inReview = item.estado === 'en_revision';

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            {atletaNombre ? (
              <Text style={[styles.athleteLbl, { color: colorMarca }]}>{atletaNombre}</Text>
            ) : null}
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {MESES[item.mes - 1]} {item.anio}
            </Text>
          </View>
          <Text style={[styles.amount, { color: ec }]}>{fmt(item.montoFinal)}</Text>
        </View>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          {item.tipo === 'social'
            ? item.cuotaSocial?.nombre || 'Cuota social'
            : item.plan?.nombre || 'Cuota'}
          {item.categoria?.nombre ? ` · ${item.categoria.nombre}` : ''}
        </Text>
        {item.motivoRechazo && ['pendiente', 'vencido'].includes(item.estado) ? (
          <Text style={[styles.rejectNote, { color: '#ef4444' }]}>
            Rechazado: {item.motivoRechazo}
          </Text>
        ) : null}
        {inReview ? (
          <Text style={[styles.reviewNote, { color: '#6366f1' }]}>
            Comprobante en revisión por el club. Te avisamos cuando lo confirmen.
          </Text>
        ) : null}
        <View style={styles.cardFooter}>
          <View style={[styles.badge, { backgroundColor: ec + '22' }]}>
            <Text style={[styles.badgeTxt, { color: ec }]}>{ESTADO_LABEL[item.estado] || item.estado}</Text>
          </View>
          <View style={styles.footerActions}>
            {canDownloadRecibo ? (
              <TouchableOpacity
                style={[styles.reciboBtn, { borderColor: colorMarca }]}
                onPress={() => downloadRecibo(item)}
                disabled={busyRecibo}
              >
                {busyRecibo ? (
                  <ActivityIndicator color={colorMarca} size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={16} color={colorMarca} />
                    <Text style={[styles.reciboBtnTxt, { color: colorMarca }]}>Comprobante</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            {canPay ? (
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: colorMarca, opacity: busy ? 0.7 : 1 }]}
                onPress={() => openPayFlow([item])}
                disabled={busy || payingSelected}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="wallet-outline" size={16} color="#fff" />
                    <Text style={styles.payBtnTxt}>Pagar</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const tutorHijos = familyData?.hijos || [];
  const filterIsAll = !isTutor || cuotasFilterId === 'all';
  const filteredHijo = useMemo(() => {
    if (filterIsAll) return null;
    return tutorHijos.find((h) => String(h._id) === String(cuotasFilterId)) || null;
  }, [filterIsAll, tutorHijos, cuotasFilterId]);

  const tutorSections = useMemo(() => {
    if (!isTutor || !tutorHijos.length) return [];
    const byAtleta = {};
    for (const p of familyData.payments || []) {
      const aid = String(p.atleta?._id || p.atleta);
      if (!byAtleta[aid]) byAtleta[aid] = [];
      byAtleta[aid].push(p);
    }
    const hijos = filterIsAll
      ? tutorHijos
      : tutorHijos.filter((h) => String(h._id) === String(cuotasFilterId));
    return hijos.map((h) => ({
      title: `${h.nombre} ${h.apellido}`,
      data: byAtleta[String(h._id)] || [],
    }));
  }, [isTutor, familyData, tutorHijos, filterIsAll, cuotasFilterId]);

  const scopedImpagas = useMemo(() => {
    const all = familyData?.impagas || [];
    if (filterIsAll) return all;
    return all.filter((p) => String(p.atleta?._id || p.atleta) === String(cuotasFilterId));
  }, [familyData?.impagas, filterIsAll, cuotasFilterId]);

  const visibleStats = useMemo(() => {
    if (!isTutor || filterIsAll || !familyData?.payments) return stats;
    const rows = (familyData.payments || []).filter(
      (p) => String(p.atleta?._id || p.atleta) === String(cuotasFilterId),
    );
    let totalPagado = 0;
    let totalPendiente = 0;
    let cuotasVencidas = 0;
    for (const p of rows) {
      const m = Number(p.montoFinal) || 0;
      if (p.estado === 'pagado') totalPagado += m;
      if (['pendiente', 'vencido', 'en_revision'].includes(p.estado)) totalPendiente += m;
      if (p.estado === 'vencido') cuotasVencidas += 1;
    }
    return { totalPagado, totalPendiente, cuotasVencidas };
  }, [isTutor, filterIsAll, cuotasFilterId, familyData?.payments, stats]);

  const payCtaLabel = useMemo(() => {
    const n = scopedImpagas.length;
    if (!n) return '';
    const total = scopedImpagas.reduce((s, p) => s + (Number(p.montoFinal) || 0), 0);
    if (filterIsAll) {
      if (n === 1) return `Pagar la cuota · ${fmt(total)}`;
      return `Pagar todas · ${n} · ${fmt(total)}`;
    }
    if (n === 1) return `Pagar · ${fmt(total)}`;
    return `Pagar pendientes · ${n} · ${fmt(total)}`;
  }, [scopedImpagas, filterIsAll]);

  const subtitle = isTutor
    ? filterIsAll
      ? mercadoPagoReady
        ? 'Todas las cuotas · Mercado Pago o transferencia'
        : 'Todas las cuotas · transferencia'
      : mercadoPagoReady
        ? `Cuotas de ${filteredHijo?.nombre || 'atleta'} · Mercado Pago o transferencia`
        : `Cuotas de ${filteredHijo?.nombre || 'atleta'} · transferencia`
    : mercadoPagoReady
      ? puedePagar
        ? 'Mercado Pago o transferencia'
        : `Menores de ${MIN_AGE_SELF_PAY} años pagan por tutor`
      : puedePagar
        ? 'Transferencia con comprobante'
        : `Menores de ${MIN_AGE_SELF_PAY} años pagan por tutor`;

  const listHeader = showCuotas ? (
    <>
      {!isTutor ? (
        <Text style={[styles.sectionHdr, styles.cuotasSectionHdr, { color: theme.text }]}>
          {isSocio ? 'Cuota social' : 'Cuotas'}
        </Text>
      ) : null}
      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statVal, { color: '#10b981' }]}>{fmt(visibleStats.totalPagado)}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>Pagado</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statVal, { color: '#ef4444' }]}>{fmt(visibleStats.totalPendiente)}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>Debe</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statVal, { color: '#f59e0b' }]}>{visibleStats.cuotasVencidas || 0}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>Vencidas</Text>
        </View>
      </View>

      {isTutor && scopedImpagas.length > 0 ? (
        <View style={styles.payActions}>
          <TouchableOpacity
            style={[styles.payAllBtn, { backgroundColor: colorMarca, opacity: payingSelected ? 0.7 : 1 }]}
            onPress={() => openPayFlow(scopedImpagas)}
            disabled={payingSelected}
          >
            {payingSelected ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={20} color="#fff" />
                <Text style={styles.payAllTxt}>{payCtaLabel}</Text>
              </>
            )}
          </TouchableOpacity>
          {scopedImpagas.length > 1 ? (
            <TouchableOpacity
              style={[styles.payChooseBtn, { borderColor: colorMarca }]}
              onPress={() => setSelectModalOpen(true)}
              disabled={payingSelected}
            >
              <Ionicons name="checkbox-outline" size={18} color={colorMarca} />
              <Text style={[styles.payChooseTxt, { color: colorMarca }]}>Elegir cuáles pagar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </>
  ) : null;

  if (!showCuotas) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Finanzas"
        title={isSocio ? 'Cuota social' : 'Cuotas'}
        subtitle={subtitle}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      {isTutor && tutorHijos.length > 0 ? (
        <View style={[styles.filterWrap, { borderBottomColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  borderColor: filterIsAll ? colorMarca : theme.border,
                  backgroundColor: filterIsAll ? colorMarca + '22' : theme.surface,
                },
              ]}
              onPress={() => setCuotasFilterId('all')}
              accessibilityRole="button"
              accessibilityState={{ selected: filterIsAll }}
            >
              <Text style={[styles.filterPillTxt, { color: filterIsAll ? colorMarca : theme.text }]}>
                Todas
              </Text>
            </TouchableOpacity>
            {tutorHijos.map((h) => {
              const on = String(cuotasFilterId) === String(h._id);
              return (
                <TouchableOpacity
                  key={h._id}
                  style={[
                    styles.filterPill,
                    {
                      borderColor: on ? colorMarca : theme.border,
                      backgroundColor: on ? colorMarca + '22' : theme.surface,
                    },
                  ]}
                  onPress={() => setCuotasFilterId(String(h._id))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.filterPillTxt, { color: on ? colorMarca : theme.text }]} numberOfLines={1}>
                    {h.nombre}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {!isTutor && !puedePagar && profile && (
        <View style={[styles.infoBox, { backgroundColor: colorMarca + '15', borderColor: colorMarca }]}>
          <Ionicons name="information-circle-outline" size={22} color={colorMarca} />
          <Text style={[styles.infoTxt, { color: theme.text }]}>
            Tenés {profile.edad != null ? `${profile.edad} años` : 'edad no registrada'}. Los pagos en la app están
            habilitados desde los {MIN_AGE_SELF_PAY} años. Tu tutor puede pagar por vos.
          </Text>
        </View>
      )}

      {showInitialLoader && showCuotas ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colorMarca} />
        </View>
      ) : isTutor && !familyData?.hijos?.length ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>No hay atletas vinculados a tu cuenta.</Text>
      ) : !isTutor && !memberId ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>No se pudo cargar tu perfil.</Text>
      ) : (
        <>
          {isTutor ? (
            <SectionList
              sections={tutorSections}
              keyExtractor={(item) => String(item._id)}
              renderSectionHeader={({ section: { title } }) =>
                filterIsAll && tutorHijos.length > 1 ? (
                  <Text style={[styles.sectionHdr, { color: theme.text }]}>{title}</Text>
                ) : null
              }
              renderItem={({ item }) => renderPaymentRow(item, null)}
              contentContainerStyle={styles.list}
              ListHeaderComponent={listHeader}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
              }
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.textMuted }]}>No hay cuotas registradas.</Text>
              }
            />
          ) : (
            <FlatList
              data={list}
              keyExtractor={(item) => String(item._id)}
              renderItem={({ item }) => renderPaymentRow(item)}
              contentContainerStyle={styles.list}
              ListHeaderComponent={listHeader}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
              }
              ListEmptyComponent={
                showCuotas ? (
                  <Text style={[styles.empty, { color: theme.textMuted }]}>No hay cuotas registradas.</Text>
                ) : null
              }
            />
          )}
        </>
      )}

      {isTutor ? (
        <SelectPaymentsModal
          visible={selectModalOpen}
          onClose={() => setSelectModalOpen(false)}
          title="Elegir cuotas a pagar"
          subtitle={
            filterIsAll
              ? 'Marcá solo las que querés abonar ahora'
              : `Pendientes de ${filteredHijo?.nombre || 'este atleta'}`
          }
          payments={scopedImpagas}
          getPaymentLabel={mpPaymentLabel}
          theme={theme}
          primaryColor={colorMarca}
          onConfirm={confirmMpPayments}
        />
      ) : null}

      <MemberPayFlowModal
        visible={payFlowOpen}
        onClose={() => {
          setPayFlowOpen(false);
          setPendingPayPayments([]);
        }}
        mercadoPagoReady={mercadoPagoReady}
        datosTransferencia={datosTransferencia}
        onSelectMercadoPago={startMercadoPagoFromPending}
        payments={pendingPayPayments}
        clubData={clubData}
        theme={theme}
        primaryColor={colorMarca}
        getLineLabel={mpPaymentLabel}
        onSuccess={() => {
          showAlert(
            'Enviado',
            'El comprobante quedó en revisión. Te avisaremos cuando el club confirme el pago.',
          );
          reload({ background: true });
          badges?.refresh?.();
        }}
        onError={showAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  stat: { flex: 1, borderRadius: 5, padding: 12, alignItems: 'center' },
  statVal: { fontSize: 15, fontWeight: '800' },
  statLbl: { fontSize: 10, marginTop: 4 },
  payActions: { marginHorizontal: 16, marginBottom: 12, gap: 8 },
  payAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 5,
  },
  payAllTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  payChooseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  payChooseTxt: { fontWeight: '700', fontSize: 14 },
  sectionHdr: { fontSize: 16, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  cuotasSectionHdr: { marginHorizontal: 16, marginTop: 4 },
  card: { borderRadius: 5, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  athleteLbl: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 6 },
  rejectNote: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  reviewNote: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  reciboBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
  },
  reciboBtnTxt: { fontWeight: '700', fontSize: 13 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 5,
  },
  payBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
  },
  infoTxt: { flex: 1, fontSize: 13, lineHeight: 20 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15, paddingHorizontal: 24 },
  filterWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 140,
  },
  filterPillTxt: { fontSize: 13, fontWeight: '700' },
});
