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
import UserAvatar from '../../../components/UserAvatar';
import { finanzasStyles as s } from './finanzasStyles';
import { MN, METODOS, fmtMoney, metodoPagoLabel, metodoPagoIcon } from './finanzasConstants';
import { pickAndUploadAttachment, openAttachmentUrl } from './finanzasUpload';
import CustomAlert from '../../../components/CustomAlert';

const ROL_LABEL = {
  admin_club: 'Admin',
  administrativo: 'Administrativo',
  control_ingreso: 'Control ingreso',
  colaborador: 'Colaborador',
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

export default function NominaTab({
  clubData,
  theme,
  primaryColor,
  getHeaders,
  showAlert,
  mes,
  anio,
}) {
  const cc = primaryColor;
  const panelBg = theme.surface || '#ffffff';
  const cacheKey = clubData?.urlIdentifier ? `finanzas-nomina:${clubData.urlIdentifier}` : '';

  const [entries, setEntries] = useState(() => readScreenCache(cacheKey)?.entries ?? []);
  const [staffList, setStaffList] = useState(() => readScreenCache(cacheKey)?.staff ?? []);
  const [nameFilter, setNameFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formStaffId, setFormStaffId] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formMes, setFormMes] = useState(mes);
  const [formAnio, setFormAnio] = useState(anio);
  const [formMetodo, setFormMetodo] = useState('transferencia');
  const [formComprobante, setFormComprobante] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [pickingStaff, setPickingStaff] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [confirmCfg, setConfirmCfg] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const params = { page: 1, limit: 100, mes, anio };
    const [payrollRes, staffRes] = await Promise.all([
      clubApi.get('/financial/payroll', { headers: h, params }),
      clubApi.get('/financial/payroll/staff', { headers: h }),
    ]);
    return {
      entries: payrollRes.data.entries || [],
      staff: staffRes.data.staff || [],
    };
  }, [getHeaders, mes, anio]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: `${cacheKey}:${mes}-${anio}`,
    enabled: !!cacheKey,
    fetchData,
    onFetched: (data) => {
      setEntries(data.entries);
      setStaffList(data.staff);
    },
    onFetchError: () => showAlert('Error', 'No se pudo cargar la nómina.'),
  });

  const filteredEntries = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((item) => {
      const name = staffLabel(item.staff).toLowerCase();
      const email = (item.staff?.email || '').toLowerCase();
      const rol = (ROL_LABEL[item.staff?.rol] || item.staff?.rol || '').toLowerCase();
      return name.includes(q) || email.includes(q) || rol.includes(q);
    });
  }, [entries, nameFilter]);

  const filteredStaffForPicker = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((u) => {
      const name = staffLabel(u).toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [staffList, pickerSearch]);

  const selectedStaff = useMemo(
    () => staffList.find((u) => String(u._id) === String(formStaffId)),
    [staffList, formStaffId],
  );

  const openCreate = () => {
    setEditingId(null);
    setFormStaffId('');
    setFormMonto('');
    setFormMes(mes);
    setFormAnio(anio);
    setFormMetodo('transferencia');
    setFormComprobante('');
    setFormNotas('');
    setPickerSearch('');
    setPickingStaff(false);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item._id);
    setFormStaffId(item.staff?._id ? String(item.staff._id) : '');
    setFormMonto(item.monto != null ? String(item.monto) : '');
    setFormMes(item.mes || mes);
    setFormAnio(item.anio || anio);
    setFormMetodo(item.metodoPago || 'transferencia');
    setFormComprobante(item.comprobanteUrl || '');
    setFormNotas(item.notas || '');
    setPickerSearch('');
    setPickingStaff(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setPickingStaff(false);
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
    const montoNum = Number(String(formMonto).replace(',', '.'));
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      showAlert('Monto', 'Ingresá un monto válido.');
      return;
    }
    setSaving(true);
    try {
      const h = await getHeaders();
      if (editingId) {
        await clubApi.patch(
          `/financial/payroll/${editingId}`,
          {
            monto: montoNum,
            mes: formMes,
            anio: formAnio,
            metodoPago: formMetodo,
            comprobanteUrl: formComprobante || '',
            notas: formNotas.trim(),
          },
          { headers: h },
        );
        closeModal();
        await reload({ background: true });
        showAlert('Listo', 'Pago de nómina actualizado.');
      } else {
        await clubApi.post(
          '/financial/payroll',
          {
            staffId: formStaffId,
            monto: montoNum,
            mes: formMes,
            anio: formAnio,
            metodoPago: formMetodo,
            comprobanteUrl: formComprobante || undefined,
            notas: formNotas.trim() || undefined,
          },
          { headers: h },
        );
        closeModal();
        await reload({ background: true });
        showAlert('Listo', 'Pago de nómina registrado.');
      }
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

  const renderItem = ({ item }) => {
    const busy = String(deletingId) === String(item._id);
    const role = ROL_LABEL[item.staff?.rol] || item.staff?.rol || '—';
    const method = metodoPagoLabel(item.metodoPago) || '—';
    const dateTxt = item.fechaPago
      ? new Date(item.fechaPago).toLocaleDateString('es-AR')
      : null;
    const periodDiffers = item.mes !== mes || item.anio !== anio;
    const metaParts = [
      role,
      method,
      dateTxt,
      periodDiffers ? `${MN[(item.mes || 1) - 1]} ${item.anio}` : null,
    ].filter(Boolean);

    return (
      <View style={[s.financeListCard, { backgroundColor: panelBg, borderColor: theme.border }]}>
        <View style={s.financeCardTop}>
          <UserAvatar user={item.staff} size={44} colorMarca={cc} />
          <View style={[s.financeCardBody, { marginLeft: 12 }]}>
            <Text style={[s.financeCardTitle, { color: theme.text }]} numberOfLines={1}>
              {staffLabel(item.staff)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 }}>
              <Ionicons name={metodoPagoIcon(item.metodoPago)} size={13} color={theme.textMuted} />
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
          {!!item.comprobanteUrl && (
            <TouchableOpacity
              style={[s.financeCardActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() =>
                openAttachmentUrl(item.comprobanteUrl).catch((e) =>
                  showAlert('Error', e.message || 'No se pudo abrir.'),
                )
              }
              hitSlop={6}
            >
              <Ionicons name="document-attach-outline" size={15} color={cc} />
              <Text style={[s.financeCardActionTxt, { color: cc }]}>Comprobante</Text>
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
        <Text style={[s.sectionTitle, { color: theme.text }]}>Nómina</Text>
        <Text style={[s.sectionSub, { color: theme.textMuted }]}>
          Pagos del personal · {MN[(mes || 1) - 1]} {anio}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 5,
            paddingHorizontal: 12,
            height: 48,
            backgroundColor: panelBg,
            marginBottom: 4,
          }}
        >
          <Ionicons name="search" size={18} color={theme.icon || theme.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={{ flex: 1, color: theme.text, fontSize: 15 }}
            placeholder="Buscar por nombre…"
            placeholderTextColor={theme.textMuted}
            value={nameFilter}
            onChangeText={setNameFilter}
            autoCorrect={false}
            returnKeyType="search"
          />
          {nameFilter ? (
            <TouchableOpacity onPress={() => setNameFilter('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.icon || theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading && entries.length === 0 ? (
        <ActivityIndicator color={cc} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="wallet-outline" size={40} color={theme.textMuted} />
              <Text style={[s.emptyTxt, { color: theme.text }]}>
                {nameFilter.trim() ? 'Sin resultados' : 'Sin pagos registrados'}
              </Text>
              <Text style={[s.emptySub, { color: theme.textMuted }]}>
                {nameFilter.trim()
                  ? 'Probá con otro nombre.'
                  : 'Registrá un pago de nómina con el botón +.'}
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[s.fab, { backgroundColor: cc }]} onPress={openCreate}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: panelBg, maxHeight: '92%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                {editingId ? 'Editar pago' : 'Registrar pago'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[s.label, { color: theme.textMuted }]}>Personal</Text>
              {editingId ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 5,
                    paddingHorizontal: 15,
                    paddingVertical: 12,
                    marginBottom: 15,
                    backgroundColor: theme.background,
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>
                    {selectedStaff
                      ? staffLabel(selectedStaff)
                      : staffLabel(entries.find((e) => String(e._id) === String(editingId))?.staff)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
                    La persona no se puede cambiar al editar.
                  </Text>
                </View>
              ) : !pickingStaff ? (
                <TouchableOpacity
                  style={[s.input, { borderColor: theme.border, justifyContent: 'center', backgroundColor: theme.background }]}
                  onPress={() => {
                    setPickerSearch('');
                    setPickingStaff(true);
                  }}
                >
                  <Text style={{ color: selectedStaff ? theme.text : theme.textMuted }}>
                    {selectedStaff ? staffLabel(selectedStaff) : 'Elegir persona…'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 5,
                    backgroundColor: theme.background,
                    marginBottom: 15,
                    maxHeight: 260,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                      height: 48,
                    }}
                  >
                    <Ionicons name="search" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={{ flex: 1, color: theme.text, fontSize: 15, paddingVertical: 8 }}
                      placeholder="Escribí el nombre…"
                      placeholderTextColor={theme.textMuted}
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      autoCorrect={false}
                      autoFocus
                      returnKeyType="search"
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setPickingStaff(false);
                        setPickerSearch('');
                      }}
                      hitSlop={8}
                    >
                      <Text style={{ color: cc, fontWeight: '700', fontSize: 13 }}>Cerrar</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={{ maxHeight: 200 }}
                  >
                    {filteredStaffForPicker.length === 0 ? (
                      <Text style={{ color: theme.textMuted, textAlign: 'center', marginVertical: 16, paddingHorizontal: 12 }}>
                        {pickerSearch.trim() ? 'Sin coincidencias.' : 'No hay personal cargado.'}
                      </Text>
                    ) : (
                      filteredStaffForPicker.map((item) => (
                        <TouchableOpacity
                          key={String(item._id)}
                          onPress={() => {
                            setFormStaffId(item._id);
                            setPickingStaff(false);
                            setPickerSearch('');
                          }}
                          style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}
                        >
                          <Text style={{ color: theme.text, fontWeight: '600' }}>{staffLabel(item)}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            {ROL_LABEL[item.rol] || item.rol}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

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
                  <Text style={s.saveBtnTxt}>{editingId ? 'Guardar cambios' : 'Guardar pago'}</Text>
                )}
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
