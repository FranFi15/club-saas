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
import { MN, METODOS, fmtMoney, metodoPagoLabel } from './finanzasConstants';
import { pickAndUploadAttachment, openAttachmentUrl } from './finanzasUpload';
import CustomAlert from '../../../components/CustomAlert';

const ROL_LABEL = {
  admin_club: 'Admin',
  administrativo: 'Administrativo',
  control_ingreso: 'Control ingreso',
  profe: 'Profe',
  preparador_fisico: 'Prep. físico',
  nutricionista: 'Nutricionista',
  psicologo: 'Psicólogo',
};

function staffLabel(u) {
  if (!u) return '—';
  const name = `${u.nombre || ''} ${u.apellido || ''}`.trim();
  return name || u.email || '—';
}

export default function NominaTab({ clubData, theme, primaryColor, getHeaders, showAlert }) {
  const cc = primaryColor;
  const now = new Date();
  const cacheKey = clubData?.urlIdentifier ? `finanzas-nomina:${clubData.urlIdentifier}` : '';

  const [entries, setEntries] = useState(() => readScreenCache(cacheKey)?.entries ?? []);
  const [staffList, setStaffList] = useState(() => readScreenCache(cacheKey)?.staff ?? []);
  const [filterStaff, setFilterStaff] = useState('');
  const [filterMes, setFilterMes] = useState(now.getMonth() + 1);
  const [filterAnio, setFilterAnio] = useState(now.getFullYear());
  const [usePeriodFilter, setUsePeriodFilter] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formStaffId, setFormStaffId] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formMes, setFormMes] = useState(now.getMonth() + 1);
  const [formAnio, setFormAnio] = useState(now.getFullYear());
  const [formMetodo, setFormMetodo] = useState('transferencia');
  const [formComprobante, setFormComprobante] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmCfg, setConfirmCfg] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const params = { page: 1, limit: 60 };
    if (filterStaff) params.staff = filterStaff;
    if (usePeriodFilter) {
      params.mes = filterMes;
      params.anio = filterAnio;
    }
    const [payrollRes, staffRes] = await Promise.all([
      clubApi.get('/financial/payroll', { headers: h, params }),
      clubApi.get('/financial/payroll/staff', { headers: h }),
    ]);
    return {
      entries: payrollRes.data.entries || [],
      staff: staffRes.data.staff || [],
    };
  }, [getHeaders, filterStaff, filterMes, filterAnio, usePeriodFilter]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: `${cacheKey}:${filterStaff}:${usePeriodFilter ? `${filterMes}-${filterAnio}` : 'all'}`,
    enabled: !!cacheKey,
    fetchData,
    onFetched: (data) => {
      setEntries(data.entries);
      setStaffList(data.staff);
    },
    onFetchError: () => showAlert('Error', 'No se pudo cargar la nómina.'),
  });

  const selectedStaff = useMemo(
    () => staffList.find((u) => String(u._id) === String(formStaffId)),
    [staffList, formStaffId],
  );

  const openCreate = () => {
    setFormStaffId(filterStaff || '');
    setFormMonto('');
    setFormMes(filterMes);
    setFormAnio(filterAnio);
    setFormMetodo('transferencia');
    setFormComprobante('');
    setFormNotas('');
    setModalOpen(true);
  };

  const uploadProof = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadAttachment(clubData);
      if (url) setFormComprobante(url);
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const saveEntry = async () => {
    if (!formStaffId) {
      showAlert('Personal', 'Elegí a quién se le paga.');
      return;
    }
    const monto = Number(String(formMonto).replace(',', '.'));
    if (!Number.isFinite(monto) || monto < 0) {
      showAlert('Monto', 'Ingresá un monto válido.');
      return;
    }
    setSaving(true);
    try {
      const h = await getHeaders();
      await clubApi.post(
        '/financial/payroll',
        {
          staffId: formStaffId,
          monto,
          mes: formMes,
          anio: formAnio,
          metodoPago: formMetodo,
          comprobanteUrl: formComprobante || undefined,
          notas: formNotas.trim() || undefined,
        },
        { headers: h },
      );
      setModalOpen(false);
      await reload({ background: true });
      showAlert('Listo', 'Pago de nómina registrado.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    setConfirmCfg({
      visible: true,
      title: 'Eliminar pago',
      message: `¿Eliminar el pago de ${fmtMoney(item.monto)} a ${staffLabel(item.staff)}?`,
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        setDeletingId(item._id);
        try {
          const h = await getHeaders();
          await clubApi.delete(`/financial/payroll/${item._id}`, { headers: h });
          await reload({ background: true });
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const chgFilterMonth = (delta) => {
    let m = filterMes + delta;
    let a = filterAnio;
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    setFilterMes(m);
    setFilterAnio(a);
    setUsePeriodFilter(true);
  };

  const renderItem = ({ item }) => {
    const busy = String(deletingId) === String(item._id);
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.planName, { color: theme.text }]} numberOfLines={1}>
            {staffLabel(item.staff)}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {ROL_LABEL[item.staff?.rol] || item.staff?.rol || '—'} · {MN[(item.mes || 1) - 1]} {item.anio}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {metodoPagoLabel(item.metodoPago)}
            {item.fechaPago
              ? ` · ${new Date(item.fechaPago).toLocaleDateString('es-AR')}`
              : ''}
          </Text>
          {!!item.notas && (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
              {item.notas}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            {!!item.comprobanteUrl && (
              <TouchableOpacity
                onPress={() =>
                  openAttachmentUrl(item.comprobanteUrl).catch((e) =>
                    showAlert('Error', e.message || 'No se pudo abrir.'),
                  )
                }
              >
                <Text style={{ color: cc, fontWeight: '700', fontSize: 12 }}>Ver comprobante</Text>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Nómina</Text>
          <TouchableOpacity
            onPress={() => setUsePeriodFilter((v) => !v)}
            style={[s.filterChip, { borderColor: theme.border, backgroundColor: theme.card }]}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
              {usePeriodFilter ? 'Filtrar período' : 'Todos los períodos'}
            </Text>
          </TouchableOpacity>
        </View>

        {usePeriodFilter && (
          <View style={[s.monthRow, { backgroundColor: theme.card, marginTop: 0 }]}>
            <TouchableOpacity onPress={() => chgFilterMonth(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {MN[filterMes - 1]} {filterAnio}
            </Text>
            <TouchableOpacity onPress={() => chgFilterMonth(1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginBottom: 4 }}>
          <TouchableOpacity
            onPress={() => setFilterStaff('')}
            style={[
              s.filterChip,
              {
                borderColor: !filterStaff ? cc : theme.border,
                backgroundColor: !filterStaff ? `${cc}18` : theme.card,
              },
            ]}
          >
            <Text style={{ color: !filterStaff ? cc : theme.text, fontSize: 12, fontWeight: '600' }}>Todo el personal</Text>
          </TouchableOpacity>
          {staffList.map((u) => {
            const active = String(filterStaff) === String(u._id);
            return (
              <TouchableOpacity
                key={u._id}
                onPress={() => setFilterStaff(u._id)}
                style={[
                  s.filterChip,
                  {
                    borderColor: active ? cc : theme.border,
                    backgroundColor: active ? `${cc}18` : theme.card,
                  },
                ]}
              >
                <Text style={{ color: active ? cc : theme.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                  {staffLabel(u)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && entries.length === 0 ? (
        <ActivityIndicator color={cc} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="wallet-outline" size={40} color={theme.textMuted} />
              <Text style={[s.emptyTxt, { color: theme.text }]}>Sin pagos registrados</Text>
              <Text style={[s.emptySub, { color: theme.textMuted }]}>
                Registrá un pago de nómina con el botón +.
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[s.fab, { backgroundColor: cc }]} onPress={openCreate}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: theme.card, maxHeight: '92%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Registrar pago</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[s.label, { color: theme.textMuted }]}>Personal</Text>
              <TouchableOpacity
                style={[s.input, { borderColor: theme.border, justifyContent: 'center', backgroundColor: theme.background }]}
                onPress={() => setStaffPickerOpen(true)}
              >
                <Text style={{ color: selectedStaff ? theme.text : theme.textMuted }}>
                  {selectedStaff ? staffLabel(selectedStaff) : 'Elegir persona…'}
                </Text>
              </TouchableOpacity>

              <Text style={[s.label, { color: theme.textMuted }]}>Monto</Text>
              <TextInput
                style={[s.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                keyboardType="decimal-pad"
                value={formMonto}
                onChangeText={setFormMonto}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Período</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                <TouchableOpacity
                  onPress={() => {
                    let m = formMes - 1;
                    let a = formAnio;
                    if (m < 1) {
                      m = 12;
                      a -= 1;
                    }
                    setFormMes(m);
                    setFormAnio(a);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-back" size={22} color={theme.text} />
                </TouchableOpacity>
                <Text style={{ color: theme.text, fontWeight: '700' }}>
                  {MN[formMes - 1]} {formAnio}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    let m = formMes + 1;
                    let a = formAnio;
                    if (m > 12) {
                      m = 1;
                      a += 1;
                    }
                    setFormMes(m);
                    setFormAnio(a);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-forward" size={22} color={theme.text} />
                </TouchableOpacity>
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Método</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                {METODOS.map((m) => {
                  const active = formMetodo === m.value;
                  return (
                    <TouchableOpacity
                      key={m.value}
                      onPress={() => setFormMetodo(m.value)}
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

              <Text style={[s.label, { color: theme.textMuted }]}>Comprobante (opcional)</Text>
              <TouchableOpacity
                onPress={uploadProof}
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
                <Text style={{ color: formComprobante ? cc : theme.textMuted, flex: 1 }} numberOfLines={1}>
                  {uploading ? 'Subiendo…' : formComprobante ? 'Archivo subido ✓' : 'Subir imagen o PDF'}
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
                value={formNotas}
                onChangeText={setFormNotas}
                placeholderTextColor={theme.textMuted}
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, opacity: saving ? 0.7 : 1 }]}
                onPress={saveEntry}
                disabled={saving || uploading}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnTxt}>Guardar pago</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={staffPickerOpen} animationType="fade" transparent onRequestClose={() => setStaffPickerOpen(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setStaffPickerOpen(false)}>
          <View style={[s.modalContent, { backgroundColor: theme.card, maxHeight: '70%' }]}>
            <Text style={[s.modalTitle, { color: theme.text, marginBottom: 12 }]}>Elegir personal</Text>
            <FlatList
              data={staffList}
              keyExtractor={(item) => String(item._id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setFormStaffId(item._id);
                    setStaffPickerOpen(false);
                  }}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{staffLabel(item)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {ROL_LABEL[item.rol] || item.rol}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>
                  No hay personal cargado.
                </Text>
              }
            />
          </View>
        </TouchableOpacity>
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
