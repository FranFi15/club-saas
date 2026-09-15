import React, { useCallback, useContext, useMemo, useState } from 'react';
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
  Image,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { finanzasStyles as s } from './finanzasStyles';
import { METODOS, MN, fmtMoney, contrastOutlineBtn } from './finanzasConstants';
import { pickAndUploadImage, pickAndUploadAttachment, openAttachmentUrl } from './finanzasUpload';
import CustomAlert from '../../../components/CustomAlert';
import DesignCard from '../../../components/DesignCard';
import { ThemeContext } from '../../../context/ThemeContext';

const ROLE_OPTIONS = [
  { value: 'atleta', label: 'Atletas' },
  { value: 'tutor', label: 'Tutores' },
  { value: 'socio', label: 'Socios' },
];

const emptyForm = () => ({
  nombre: '',
  fotoUrl: '',
  montoMensual: '',
  beneficios: '',
  rolesAplicables: [],
  cuotasSociales: [],
  activo: true,
});

function benefitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function SponsorsTab({ clubData, theme, primaryColor, getHeaders, showAlert, mes, anio }) {
  const { isDarkMode } = useContext(ThemeContext);
  const cc = primaryColor;
  const periodMes = mes || new Date().getMonth() + 1;
  const periodAnio = anio || new Date().getFullYear();
  const cacheKey = clubData?.urlIdentifier
    ? `finanzas-sponsors:${clubData.urlIdentifier}:${periodMes}-${periodAnio}`
    : '';

  const [sponsors, setSponsors] = useState(() => readScreenCache(cacheKey)?.sponsors ?? []);
  const [socialFees, setSocialFees] = useState(() => readScreenCache(cacheKey)?.socialFees ?? []);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payMetodo, setPayMetodo] = useState('transferencia');
  const [payComprobante, setPayComprobante] = useState('');
  const [payNotas, setPayNotas] = useState('');
  const [payUploading, setPayUploading] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({
    visible: false,
    title: '',
    message: '',
    isDanger: true,
    confirmText: 'Eliminar',
    onConfirm: () => {},
  });

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const [spRes, feeRes] = await Promise.all([
      clubApi.get('/financial/sponsors', {
        headers: h,
        params: { includeInactive: true, mes: periodMes, anio: periodAnio },
      }),
      clubApi.get('/financial/social-fees', { headers: h }).catch(() => ({ data: [] })),
    ]);
    const feesRaw = feeRes.data;
    return {
      sponsors: spRes.data?.sponsors || [],
      socialFees: Array.isArray(feesRaw) ? feesRaw : feesRaw?.fees || [],
    };
  }, [getHeaders, periodMes, periodAnio]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey,
    enabled: !!cacheKey,
    fetchData,
    onFetched: (data) => {
      setSponsors(data.sponsors);
      setSocialFees(Array.isArray(data.socialFees) ? data.socialFees : []);
    },
    onFetchError: () => showAlert('Error', 'No se pudieron cargar los sponsors.'),
  });

  const sorted = useMemo(
    () =>
      [...sponsors].sort((a, b) => {
        if (a.activo === false && b.activo !== false) return 1;
        if (a.activo !== false && b.activo === false) return -1;
        const aPaid = a.pagoMes?.estado === 'pagado';
        const bPaid = b.pagoMes?.estado === 'pagado';
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
      }),
    [sponsors],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item._id);
    setForm({
      nombre: item.nombre || '',
      fotoUrl: item.fotoUrl || '',
      montoMensual: item.montoMensual != null ? String(item.montoMensual) : '',
      beneficios: item.beneficios || '',
      rolesAplicables: Array.isArray(item.rolesAplicables) ? [...item.rolesAplicables] : [],
      cuotasSociales: (item.cuotasSociales || []).map((f) => String(f._id || f)),
      activo: item.activo !== false,
    });
    setFormOpen(true);
  };

  const toggleRole = (value) => {
    setForm((prev) => {
      const has = prev.rolesAplicables.includes(value);
      return {
        ...prev,
        rolesAplicables: has
          ? prev.rolesAplicables.filter((r) => r !== value)
          : [...prev.rolesAplicables, value],
      };
    });
  };

  const toggleFee = (id) => {
    const sid = String(id);
    setForm((prev) => {
      const has = prev.cuotasSociales.includes(sid);
      return {
        ...prev,
        cuotasSociales: has
          ? prev.cuotasSociales.filter((x) => x !== sid)
          : [...prev.cuotasSociales, sid],
      };
    });
  };

  const uploadPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadImage(clubData);
      if (url) setForm((prev) => ({ ...prev, fotoUrl: url }));
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir la foto.');
    } finally {
      setUploading(false);
    }
  };

  const saveForm = async () => {
    if (!form.nombre.trim()) {
      showAlert('Atención', 'El nombre es obligatorio.');
      return;
    }
    if (!form.rolesAplicables.length && !form.cuotasSociales.length) {
      showAlert('Atención', 'Seleccioná al menos un tipo de usuario o una cuota social.');
      return;
    }
    setSaving(true);
    try {
      const h = await getHeaders();
      const payload = {
        nombre: form.nombre.trim(),
        fotoUrl: form.fotoUrl.trim(),
        montoMensual: form.montoMensual === '' ? 0 : Number(String(form.montoMensual).replace(',', '.')),
        beneficios: form.beneficios,
        rolesAplicables: form.rolesAplicables,
        cuotasSociales: form.cuotasSociales,
        activo: form.activo,
        mes: periodMes,
        anio: periodAnio,
      };
      if (editingId) {
        await clubApi.patch(`/financial/sponsors/${editingId}`, payload, { headers: h });
        showAlert('Listo', 'Sponsor actualizado.');
      } else {
        await clubApi.post('/financial/sponsors', payload, { headers: h });
        showAlert('Listo', 'Sponsor creado.');
      }
      setFormOpen(false);
      reload({ background: true });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el sponsor.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    setConfirmCfg({
      visible: true,
      title: 'Eliminar sponsor',
      message: `¿Eliminar a ${item.nombre}? Esta acción no se puede deshacer.`,
      isDanger: true,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        try {
          const h = await getHeaders();
          await clubApi.delete(`/financial/sponsors/${item._id}`, { headers: h });
          showAlert('Listo', 'Sponsor eliminado.');
          reload({ background: true });
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
        }
      },
    });
  };

  const openPay = (item) => {
    setPayTarget(item);
    setPayMetodo('transferencia');
    setPayComprobante(item.pagoMes?.comprobanteUrl || '');
    setPayNotas(item.pagoMes?.notas || '');
    setPayOpen(true);
  };

  const uploadPayComprobante = async () => {
    setPayUploading(true);
    try {
      const url = await pickAndUploadAttachment(clubData);
      if (url) setPayComprobante(url);
    } catch (e) {
      showAlert('Error', e.message || 'No se pudo subir el comprobante.');
    } finally {
      setPayUploading(false);
    }
  };

  const savePay = async () => {
    if (!payTarget?._id) return;
    setSaving(true);
    try {
      const h = await getHeaders();
      await clubApi.patch(
        `/financial/sponsors/${payTarget._id}/pay-month`,
        {
          mes: periodMes,
          anio: periodAnio,
          metodoPago: payMetodo,
          comprobanteUrl: payComprobante,
          notas: payNotas,
          monto: payTarget.pagoMes?.monto ?? payTarget.montoMensual,
        },
        { headers: h },
      );
      setPayOpen(false);
      showAlert('Listo', `Pago de ${MN[periodMes - 1]} ${periodAnio} confirmado.`);
      reload({ background: true });
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo confirmar el pago.');
    } finally {
      setSaving(false);
    }
  };

  const revertPay = (item) => {
    setConfirmCfg({
      visible: true,
      title: 'Revertir pago',
      message: `¿Marcar el aporte de ${item.nombre} en ${MN[periodMes - 1]} ${periodAnio} como pendiente?`,
      isDanger: false,
      confirmText: 'Revertir',
      onConfirm: async () => {
        setConfirmCfg((p) => ({ ...p, visible: false }));
        try {
          const h = await getHeaders();
          await clubApi.patch(
            `/financial/sponsors/${item._id}/unpay-month`,
            { mes: periodMes, anio: periodAnio },
            { headers: h },
          );
          showAlert('Listo', 'Pago revertido a pendiente.');
          reload({ background: true });
        } catch (e) {
          showAlert('Error', e.response?.data?.message || 'No se pudo revertir.');
        }
      },
    });
  };

  const renderItem = ({ item }) => {
    const inactive = item.activo === false;
    const pago = item.pagoMes;
    const paid = pago?.estado === 'pagado';
    const expected = pago?.monto ?? item.montoMensual;

    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={inactive ? '#9ca3af' : paid ? '#10b981' : '#f59e0b'}
        muted={inactive}
        style={{ marginBottom: 12, opacity: inactive ? 0.75 : 1 }}
        contentStyle={styles.cardInner}
      >
        <View style={styles.cardMain}>
          {item.fotoUrl ? (
            <Image source={{ uri: item.fotoUrl }} style={styles.logo} />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="ribbon-outline" size={22} color={theme.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]}>{item.nombre}</Text>
            <Text style={{ color: cc, fontWeight: '700', marginTop: 4 }}>{fmtMoney(expected)} · {MN[periodMes - 1]}</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: paid ? '#10b98118' : '#f59e0b18',
                  borderColor: paid ? '#10b981' : '#f59e0b',
                },
              ]}
            >
              <Text style={{ color: paid ? '#10b981' : '#f59e0b', fontSize: 11, fontWeight: '800' }}>
                {paid ? 'Pagado' : 'Pendiente'}
              </Text>
            </View>
            {inactive ? (
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Inactivo</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.actionsRow, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={() => openEdit(item)}
          >
            <Ionicons name="pencil-outline" size={15} color={theme.text} />
            <Text style={[styles.actionTxt, { color: theme.text }]}>Editar</Text>
          </TouchableOpacity>
          {!paid ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }]}
              onPress={() => openPay(item)}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color="#10b981" />
              <Text style={[styles.actionTxt, { color: '#10b981' }]}>Confirmar</Text>
            </TouchableOpacity>
          ) : (
            <>
              {pago?.comprobanteUrl ? (
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={async () => {
                    try {
                      await openAttachmentUrl(pago.comprobanteUrl);
                    } catch (e) {
                      showAlert('Error', e.message || 'No se pudo abrir el comprobante.');
                    }
                  }}
                >
                  <Ionicons name="image-outline" size={15} color={theme.text} />
                  <Text style={[styles.actionTxt, { color: theme.text }]}>Comprobante</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}
                onPress={() => openPay(item)}
              >
                <Ionicons name="create-outline" size={15} color="#d97706" />
                <Text style={[styles.actionTxt, { color: '#d97706' }]}>Actualizar</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}
            onPress={() => confirmDelete(item)}
          >
            <Ionicons name="trash-outline" size={15} color="#ef4444" />
            <Text style={[styles.actionTxt, { color: '#ef4444' }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </DesignCard>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <CustomAlert
        visible={confirmCfg.visible}
        title={confirmCfg.title}
        message={confirmCfg.message}
        showCancel
        isDanger={confirmCfg.isDanger}
        confirmText={confirmCfg.confirmText}
        onConfirm={confirmCfg.onConfirm}
        onCancel={() => setConfirmCfg((p) => ({ ...p, visible: false }))}
      />

      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            Confirmá el pago y adjuntá el comprobante
          </Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: cc }]} onPress={openCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {loading && !sponsors.length ? (
        <ActivityIndicator color={cc} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
          ListEmptyComponent={
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
              Todavía no hay sponsors. Agregá el primero.
            </Text>
          }
          renderItem={renderItem}
        />
      )}

      <Modal visible={payOpen} animationType="slide" transparent onRequestClose={() => setPayOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                {payTarget?.pagoMes?.estado === 'pagado' ? 'Actualizar pago' : 'Confirmar pago'}
              </Text>
              <TouchableOpacity onPress={() => setPayOpen(false)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {payTarget ? (
                <View style={[s.payInfo, { backgroundColor: `${cc}14` }]}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{payTarget.nombre}</Text>
                  <Text style={{ color: theme.textMuted, marginTop: 4 }}>
                    {MN[periodMes - 1]} {periodAnio}
                  </Text>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 22, marginTop: 6 }}>
                    {fmtMoney(payTarget.pagoMes?.monto ?? payTarget.montoMensual)}
                  </Text>
                </View>
              ) : null}

              <Text style={[s.label, { color: theme.textMuted }]}>Método de pago</Text>
              <View style={styles.chipRow}>
                {METODOS.map((m) => {
                  const on = payMetodo === m.value;
                  return (
                    <TouchableOpacity
                      key={m.value}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? cc : theme.border,
                          backgroundColor: on ? cc + '22' : theme.background,
                        },
                      ]}
                      onPress={() => setPayMetodo(m.value)}
                    >
                      <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Comprobante (imagen o PDF)</Text>
              <TouchableOpacity
                onPress={uploadPayComprobante}
                disabled={payUploading}
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
                <Text style={{ color: payComprobante ? cc : theme.textMuted, flex: 1 }} numberOfLines={1}>
                  {payUploading ? 'Subiendo…' : payComprobante ? 'Comprobante subido ✓' : 'Subir comprobante'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={20} color={cc} />
              </TouchableOpacity>
              {payComprobante ? (
                <TouchableOpacity onPress={() => setPayComprobante('')} style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#ef4444', fontWeight: '600' }}>Quitar comprobante</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={[s.label, { color: theme.textMuted }]}>Notas</Text>
              <TextInput
                style={[
                  s.input,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.background, minHeight: 70 },
                ]}
                multiline
                value={payNotas}
                onChangeText={setPayNotas}
                placeholderTextColor={theme.textMuted}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: '#10b981', opacity: saving ? 0.7 : 1 }]}
                onPress={savePay}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnTxt}>
                    {payTarget?.pagoMes?.estado === 'pagado' ? 'Guardar cambios' : 'Confirmar pago'}
                  </Text>
                )}
              </TouchableOpacity>

              {payTarget?.pagoMes?.estado === 'pagado' ? (
                <TouchableOpacity
                  style={[
                    s.saveBtn,
                    {
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: '#f59e0b',
                      backgroundColor: '#fffbeb',
                    },
                  ]}
                  onPress={() => {
                    setPayOpen(false);
                    revertPay(payTarget);
                  }}
                  disabled={saving}
                >
                  <Text style={[s.saveBtnTxt, { color: '#d97706' }]}>Revertir a pendiente</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFormOpen(false)} />
          <View style={[s.modalContent, { backgroundColor: theme.surface, maxHeight: '88%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                {editingId ? 'Editar sponsor' : 'Nuevo sponsor'}
              </Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={12} accessibilityLabel="Cerrar">
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 12 }}
            >
              <TouchableOpacity style={styles.photoBtn} onPress={uploadPhoto} disabled={uploading}>
                {form.fotoUrl ? (
                  <Image source={{ uri: form.fotoUrl }} style={styles.photoPreview} />
                ) : (
                  <View style={[styles.photoPlaceholder, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    {uploading ? (
                      <ActivityIndicator color={cc} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={24} color={theme.textMuted} />
                        <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 12 }}>Foto / logo</Text>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
              {form.fotoUrl ? (
                <TouchableOpacity onPress={() => setForm((p) => ({ ...p, fotoUrl: '' }))} style={{ alignSelf: 'center', marginBottom: 8 }}>
                  <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>Quitar foto</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={[s.label, { color: theme.textMuted }]}>Nombre</Text>
              <TextInput
                style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={form.nombre}
                onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))}
                placeholder="Nombre del sponsor"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Aporte mensual</Text>
              <TextInput
                style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={form.montoMensual}
                onChangeText={(t) => setForm((p) => ({ ...p, montoMensual: t.replace(/[^0-9.,]/g, '') }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Beneficios (una línea por beneficio)</Text>
              <TextInput
                style={[
                  s.input,
                  styles.beneficiosInput,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                ]}
                value={form.beneficios}
                onChangeText={(t) => setForm((p) => ({ ...p, beneficios: t }))}
                placeholder={'Ej.\n10% en indumentaria\nEntrada libre a eventos'}
                placeholderTextColor={theme.textMuted}
                multiline
                textAlignVertical="top"
              />

              <Text style={[s.label, { color: theme.textMuted }]}>Tipos de usuario</Text>
              <View style={styles.chipRow}>
                {ROLE_OPTIONS.map((opt) => {
                  const on = form.rolesAplicables.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? cc : theme.border,
                          backgroundColor: on ? cc + '22' : theme.background,
                        },
                      ]}
                      onPress={() => toggleRole(opt.value)}
                    >
                      <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>Cuotas sociales</Text>
              {socialFees.length === 0 ? (
                <Text style={{ color: theme.textMuted, marginBottom: 12, fontSize: 13 }}>
                  No hay cuotas sociales cargadas.
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {socialFees.map((fee) => {
                    const id = String(fee._id);
                    const on = form.cuotasSociales.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.chip,
                          {
                            borderColor: on ? cc : theme.border,
                            backgroundColor: on ? cc + '22' : theme.background,
                          },
                        ]}
                        onPress={() => toggleFee(id)}
                      >
                        <Text style={{ color: on ? cc : theme.text, fontWeight: '600', fontSize: 13 }}>
                          {fee.nombre || 'Cuota'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {editingId ? (
                <TouchableOpacity
                  style={[styles.activeToggle, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={() => setForm((p) => ({ ...p, activo: !p.activo }))}
                >
                  <Ionicons
                    name={form.activo ? 'checkmark-circle' : 'pause-circle-outline'}
                    size={20}
                    color={form.activo ? '#10b981' : theme.textMuted}
                  />
                  <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>
                    {form.activo ? 'Activo' : 'Inactivo'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: cc, marginTop: 12 }]}
                onPress={saveForm}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnTxt}>Guardar</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.saveBtn,
                  contrastOutlineBtn(theme, isDarkMode),
                  { marginTop: 10, borderWidth: 1 },
                ]}
                onPress={() => setFormOpen(false)}
              >
                <Text style={[s.saveBtnTxt, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cardInner: { paddingBottom: 10 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 10 },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '800' },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionTxt: { fontSize: 12, fontWeight: '700' },
  photoBtn: { alignSelf: 'center', marginBottom: 6 },
  photoPreview: { width: 72, height: 72, borderRadius: 14 },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficiosInput: { minHeight: 72, paddingTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
});
