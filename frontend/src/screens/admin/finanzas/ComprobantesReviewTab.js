import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { useBadges } from '../../../context/BadgeContext';
import PaymentPaySummary from '../../../components/PaymentPaySummary';
import { MN, fmtMoney } from './finanzasConstants';

function paymentLineLabel(p) {
  const atleta = p.atleta;
  const athleteName = atleta ? `${atleta.nombre} ${atleta.apellido}` : '';
  const period = `${MN[(p.mes || 1) - 1]} ${p.anio}`;
  const plan = p.plan?.nombre || 'Cuota';
  return athleteName ? `${athleteName} · ${period} · ${plan}` : `${period} · ${plan}`;
}

export default function ComprobantesReviewTab({ clubData, theme, primaryColor, getHeaders, showAlert }) {
  const { refresh: refreshBadges } = useBadges();
  const cacheKey = clubData?.urlIdentifier ? `finanzas-revision:${clubData.urlIdentifier}` : '';
  const [groups, setGroups] = useState(() => readScreenCache(cacheKey)?.groups ?? []);
  const [viewerUrl, setViewerUrl] = useState('');
  const [rejectGroup, setRejectGroup] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actingId, setActingId] = useState(null);

  const fetchReviews = useCallback(async () => {
    const h = await getHeaders();
    const { data } = await clubApi.get('/financial/payments/pending-review', { headers: h });
    return { groups: data.groups || [] };
  }, [getHeaders]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData: fetchReviews,
    onFetched: (data) => setGroups(data.groups),
    onFetchError: () => showAlert('Error', 'No se pudieron cargar los comprobantes.'),
  });

  const groupPaymentIds = (group) => (group.payments || []).map((p) => p._id);

  const approve = async (group) => {
    const paymentIds = groupPaymentIds(group);
    if (!paymentIds.length) return;

    setActingId(group.id);
    try {
      const h = await getHeaders();
      await clubApi.patch(
        '/financial/payments/transfer-review/approve',
        { paymentIds },
        { headers: h },
      );
      await reload({ background: true });
      refreshBadges();
      const count = paymentIds.length;
      showAlert(
        'Aprobado',
        count > 1 ? `Se registraron ${count} cuotas como pagadas.` : 'El pago quedó registrado como pagado.',
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo aprobar.');
    } finally {
      setActingId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectGroup) return;
    const motivo = rejectReason.trim();
    if (!motivo) {
      showAlert('Motivo requerido', 'Escribí por qué se rechaza el comprobante.');
      return;
    }

    const paymentIds = groupPaymentIds(rejectGroup);
    if (!paymentIds.length) return;

    setActingId(rejectGroup.id);
    try {
      const h = await getHeaders();
      await clubApi.patch(
        '/financial/payments/transfer-review/reject',
        { paymentIds, motivoRechazo: motivo },
        { headers: h },
      );
      setRejectGroup(null);
      setRejectReason('');
      await reload({ background: true });
      refreshBadges();
      showAlert('Rechazado', 'Se notificó al tutor/atleta con el motivo.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo rechazar.');
    } finally {
      setActingId(null);
    }
  };

  const renderItem = ({ item: group }) => {
    const enviado = group.enviadoPor;
    const payments = group.payments || [];
    const busy = String(actingId) === String(group.id);
    const cuotaCount = payments.length;

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>
              {cuotaCount > 1 ? `${cuotaCount} cuotas` : '1 cuota'} · {fmtMoney(group.totalMonto || 0)}
            </Text>
            <Text style={[styles.sub, { color: theme.textMuted }]}>
              {enviado ? `Enviado por ${enviado.nombre} ${enviado.apellido}` : 'Transferencia'}
            </Text>
          </View>
        </View>

        <PaymentPaySummary
          payments={payments}
          getLineLabel={paymentLineLabel}
          theme={theme}
          primaryColor={primaryColor}
          maxListHeight={payments.length > 3 ? 200 : 140}
          listLabel="Cuotas incluidas"
          showTotal={false}
        />

        {group.comprobante ? (
          <TouchableOpacity onPress={() => setViewerUrl(group.comprobante)} activeOpacity={0.9}>
            <Image source={{ uri: group.comprobante }} style={styles.thumb} resizeMode="cover" />
            <Text style={[styles.viewTxt, { color: primaryColor }]}>Ver comprobante</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.rejectBtn, { borderColor: '#ef4444', opacity: busy ? 0.6 : 1 }]}
            onPress={() => {
              setRejectGroup(group);
              setRejectReason('');
            }}
            disabled={busy}
          >
            <Text style={styles.rejectTxt}>Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveBtn, { backgroundColor: '#10b981', opacity: busy ? 0.6 : 1 }]}
            onPress={() => approve(group)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.approveTxt}>{cuotaCount > 1 ? 'Aprobar todas' : 'Aprobar'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading && !groups.length) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={primaryColor} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={groups}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            No hay comprobantes pendientes de revisión.
          </Text>
        }
      />

      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl('')}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerBackdrop} onPress={() => setViewerUrl('')} />
          <View style={[styles.viewerBox, { backgroundColor: theme.surface }]}>
            <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUrl('')}>
              <Ionicons name="close" size={28} color={theme.icon} />
            </TouchableOpacity>
            <ScrollView maximumZoomScale={3} minimumZoomScale={1} contentContainerStyle={styles.viewerScroll}>
              <Image source={{ uri: viewerUrl }} style={styles.viewerImg} resizeMode="contain" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!rejectGroup} transparent animationType="fade" onRequestClose={() => setRejectGroup(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.viewerOverlay}>
          <View style={[styles.rejectSheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.rejectTitle, { color: theme.text }]}>Rechazar comprobante</Text>
            <Text style={[styles.rejectHint, { color: theme.textMuted }]}>
              {rejectGroup?.payments?.length > 1
                ? `Se rechazarán las ${rejectGroup.payments.length} cuotas de este envío. El tutor o atleta verá el motivo y podrá volver a enviar un comprobante.`
                : 'El tutor o atleta verá este mensaje y podrá volver a enviar un comprobante.'}
            </Text>
            <TextInput
              style={[
                styles.rejectInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Motivo del rechazo"
              placeholderTextColor={theme.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.rejectBtn, { borderColor: theme.border, flex: 1 }]}
                onPress={() => setRejectGroup(null)}
              >
                <Text style={[styles.rejectTxt, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approveBtn, { backgroundColor: '#ef4444', flex: 1 }]}
                onPress={submitReject}
              >
                <Text style={styles.approveTxt}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  list: { padding: 16, paddingBottom: 32 },
  card: { borderRadius: 8, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4 },
  thumb: { width: '100%', height: 140, borderRadius: 8, backgroundColor: '#e5e7eb' },
  viewTxt: { fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectTxt: { color: '#ef4444', fontWeight: '700' },
  approveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveTxt: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15, paddingHorizontal: 24 },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center' },
  viewerBackdrop: { ...StyleSheet.absoluteFillObject },
  viewerBox: { margin: 16, borderRadius: 12, overflow: 'hidden', maxHeight: '85%' },
  viewerClose: { alignSelf: 'flex-end', padding: 12, zIndex: 2 },
  viewerScroll: { alignItems: 'center', padding: 8 },
  viewerImg: { width: '100%', height: 420 },
  rejectSheet: { margin: 20, borderRadius: 14, padding: 20 },
  rejectTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  rejectHint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  rejectInput: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 14,
  },
});
