import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { MN, EST_COLOR, fmtMoney, metodoPagoLabel, metodoPagoIcon } from './finanzasConstants';

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
  refreshKey = 0,
  onDismiss,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

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

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(page + 1, { append: true });
  };

  const downloadRecibo = async (payment) => {
    if (!payment?._id || downloadingId) return;
    setDownloadingId(payment._id);
    try {
      const h = await getHeaders();
      let url = payment.reciboUrl;
      if (!url) {
        const { data } = await clubApi.get(`/financial/payments/${payment._id}/recibo`, { headers: h });
        url = data.url || data.reciboUrl;
        if (url) {
          setPayments((prev) =>
            prev.map((p) => (String(p._id) === String(payment._id) ? { ...p, reciboUrl: url } : p)),
          );
        }
      }
      if (!url) throw new Error('Sin URL de comprobante');
      await Linking.openURL(url);
    } catch (e) {
      console.warn('recibo', e?.response?.data || e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const nombre = atleta ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim() : '';

  const renderPayment = ({ item: p }) => {
    const ec = EST_COLOR[p.estado] || '#999';
    const showPay = canPayPayment(p) && onPay;
    const showRecibo = p.estado === 'pagado';
    const metodoLabel = metodoPagoLabel(p.metodoPago);
    const showMetodo = metodoLabel && (p.estado === 'pagado' || p.estado === 'en_revision');
    const busyRecibo = downloadingId === p._id;

    return (
      <View style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <View style={styles.rowMain}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {MN[(p.mes || 1) - 1]} {p.anio}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
              {p.plan?.nombre || 'Sin plan'}
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
        {(showPay || showRecibo) && (
          <View style={styles.actionsRow}>
            {showRecibo ? (
              <TouchableOpacity
                style={[styles.reciboBtn, { borderColor: primaryColor }]}
                onPress={() => downloadRecibo(p)}
                disabled={busyRecibo}
                accessibilityRole="button"
                accessibilityLabel="Descargar comprobante"
              >
                {busyRecibo ? (
                  <ActivityIndicator color={primaryColor} size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={16} color={primaryColor} />
                    <Text style={[styles.reciboBtnTxt, { color: primaryColor }]}>Comprobante</Text>
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
                accessibilityRole="button"
                accessibilityLabel="Pagar cuota"
              >
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <Text style={styles.payBtnTxt}>Pagar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
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
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={theme.icon} />
            </TouchableOpacity>
          </View>
          {nombre ? <Text style={[styles.sub, { color: theme.textMuted }]}>{nombre}</Text> : null}

          {loading && payments.length === 0 ? (
            <ActivityIndicator color={primaryColor} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={styles.statsRow}>
                <View style={[styles.stat, { backgroundColor: theme.background }]}>
                  <Text style={{ color: '#10b981', fontWeight: '800' }}>{fmtMoney(stats.totalPagado)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Pagado</Text>
                </View>
                <View style={[styles.stat, { backgroundColor: theme.background }]}>
                  <Text style={{ color: '#f59e0b', fontWeight: '800' }}>{fmtMoney(stats.totalPendiente)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Pendiente</Text>
                </View>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    height: '85%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    padding: 20,
    paddingBottom: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  sub: { fontSize: 14, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flex: 1, padding: 12, borderRadius: 5, alignItems: 'center' },
  list: { flex: 1 },
  row: {
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 8,
  },
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
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
