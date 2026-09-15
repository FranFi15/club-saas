import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../../../utils/api';
import { readScreenCache, useCachedFocusLoad } from '../../../hooks/useCachedFocusLoad';
import { finanzasStyles as s } from './finanzasStyles';
import { fmtMoney, contrastOutlineBtn } from './finanzasConstants';
import { pickAndUploadImage } from './finanzasUpload';
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
  registro: '',
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

export default function SponsorsTab({ clubData, theme, primaryColor, getHeaders, showAlert }) {
  const { isDarkMode } = useContext(ThemeContext);
  const cc = primaryColor;
  const cacheKey = clubData?.urlIdentifier ? `finanzas-sponsors:${clubData.urlIdentifier}` : '';

  const [sponsors, setSponsors] = useState(() => readScreenCache(cacheKey)?.sponsors ?? []);
  const [socialFees, setSocialFees] = useState(() => readScreenCache(cacheKey)?.socialFees ?? []);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const fetchData = useCallback(async () => {
    const h = await getHeaders();
    const [spRes, feeRes] = await Promise.all([
      clubApi.get('/financial/sponsors', { headers: h, params: { includeInactive: true } }),
      clubApi.get('/financial/social-fees', { headers: h }).catch(() => ({ data: [] })),
    ]);
    const feesRaw = feeRes.data;
    return {
      sponsors: spRes.data?.sponsors || [],
      socialFees: Array.isArray(feesRaw) ? feesRaw : feesRaw?.fees || [],
    };
  }, [getHeaders]);

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
      registro: item.registro || '',
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
        registro: form.registro.trim(),
        fotoUrl: form.fotoUrl.trim(),
        montoMensual: form.montoMensual === '' ? 0 : Number(form.montoMensual),
        beneficios: form.beneficios,
        rolesAplicables: form.rolesAplicables,
        cuotasSociales: form.cuotasSociales,
        activo: form.activo,
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

  const renderItem = ({ item }) => {
    const inactive = item.activo === false;
    const roles = (item.rolesAplicables || [])
      .map((r) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r)
      .join(', ');
    const fees = (item.cuotasSociales || [])
      .map((f) => (typeof f === 'object' ? f.nombre : null))
      .filter(Boolean)
      .join(', ');
    const lines = benefitLines(item.beneficios);

    return (
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={inactive ? '#9ca3af' : cc}
        muted={inactive}
        style={{ marginBottom: 12, opacity: inactive ? 0.75 : 1 }}
        contentStyle={styles.cardInner}
        onPress={() => openEdit(item)}
      >
        {item.fotoUrl ? (
          <Image source={{ uri: item.fotoUrl }} style={styles.logo} />
        ) : (
          <View style={[styles.logoPlaceholder, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="ribbon-outline" size={22} color={theme.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.text }]}>{item.nombre}</Text>
          {item.registro ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{item.registro}</Text>
          ) : null}
          <Text style={{ color: cc, fontWeight: '700', marginTop: 4 }}>{fmtMoney(item.montoMensual)} / mes</Text>
          {roles ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>Usuarios: {roles}</Text>
          ) : null}
          {fees ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Cuotas: {fees}</Text>
          ) : null}
          {lines.length ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
              {lines.join(' · ')}
            </Text>
          ) : null}
          {inactive ? (
            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Inactivo</Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
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
        isDanger
        confirmText="Eliminar"
        onConfirm={confirmCfg.onConfirm}
        onCancel={() => setConfirmCfg((p) => ({ ...p, visible: false }))}
      />

      <View style={styles.topBar}>
        <Text style={{ color: theme.textMuted, flex: 1, fontSize: 13 }}>
          Sponsors con beneficios para miembros al día
        </Text>
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

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingId ? 'Editar sponsor' : 'Nuevo sponsor'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.photoBtn} onPress={uploadPhoto} disabled={uploading}>
              {form.fotoUrl ? (
                <Image source={{ uri: form.fotoUrl }} style={styles.photoPreview} />
              ) : (
                <View style={[styles.photoPlaceholder, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  {uploading ? (
                    <ActivityIndicator color={cc} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={28} color={theme.textMuted} />
                      <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Foto / logo</Text>
                    </>
                  )}
                </View>
              )}
            </TouchableOpacity>
            {form.fotoUrl ? (
              <TouchableOpacity onPress={() => setForm((p) => ({ ...p, fotoUrl: '' }))} style={{ alignSelf: 'center', marginBottom: 12 }}>
                <Text style={{ color: '#ef4444', fontWeight: '600' }}>Quitar foto</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[s.label, { color: theme.textMuted }]}>Nombre</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              value={form.nombre}
              onChangeText={(t) => setForm((p) => ({ ...p, nombre: t }))}
              placeholder="Nombre del sponsor"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[s.label, { color: theme.textMuted }]}>Registro / CUIT</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              value={form.registro}
              onChangeText={(t) => setForm((p) => ({ ...p, registro: t }))}
              placeholder="Ej. 30-12345678-9"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[s.label, { color: theme.textMuted }]}>Aporte mensual</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
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
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
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
                        backgroundColor: on ? cc + '22' : theme.surface,
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
                          backgroundColor: on ? cc + '22' : theme.surface,
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
                style={[styles.activeToggle, { borderColor: theme.border, backgroundColor: theme.surface }]}
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
              style={[s.saveBtn, { backgroundColor: cc, marginTop: 16 }]}
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
  cardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  photoBtn: { alignSelf: 'center', marginBottom: 8 },
  photoPreview: { width: 96, height: 96, borderRadius: 16 },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficiosInput: { minHeight: 100, paddingTop: 12 },
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
