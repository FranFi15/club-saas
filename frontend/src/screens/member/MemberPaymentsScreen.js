import React, { useCallback, useContext, useState, useMemo } from 'react';
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
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useMember } from '../../context/MemberContext';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import MemberChildPicker from '../../components/MemberChildPicker';
import { MIN_AGE_SELF_PAY } from '../../utils/ageHelper';
import { useBadgesOptional } from '../../context/BadgeContext';
import SelectPaymentsModal from '../../components/SelectPaymentsModal';
import PaymentPaySummary from '../../components/PaymentPaySummary';
import MemberWellnessSection from '../../components/MemberWellnessSection';
import MemberPayFlowModal from '../../components/MemberPayFlowModal';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const EC = { pendiente: '#f59e0b', pagado: '#10b981', vencido: '#ef4444', en_revision: '#6366f1' };
const ESTADO_LABEL = {
  pendiente: 'pendiente',
  pagado: 'pagado',
  vencido: 'vencido',
  en_revision: 'en revisión',
};

export default function MemberPaymentsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { isTutor, memberId, puedePagar, cuotasEnApp, loading: memberLoading, profile } = useMember();
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
  const [payingId, setPayingId] = useState(null);
  const [payingSelected, setPayingSelected] = useState(false);
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [payFlowOpen, setPayFlowOpen] = useState(false);
  const [pendingPayPayments, setPendingPayPayments] = useState([]);
  const [mpConfirmOpen, setMpConfirmOpen] = useState(false);
  const [selectedForMp, setSelectedForMp] = useState([]);
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
  const showWellness = !isTutor;

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
      const res = await clubApi.get(`/financial/payments/atleta/${memberId}`, { headers: h });
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

  const payWithMp = async (payment, { asTutor = isTutor } = {}) => {
    if (!asTutor && !puedePagar) {
      showAlert(
        'Pago en la app',
        `Solo atletas de ${MIN_AGE_SELF_PAY} años o más pueden pagar desde su cuenta. Un tutor puede abonar por vos.`,
      );
      return;
    }
    setPayingId(payment._id);
    try {
      const h = await clubHeaders(clubData);
      const res = await clubApi.post(
        '/mercadopago/create-preference-member',
        { paymentId: payment._id },
        { headers: h },
      );
      const url = res.data.linkDePago;
      if (!url) {
        showAlert('Error', 'Mercado Pago no devolvió un enlace de pago.');
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo iniciar el pago.');
    } finally {
      setPayingId(null);
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
    openPayFlow(selected);
  };

  const startMercadoPagoFromPending = () => {
    setPayFlowOpen(false);
    if (pendingPayPayments.length === 1) {
      payWithMp(pendingPayPayments[0], { asTutor: isTutor });
      setPendingPayPayments([]);
      return;
    }
    setSelectedForMp(pendingPayPayments);
    setMpConfirmOpen(true);
  };

  const paySelectedWithMp = async () => {
    if (!selectedForMp.length) return;
    setPayingSelected(true);
    try {
      const h = await clubHeaders(clubData);
      const endpoint =
        selectedForMp.length === 1
          ? '/mercadopago/create-preference-member'
          : '/mercadopago/create-preference-family';
      const body =
        selectedForMp.length === 1
          ? { paymentId: selectedForMp[0]._id }
          : { paymentIds: selectedForMp.map((p) => p._id) };
      const res = await clubApi.post(endpoint, body, { headers: h });
      const url = res.data.linkDePago;
      if (!url) {
        showAlert('Error', 'Mercado Pago no devolvió un enlace de pago.');
        return;
      }
      setMpConfirmOpen(false);
      setSelectedForMp([]);
      setPendingPayPayments([]);
      await Linking.openURL(url);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo iniciar el pago.');
    } finally {
      setPayingSelected(false);
    }
  };

  const renderPaymentRow = (item, atletaNombre) => {
    const ec = EC[item.estado] || '#999';
    const canPay =
      (isTutor || (cuotasEnApp && puedePagar)) && ['pendiente', 'vencido'].includes(item.estado);
    const busy = payingId === item._id;

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
          {item.plan?.nombre || 'Cuota'}
          {item.categoria?.nombre ? ` · ${item.categoria.nombre}` : ''}
        </Text>
        {item.motivoRechazo && ['pendiente', 'vencido'].includes(item.estado) ? (
          <Text style={[styles.rejectNote, { color: '#ef4444' }]}>
            Rechazado: {item.motivoRechazo}
          </Text>
        ) : null}
        <View style={styles.cardFooter}>
          <View style={[styles.badge, { backgroundColor: ec + '22' }]}>
            <Text style={[styles.badgeTxt, { color: ec }]}>{ESTADO_LABEL[item.estado] || item.estado}</Text>
          </View>
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
    );
  };

  const tutorSections = useMemo(() => {
    if (!isTutor || !familyData?.hijos) return [];
    const byAtleta = {};
    for (const p of familyData.payments || []) {
      const aid = String(p.atleta?._id || p.atleta);
      if (!byAtleta[aid]) byAtleta[aid] = [];
      byAtleta[aid].push(p);
    }
    return familyData.hijos.map((h) => ({
      title: `${h.nombre} ${h.apellido}`,
      data: byAtleta[String(h._id)] || [],
    }));
  }, [isTutor, familyData]);

  const impagasFamilia = familyData?.impagas || [];

  const subtitle = isTutor
    ? mercadoPagoReady
      ? 'Cuotas de tus hijos · Mercado Pago o transferencia'
      : 'Cuotas de tus hijos · transferencia con comprobante'
    : showCuotas
      ? mercadoPagoReady
        ? puedePagar
          ? 'Wellness y cuotas · Mercado Pago o transferencia'
          : `Wellness y cuotas · menores de ${MIN_AGE_SELF_PAY} años pagan por tutor`
        : puedePagar
          ? 'Wellness y cuotas · transferencia con comprobante'
          : `Wellness y cuotas · menores de ${MIN_AGE_SELF_PAY} años pagan por tutor`
      : 'Contanos cómo te sentís y cómo fue el entreno';

  const wellnessHeader = showWellness ? (
    <MemberWellnessSection
      clubData={clubData}
      theme={theme}
      colorMarca={colorMarca}
      navigation={navigation}
      onError={showAlert}
    />
  ) : null;

  const cuotasHeader = showCuotas ? (
    <>
      {!isTutor ? (
        <Text style={[styles.sectionHdr, styles.cuotasSectionHdr, { color: theme.text }]}>Cuotas</Text>
      ) : null}
      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statVal, { color: '#10b981' }]}>{fmt(stats.totalPagado)}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>Pagado</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statVal, { color: '#ef4444' }]}>{fmt(stats.totalPendiente)}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>Debe</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statVal, { color: '#f59e0b' }]}>{stats.cuotasVencidas || 0}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>Vencidas</Text>
        </View>
      </View>

      {isTutor && impagasFamilia.length > 0 ? (
        <TouchableOpacity
          style={[styles.payAllBtn, { backgroundColor: colorMarca }]}
          onPress={() => setSelectModalOpen(true)}
        >
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text style={styles.payAllTxt}>Pagar</Text>
        </TouchableOpacity>
      ) : null}
    </>
  ) : null;

  const listHeader = (
    <>
      {wellnessHeader}
      {cuotasHeader}
    </>
  );

  if (!isTutor && !showCuotas && !showWellness) {
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
        title="Cuotas"
        subtitle={subtitle}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      {isTutor ? <MemberChildPicker theme={theme} colorMarca={colorMarca} /> : null}

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
      ) : !showCuotas && showWellness ? (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
        >
          {listHeader}
        </ScrollView>
      ) : (
        <>
          {isTutor ? (
            <SectionList
              sections={tutorSections}
              keyExtractor={(item) => String(item._id)}
              renderSectionHeader={({ section: { title } }) => (
                <Text style={[styles.sectionHdr, { color: theme.text }]}>{title}</Text>
              )}
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
          subtitle="Cuotas pendientes y vencidas de tus hijos"
          payments={impagasFamilia}
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

      <Modal visible={mpConfirmOpen} animationType="slide" transparent>
        <View style={styles.mpOverlay}>
          <View style={[styles.mpSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.mpHeader}>
              <Text style={[styles.mpTitle, { color: theme.text }]}>Confirmar pago</Text>
              <TouchableOpacity
                onPress={() => {
                  setMpConfirmOpen(false);
                  setSelectedForMp([]);
                }}
              >
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <PaymentPaySummary
              subtitle="Pago con Mercado Pago"
              payments={selectedForMp}
              getLineLabel={mpPaymentLabel}
              theme={theme}
              primaryColor={colorMarca}
              maxListHeight={selectedForMp.length > 3 ? 240 : 140}
            />

            <TouchableOpacity
              style={[styles.payAllBtn, { backgroundColor: colorMarca, opacity: payingSelected ? 0.7 : 1 }]}
              onPress={paySelectedWithMp}
              disabled={payingSelected}
            >
              {payingSelected ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={20} color="#fff" />
                  <Text style={styles.payAllTxt}>Pagar con Mercado Pago</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  payAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 5,
  },
  payAllTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionHdr: { fontSize: 16, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  cuotasSectionHdr: { marginHorizontal: 16, marginTop: 4 },
  card: { borderRadius: 5, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  athleteLbl: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 6 },
  rejectNote: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  badgeTxt: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
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
  mpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  mpSheet: {
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    padding: 24,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  mpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mpTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
});
