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
import { METODOS, MN, fmtMoney, metodoPagoLabel, metodoPagoIcon, EST_COLOR } from './finanzasConstants';
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
  const [editingId, setEditingId] = useState(null);
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
    setEditingId(null);
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

  const openEdit = (item) => {
    setEditingId(item._id);
    setConcepto(item.concepto || '');
    setMonto(item.monto != null ? String(item.monto) : '');
    setFacturaUrl(item.facturaUrl || '');
    setNotas(item.notas || '');
    setPayOnCreate(false);
    setMetodo(item.metodoPago || 'transferencia');
    setPagoUrl(item.pagoComprobanteUrl || '');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setEditingId(null);
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
      if (editingId) {
        await clubApi.patch(
          `/financial/bills/${editingId}`,
          {
            concepto: conceptoTrim,
            monto: amount,
            facturaUrl: facturaUrl || '',
            notas: notas.trim(),
          },
          { headers: h },
        );
        closeCreate();
        await reload({ background: true });
        showAlert('Listo', 'Factura actualizada.');
      } else {
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
        closeCreate();
        await reload({ background: true });
        showAlert('Listo', payOnCreate ? 'Factura creada y marcada como pagada.' : 'Factura creada.');
      }
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
    const isPaid = item.estado === 'pagado';
    const metaParts = [`Factura ${formatDate(item.fecha)}`];
    if (isPaid) {
      metaParts.push(`Pagado ${formatDate(item.fechaPago)}`);
      const method = metodoPagoLabel(item.metodoPago);
      if (method) metaParts.push(method);
    }

    return (
      <View style={[s.financeListCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={s.financeCardTop}>
          <View style={[s.financeCardLeading, { backgroundColor: `${color}18`, marginRight: 0 }]}>
            <Ionicons
              name={isPaid ? 'checkmark-circle' : 'receipt-outline'}
              size={22}
              color={color}
            />
          </View>
          <View style={[s.financeCardBody, { marginLeft: 12 }]}>
            <Text style={[s.financeCardTitle, { color: theme.text }]} numberOfLines={2}>
              {item.concepto}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <View style={[s.financeCardBadge, { backgroundColor: `${color}22`, marginTop: 0 }]}>
                <Text style={[s.financeCardBadgeTxt, { color }]}>
                  {isPaid ? 'Pagado' : 'Pendiente'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
              {isPaid ? (
                <Ionicons name={metodoPagoIcon(item.metodoPago)} size={13} color={theme.textMuted} />
              ) : null}
              <Text style={[s.financeCardMeta, { color: theme.textMuted, marginTop: 0, flex: 1 }]} numberOfLines={2}>
                {metaParts.join(' · ')}
              </Text>
            </View>
            {!!item.notas && (
              <Text style={[s.financeCardNotes, { color: theme.textMuted }]} numberOfLines={2}>
                {item.notas}
              </Text>
            )}
          </View>
          <View style={s.financeCardAmountCol}>
            <Text style={[s.financeCardAmount, { color: cc }]}>{fmtMoney(item.monto)}</Text>
          </View>
        </View>

        <View style={[s.financeCardActions, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[s.financeCardActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={() => openEdit(item)}
            hitSlop={6}
          >
            <Ionicons name="create-outline" size={15} color={cc} />
            <Text style={[s.financeCardActionTxt, { color: cc }]}>Editar</Text>
          </TouchableOpacity>
          {!!item.facturaUrl && (
            <TouchableOpacity
              style={[s.financeCardActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() =>
                openAttachmentUrl(item.facturaUrl).catch((e) =>
                  showAlert('Error', e.message || 'No se pudo abrir.'),
                )
              }
              hitSlop={6}
            >
              <Ionicons name="document-text-outline" size={15} color={cc} />
              <Text style={[s.financeCardActionTxt, { color: cc }]}>Factura</Text>
            </TouchableOpacity>
          )}
          {!!item.pagoComprobanteUrl && (
            <TouchableOpacity
              style={[s.financeCardActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() =>
                openAttachmentUrl(item.pagoComprobanteUrl).catch((e) =>
                  showAlert('Error', e.message || 'No se pudo abrir.'),
                )
              }
              hitSlop={6}
            >
              <Ionicons name="document-attach-outline" size={15} color={cc} />
              <Text style={[s.financeCardActionTxt, { color: cc }]}>Comprobante</Text>
            </TouchableOpacity>
          )}
          {!isPaid && (
            <TouchableOpacity
              style={[s.financeCardActionBtn, { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }]}
              onPress={() => openPayFor(item)}
              hitSlop={6}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color="#10b981" />
              <Text style={[s.financeCardActionTxt, { color: '#10b981' }]}>Registrar pago</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.financeCardActionBtn, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}
            onPress={() => confirmDelete(item)}
            disabled={busy}
            hitSlop={6}
          >
            <Ionicons name="trash-outline" size={15} color="#ef4444" />
            <Text style={[s.financeCardActionTxt, { color: '#ef4444' }]}>
              {busy ? 'Eliminando…' : 'Eliminar'}
            </Text>
          </TouchableOpacity>
        </View>
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

      {/* Create / edit bill */}
      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={closeCreate}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '92%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                {editingId ? 'Editar factura' : 'Nueva factura'}
              </Text>
              <TouchableOpacity onPress={closeCreate}>
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

              {!editingId ? (
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
              ) : null}

              {!editingId && payOnCreate && (
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
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnTxt}>{editingId ? 'Guardar cambios' : 'Guardar'}</Text>
                )}
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
