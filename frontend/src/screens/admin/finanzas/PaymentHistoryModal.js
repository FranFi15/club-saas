import React, { useEffect, useState, useCallback, useContext } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { downloadPaymentReceipt } from '../../../utils/paymentReceipt';
import { MN, EST_COLOR, fmtMoney, metodoPagoLabel, metodoPagoIcon, contrastOutlineBtn } from './finanzasConstants';
import DesignCard from '../../../components/DesignCard';
import CustomAlert from '../../../components/CustomAlert';
import { ThemeContext } from '../../../context/ThemeContext';

const HISTORY_PAGE_SIZE = 30;

function canPayPayment(p) {
  return p?.estado === 'pendiente' || p?.estado === 'vencido';
}

export default function PaymentHistoryModal({
  visible,
  onClose,
  atleta,
  getHeaders,
  theme,
  primaryColor,
  onPay,
  onDeletePayment,
  onAdvance,
  canDelete = true,
  refreshKey = 0,
  onDismiss,
}) {
  const { isDarkMode } = useContext(ThemeContext);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    isDanger: false,
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeAlert = useCallback(() => {
    setAlertConfig((p) => ({ ...p, visible: false }));
  }, []);

  const showAlert = useCallback((title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
      onCancel: options.onCancel || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });
  }, []);

  const fetchPage = useCallback(
    async (pageNum, { append = false } = {}) => {
      if (!atleta?._id) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const h = await getHeaders();
        const r = await clubApi.get(`/financial/payments/atleta/${atleta._id}`, {
          headers: h,
          params: { page: pageNum, limit: HISTORY_PAGE_SIZE },
        });
        const rows = r.data.payments || [];
        setPayments((prev) => (append ? [...prev, ...rows] : rows));
        if (!append) setStats(r.data.stats || {});
        setPage(r.data.page || pageNum);
        setHasMore(r.data.hasMore ?? false);
      } catch {
        if (!append) {
          setPayments([]);
          setStats({});
        }
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [atleta?._id, getHeaders],
  );

  useEffect(() => {
    if (!visible || !atleta?._id) return;
    fetchPage(1, { append: false });
  }, [visible, atleta?._id, refreshKey, fetchPage]);

  useEffect(() => {
    if (!visible) closeAlert();
  }, [visible, closeAlert]);

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(page + 1, { append: true });
  };

  const downloadRecibo = async (payment) => {
    if (!payment?._id || downloadingId) return;
    setDownloadingId(payment._id);
    try {
      const h = await getHeaders();
      await downloadPaymentReceipt({ paymentId: payment._id, headers: h });
    } catch (e) {
      console.warn('recibo', e?.response?.data || e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const removePaymentFromList = (payment) => {
    setPayments((prev) => prev.filter((p) => String(p._id) !== String(payment._id)));
    setStats((prev) => {
      const monto = Number(payment.montoFinal) || 0;
      if (payment.estado === 'pagado') {
        return { ...prev, totalPagado: Math.max(0, (Number(prev.totalPagado) || 0) - monto) };
      }
      if (payment.estado === 'pendiente' || payment.estado === 'vencido' || payment.estado === 'en_revision') {
        return { ...prev, totalPendiente: Math.max(0, (Number(prev.totalPendiente) || 0) - monto) };
      }
      return prev;
    });
  };

  const performDelete = async (payment) => {
    if (!payment?._id || deletingId || !onDeletePayment) return;
    setDeletingId(payment._id);
    try {
      await onDeletePayment(payment);
      removePaymentFromList(payment);
      showAlert('Listo', 'Cuota eliminada.');
    } catch (e) {
      showAlert('Error', e?.response?.data?.message || e?.message || 'No se pudo eliminar la cuota.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (payment) => {
    if (!payment?._id || deletingId || !onDeletePayment) return;
    const periodo = `${MN[(payment.mes || 1) - 1] || payment.mes} ${payment.anio}`;
    const plan =
      payment.tipo === 'social'
        ? payment.cuotaSocial?.nombre || 'Cuota social'
        : payment.plan?.nombre || 'Cuota';
    const paidNote =
      payment.estado === 'pagado'
        ? '\n\nEsta cuota ya figura como pagada. Se borrará del historial igual.'
        : '';
    showAlert('Eliminar cuota', `¿Eliminar ${plan} de ${periodo} (${payment.estado})?${paidNote}`, {
      showCancel: true,
      isDanger: true,
      confirmText: 'Eliminar',
      onConfirm: () => {
        closeAlert();
        performDelete(payment);
      },
    });
  };

  const nombre = atleta ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim() : '';

  const renderPayment = ({ item: p }) => {
    const ec = EST_COLOR[p.estado] || '#999';
    const showPay = canPayPayment(p) && onPay;
    const showRecibo = p.estado === 'pagado';
    const showDelete = canDelete && onDeletePayment;
    const metodoLabel = metodoPagoLabel(p.metodoPago);
    const showMetodo = metodoLabel && (p.estado === 'pagado' || p.estado === 'en_revision');
    const busyRecibo = downloadingId === p._id;
    const busyDelete = deletingId === p._id;
    const planLabel =
      p.tipo === 'social'
        ? p.cuotaSocial?.nombre || 'Cuota social'
        : p.plan?.nombre || 'Sin plan';

    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={ec}
        contentStyle={styles.rowInner}
        style={{ marginBottom: 8 }}
      >
        <View style={styles.rowMain}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {MN[(p.mes || 1) - 1]} {p.anio}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
              {planLabel}
              {p.categoria?.nombre ? ` · ${p.categoria.nombre}` : ''}
            </Text>
            {p.fechaPago ? (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
                Pagado: {new Date(p.fechaPago).toLocaleDateString('es-AR')}
              </Text>
            ) : null}
            {showMetodo ? (
              <View style={styles.metodoRow}>
                <Ionicons name={metodoPagoIcon(p.metodoPago)} size={12} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {p.estado === 'en_revision' ? `${metodoLabel} · en revisión` : metodoLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{fmtMoney(p.montoFinal)}</Text>
            <View style={[styles.badge, { backgroundColor: ec + '22' }]}>
              <Text style={{ color: ec, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
                {p.estado}
              </Text>
            </View>
          </View>
        </View>
        {(showPay || showRecibo || showDelete) && (
          <View style={styles.actionsRow}>
            {showRecibo ? (
              <TouchableOpacity
                style={[styles.reciboBtn, contrastOutlineBtn(theme, isDarkMode)]}
                onPress={() => downloadRecibo(p)}
                disabled={busyRecibo || busyDelete}
                accessibilityRole="button"
                accessibilityLabel="Descargar comprobante"
              >
                {busyRecibo ? (
                  <ActivityIndicator color={theme.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={16} color={theme.text} />
                    <Text style={[styles.reciboBtnTxt, { color: theme.text }]}>Comprobante</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            {showPay ? (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => {
                  if (Platform.OS === 'ios') {
                    onClose();
                    setTimeout(() => onPay(p), 380);
                  } else {
                    onPay(p);
                  }
                }}
                activeOpacity={0.75}
                disabled={busyDelete}
                accessibilityRole="button"
                accessibilityLabel="Pagar cuota"
              >
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <Text style={styles.payBtnTxt}>Pagar</Text>
              </TouchableOpacity>
            ) : null}
            {showDelete ? (
              <TouchableOpacity
                style={[styles.deleteBtn, contrastOutlineBtn(theme, isDarkMode), { borderColor: '#ef4444' }]}
                onPress={() => handleDelete(p)}
                disabled={busyDelete}
                accessibilityRole="button"
                accessibilityLabel="Eliminar cuota"
              >
                {busyDelete ? (
                  <ActivityIndicator color="#ef4444" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    <Text style={styles.deleteBtnTxt}>Eliminar</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </DesignCard>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Historial de pagos</Text>
            <View style={styles.headerActions}>
              {onAdvance ? (
                <TouchableOpacity
                  onPress={onAdvance}
                  style={[styles.advanceBtn, { borderColor: primaryColor }]}
                  accessibilityRole="button"
                  accessibilityLabel="Adelantar cuotas"
                >
                  <Ionicons name="calendar-outline" size={18} color={primaryColor} />
                  <Text style={[styles.advanceBtnTxt, { color: primaryColor }]}>Adelantar</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>
          </View>
          {nombre ? <Text style={[styles.sub, { color: theme.textMuted }]}>{nombre}</Text> : null}

          {loading && payments.length === 0 ? (
            <ActivityIndicator color={primaryColor} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={styles.statsRow}>
                <DesignCard
                  theme={theme}
                  isDarkMode={isDarkMode}
                  accent="#10b981"
                  style={styles.statCard}
                  contentStyle={styles.statInner}
                >
                  <Text style={{ color: '#10b981', fontWeight: '800' }}>{fmtMoney(stats.totalPagado)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Pagado</Text>
                </DesignCard>
                <DesignCard
                  theme={theme}
                  isDarkMode={isDarkMode}
                  accent="#f59e0b"
                  style={styles.statCard}
                  contentStyle={styles.statInner}
                >
                  <Text style={{ color: '#f59e0b', fontWeight: '800' }}>{fmtMoney(stats.totalPendiente)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Pendiente</Text>
                </DesignCard>
              </View>

              <FlatList
                style={styles.list}
                data={payments}
                keyExtractor={(p) => String(p._id)}
                renderItem={renderPayment}
                onEndReached={loadMore}
                onEndReachedThreshold={0.35}
                ListEmptyComponent={
                  <Text style={[styles.empty, { color: theme.textMuted }]}>Sin movimientos registrados.</Text>
                }
                ListFooterComponent={
                  loadingMore ? <ActivityIndicator color={primaryColor} style={{ marginVertical: 16 }} /> : null
                }
              />
            </>
          )}
        </View>
        <CustomAlert
          embedded
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          showCancel={alertConfig.showCancel}
          isDanger={alertConfig.isDanger}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel || closeAlert}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  sheet: {
    height: '85%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    padding: 20,
    paddingBottom: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  advanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  advanceBtnTxt: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  sub: { fontSize: 14, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, marginBottom: 0 },
  statInner: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  list: { flex: 1 },
  rowInner: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  rowMain: { flexDirection: 'row', alignItems: 'center' },
  metodoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  reciboBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  reciboBtnTxt: { fontWeight: '700', fontSize: 13 },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
  },
  payBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  deleteBtnTxt: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
