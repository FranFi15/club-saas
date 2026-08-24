import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { finanzasStyles as s } from './finanzasStyles';
import { METODOS, MN, fmtMoney, metodoPagoLabel, EST_COLOR } from './finanzasConstants';
import { pickAndUploadAttachment, openAttachmentUrl } from './finanzasUpload';
import CustomAlert from '../../../components/CustomAlert';

const ESTADO_FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'pagado', label: 'Pagados' },
];

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('es-AR');
  } catch {
    return '—';
  }
}

export default function GastosTab({ clubData, theme, primaryColor, getHeaders, showAlert, mes, anio }) {
  const cc = primaryColor;
  const cacheKey = clubData?.urlIdentifier ? `finanzas-gastos:${clubData.urlIdentifier}` : '';

  const [bills, setBills] = useState(() => readScreenCache(cacheKey)?.bills ?? []);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [modeModal, setModeModal] = useState(false); // choose create vs select
  const [createOpen, setCreateOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectRows, setSelectRows] = useState([]);
  const [selectLoading, setSelectLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [facturaUrl, setFacturaUrl] = useState('');
  const [notas, setNotas] = useState('');
  const [payOnCreate, setPayOnCreate] = useState(false);
  const [metodo, setMetodo] = useState('transferencia');
  const [pagoUrl, setPagoUrl] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [confirmCfg, setConfirmCfg] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const params = { page: 1, limit: 60, mes, anio };
    if (filtroEstado !== 'todos') params.estado = filtroEstado;
    if (debouncedSearch) params.search = debouncedSearch;
    const { data } = await clubApi.get('/financial/bills', { headers: h, params });
    return { bills: data.bills || [] };
  }, [getHeaders, filtroEstado, debouncedSearch, mes, anio]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: `${cacheKey}:${mes}-${anio}:${filtroEstado}:${debouncedSearch}`,
    enabled: !!cacheKey,
    fetchData,
    onFetched: (data) => setBills(data.bills),
    onFetchError: () => showAlert('Error', 'No se pudieron cargar los gastos.'),
  });

  const pendingBills = useMemo(
    () => bills.filter((b) => b.estado === 'pendiente'),
    [bills],
  );

  const resetCreateForm = () => {
    setConcepto('');
    setMonto('');
    setFacturaUrl('');
    setNotas('');
    setPayOnCreate(false);
    setMetodo('transferencia');
    setPagoUrl('');
  };

  const openCreate = () => {
    setModeModal(false);
    resetCreateForm();
    setCreateOpen(true);
  };

  const openSelect = async () => {
    setModeModal(false);
    setSelectOpen(true);
    setSelectLoading(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.get('/financial/bills', {
        headers: h,
        params: { estado: 'pendiente', page: 1, limit: 100, mes, anio },
      });
      setSelectRows(data.bills || []);
    } catch {
      setSelectRows(pendingBills);
      showAlert('Error', 'No se pudieron cargar las facturas pendientes.');
    } finally {
      setSelectLoading(false);
    }
  };

  const openPayFor = (bill) => {
    setSelectOpen(false);
    setPayTarget(bill);
    setMetodo('transferencia');
    setPagoUrl('');
    setNotas(bill.notas || '');
    setPayOpen(true);
  };

  const uploadFactura = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadAttachment(clubData, { preferDocument: true });
      if (url) setFacturaUrl(url);
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir la factura.');
    } finally {
      setUploading(false);
    }
  };

  const uploadPago = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadAttachment(clubData, { preferDocument: true });
      if (url) setPagoUrl(url);
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir el comprobante.');
    } finally {
      setUploading(false);
    }
  };

  const saveNewBill = async () => {
    const conceptoTrim = concepto.trim();
    if (!conceptoTrim) {
      showAlert('Faltan datos', 'Ingresá el concepto de la factura.');
      return;
    }
    const amount = Number(String(monto).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      showAlert('Valor inválido', 'Ingresá un monto válido.');
      return;
    }
    setSaving(true);
    try {
      const h = await getHeaders();
      const body = {
        concepto: conceptoTrim,
        monto: amount,
        fecha: new Date(anio, (mes || 1) - 1, Math.min(new Date().getDate(), 28)).toISOString(),
        facturaUrl: facturaUrl || undefined,
        notas: notas.trim() || undefined,
      };
      if (payOnCreate) {
        body.pagarAhora = true;
        body.metodoPago = metodo;
        body.pagoComprobanteUrl = pagoUrl || undefined;
      }
      await clubApi.post('/financial/bills', body, { headers: h });
      setCreateOpen(false);
      await reload({ background: true });
      showAlert('Listo', payOnCreate ? 'Factura creada y marcada como pagada.' : 'Factura creada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const savePay = async () => {
    if (!payTarget) return;
    setSaving(true);
    try {
      const h = await getHeaders();
      await clubApi.patch(
        `/financial/bills/${payTarget._id}/pay`,
        {
          metodoPago: metodo,
          pagoComprobanteUrl: pagoUrl || undefined,
          notas: notas.trim() || undefined,
        },
        { headers: h },
      );
      setPayOpen(false);
      setPayTarget(null);
      await reload({ background: true });
      showAlert('Listo', 'Factura marcada como pagada.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    setConfirmCfg({
      visible: true,
      title: 'Eliminar factura',
      message: `¿Eliminar "${item.concepto}" (${fmtMoney(item.monto)})?`,
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        setDeletingId(item._id);
        try {
          const h = await getHeaders();
          await clubApi.delete(`/financial/bills/${item._id}`, { headers: h });
          await reload({ background: true });
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const renderMetodoChips = () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
      {METODOS.map((m) => {
        const active = metodo === m.value;
        return (
          <TouchableOpacity
            key={m.value}
            onPress={() => setMetodo(m.value)}
            style={[
              s.filterChip,
              {
                borderColor: active ? cc : theme.border,
                backgroundColor: active ? `${cc}18` : theme.background,
                marginRight: 0,
              },
            ]}
          >
            <Ionicons name={m.icon} size={14} color={active ? cc : theme.textMuted} style={{ marginRight: 4 }} />
            <Text style={{ color: active ? cc : theme.text, fontSize: 12, fontWeight: '600' }}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderItem = ({ item }) => {
    const color = EST_COLOR[item.estado] || theme.textMuted;
    const busy = String(deletingId) === String(item._id);
    return (
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[s.planName, { color: theme.text, flexShrink: 1 }]} numberOfLines={2}>
              {item.concepto}
            </Text>
            <View style={[s.badge, { backgroundColor: `${color}22` }]}>
              <Text style={{ color, fontSize: 11, fontWeight: '700' }}>
                {item.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
              </Text>
            </View>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
            Factura: {formatDate(item.fecha)}
            {item.estado === 'pagado'
              ? ` · Pagado: ${formatDate(item.fechaPago)} · ${metodoPagoLabel(item.metodoPago) || '—'}`
              : ''}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
            {!!item.facturaUrl && (
              <TouchableOpacity
                onPress={() =>
                  openAttachmentUrl(item.facturaUrl).catch((e) =>
                    showAlert('Error', e.message || 'No se pudo abrir.'),
                  )
                }
              >
                <Text style={{ color: cc, fontWeight: '700', fontSize: 12 }}>Ver factura</Text>
              </TouchableOpacity>
            )}
            {!!item.pagoComprobanteUrl && (
              <TouchableOpacity
                onPress={() =>
                  openAttachmentUrl(item.pagoComprobanteUrl).catch((e) =>
                    showAlert('Error', e.message || 'No se pudo abrir.'),
                  )
                }
              >
                <Text style={{ color: cc, fontWeight: '700', fontSize: 12 }}>Ver pago</Text>
              </TouchableOpacity>
            )}
            {item.estado === 'pendiente' && (
              <TouchableOpacity onPress={() => openPayFor(item)}>
                <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 12 }}>Registrar pago</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => confirmDelete(item)} disabled={busy}>
              <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 12 }}>
                {busy ? 'Eliminando…' : 'Eliminar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[s.planMonto, { color: cc }]}>{fmtMoney(item.monto)}</Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={[s.sectionTitle, { color: theme.text }]}>Gastos</Text>
        <Text style={[s.sectionSub, { color: theme.textMuted }]}>
          Facturas · {MN[(mes || 1) - 1]} {anio}. Creá una nueva o seleccioná una pendiente para pagar.
        </Text>
        <TextInput
          style={[
            s.input,
            { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface, marginBottom: 10 },
          ]}
          placeholder="Buscar por concepto…"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {ESTADO_FILTROS.map((f) => {
            const active = filtroEstado === f.value;
            return (
              <TouchableOpacity
                key={f.value}
                onPress={() => setFiltroEstado(f.value)}
                style={[
                  s.filterChip,
                  {
                    borderColor: active ? cc : theme.border,
                    backgroundColor: active ? `${cc}18` : theme.surface,
                  },
                ]}
              >
                <Text style={{ color: active ? cc : theme.text, fontSize: 12, fontWeight: '600' }}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && bills.length === 0 ? (
        <ActivityIndicator color={cc} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={40} color={theme.textMuted} />
              <Text style={[s.emptyTxt, { color: theme.text }]}>Sin facturas</Text>
              <Text style={[s.emptySub, { color: theme.textMuted }]}>
                Tocá + para crear una factura o pagar una existente.
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[s.fab, { backgroundColor: cc }]} onPress={() => setModeModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Choose flow */}
      <Modal visible={modeModal} animationType="fade" transparent onRequestClose={() => setModeModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setModeModal(false)}>
          <View style={[s.modalContent, { backgroundColor: theme.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={[s.modalTitle, { color: theme.text, marginBottom: 8 }]}>Gastos</Text>
            <Text style={{ color: theme.textMuted, marginBottom: 16, fontSize: 13 }}>
              ¿Qué querés hacer?
            </Text>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: cc, marginBottom: 10 }]}
              onPress={openCreate}
            >
              <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.saveBtnTxt}>Nueva factura</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.saveBtn,
                {
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                },
              ]}
              onPress={openSelect}
            >
              <Ionicons name="list-outline" size={18} color={theme.text} style={{ marginRight: 8 }} />
              <Text style={[s.saveBtnTxt, { color: theme.text }]}>Seleccionar existente</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create bill */}
      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '92%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Nueva factura</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[s.label, { color: theme.textMuted }]}>Concepto</Text>
              <TextInput
                style={[s.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                value={concepto}
                onChangeText={setConcepto}
                placeholder="Ej. Luz, alquiler, proveedor…"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[s.label, { color: theme.textMuted }]}>Monto</Text>
              <TextInput
                style={[s.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                keyboardType="decimal-pad"
                value={monto}
                onChangeText={setMonto}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[s.label, { color: theme.textMuted }]}>Archivo de factura (opcional)</Text>
              <TouchableOpacity
                onPress={uploadFactura}
                disabled={uploading}
                style={[
                  s.input,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  },
                ]}
              >
                <Text style={{ color: facturaUrl ? cc : theme.textMuted, flex: 1 }} numberOfLines={1}>
                  {uploading ? 'Subiendo…' : facturaUrl ? 'Factura subida ✓' : 'Subir imagen o PDF'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={20} color={cc} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setPayOnCreate((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}
              >
                <Ionicons
                  name={payOnCreate ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={payOnCreate ? cc : theme.textMuted}
                />
                <Text style={{ color: theme.text, fontWeight: '600' }}>Marcar como pagada ahora</Text>
              </TouchableOpacity>

              {payOnCreate && (
                <>
                  <Text style={[s.label, { color: theme.textMuted }]}>Método de pago</Text>
                  {renderMetodoChips()}
                  <Text style={[s.label, { color: theme.textMuted }]}>Comprobante de pago (opcional)</Text>
                  <TouchableOpacity
                    onPress={uploadPago}
                    disabled={uploading}
                    style={[
                      s.input,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      },
                    ]}
                  >
                    <Text style={{ color: pagoUrl ? cc : theme.textMuted, flex: 1 }} numberOfLines={1}>
                      {uploading ? 'Subiendo…' : pagoUrl ? 'Comprobante subido ✓' : 'Subir imagen o PDF'}
                    </Text>
                    <Ionicons name="cloud-upload-outline" size={20} color={cc} />
                  </TouchableOpacity>
                </>
              )}

              <Text style={[s.label, { color: theme.textMuted }]}>Notas</Text>
              <TextInput
                style={[
                  s.input,
                  s.textArea,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.background, textAlignVertical: 'top' },
                ]}
                multiline
                value={notas}
                onChangeText={setNotas}
                placeholderTextColor={theme.textMuted}
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, opacity: saving ? 0.7 : 1 }]}
                onPress={saveNewBill}
                disabled={saving || uploading}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnTxt}>Guardar</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Select existing pending */}
      <Modal visible={selectOpen} animationType="slide" transparent onRequestClose={() => setSelectOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Seleccionar factura</Text>
              <TouchableOpacity onPress={() => setSelectOpen(false)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            {selectLoading ? (
              <ActivityIndicator color={cc} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={selectRows}
                keyExtractor={(item) => String(item._id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => openPayFor(item)}
                    style={[s.card, { backgroundColor: theme.background, marginBottom: 8 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>{item.concepto}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatDate(item.fecha)}</Text>
                    </View>
                    <Text style={{ color: cc, fontWeight: '700' }}>{fmtMoney(item.monto)}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ color: theme.textMuted, textAlign: 'center', marginVertical: 24 }}>
                    No hay facturas pendientes. Creá una nueva.
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Pay existing */}
      <Modal visible={payOpen} animationType="slide" transparent onRequestClose={() => setPayOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Registrar pago</Text>
              <TouchableOpacity onPress={() => setPayOpen(false)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {payTarget && (
                <View style={[s.payInfo, { backgroundColor: `${cc}14` }]}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{payTarget.concepto}</Text>
                  <Text style={{ color: cc, fontWeight: '800', fontSize: 22, marginTop: 6 }}>
                    {fmtMoney(payTarget.monto)}
                  </Text>
                </View>
              )}
              <Text style={[s.label, { color: theme.textMuted }]}>Método de pago</Text>
              {renderMetodoChips()}
              <Text style={[s.label, { color: theme.textMuted }]}>Comprobante de pago (opcional)</Text>
              <TouchableOpacity
                onPress={uploadPago}
                disabled={uploading}
                style={[
                  s.input,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  },
                ]}
              >
                <Text style={{ color: pagoUrl ? cc : theme.textMuted, flex: 1 }} numberOfLines={1}>
                  {uploading ? 'Subiendo…' : pagoUrl ? 'Comprobante subido ✓' : 'Subir imagen o PDF'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={20} color={cc} />
              </TouchableOpacity>
              <Text style={[s.label, { color: theme.textMuted }]}>Notas</Text>
              <TextInput
                style={[
                  s.input,
                  s.textArea,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.background, textAlignVertical: 'top' },
                ]}
                multiline
                value={notas}
                onChangeText={setNotas}
                placeholderTextColor={theme.textMuted}
              />
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, opacity: saving ? 0.7 : 1 }]}
                onPress={savePay}
                disabled={saving || uploading}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnTxt}>Confirmar pago</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert
        visible={confirmCfg.visible}
        title={confirmCfg.title}
        message={confirmCfg.message}
        showCancel
        isDanger
        confirmText="Eliminar"
        onConfirm={confirmCfg.onConfirm}
        onCancel={() => setConfirmCfg((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}
