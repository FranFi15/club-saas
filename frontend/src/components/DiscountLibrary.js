import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';

const ROLES = [
  { id: 'socio', label: 'Socio' },
  { id: 'atleta', label: 'Atleta' },
  { id: 'tutor', label: 'Tutor' },
];

const MODOS = [
  { id: 'porcentaje', label: '%' },
  { id: 'precio_fijo', label: 'Precio fijo' },
  { id: 'gratis', label: 'Gratis' },
];

const emptyDraft = () => ({
  nombre: '',
  roles: ['socio'],
  cuotasSociales: [],
  planes: [],
  modo: 'porcentaje',
  valor: '0',
  maxEntradasConDescuento: '1',
});

function toggle(list, id) {
  const values = list || [];
  return values.includes(id) ? values.filter((item) => item !== id) : [...values, id];
}

export default function DiscountLibrary({
  visible,
  onClose,
  onCreated,
  getHeaders,
  theme,
  colorMarca,
  pickers,
  hint = 'Queda guardado para usarlo en este evento y en los próximos.',
  saveLabel = 'Guardar y usar',
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDraft(emptyDraft());
    setError('');
    setSaving(false);
  }, [visible]);

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  const save = async () => {
    const nombre = draft.nombre.trim();
    if (!nombre) {
      setError('Poné un nombre al descuento.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.post(
        '/events/admin/discounts',
        {
          nombre,
          roles: draft.roles,
          cuotasSociales: draft.cuotasSociales,
          planes: draft.planes,
          modo: draft.modo,
          valor: Number(draft.valor) || 0,
          maxEntradasConDescuento: Math.max(1, parseInt(draft.maxEntradasConDescuento, 10) || 1),
        },
        { headers },
      );
      onCreated?.(data);
      onClose?.();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'No se pudo guardar el descuento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.text }]}>Nuevo descuento</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
          {hint}
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
          <TextInput
            style={inputStyle}
            value={draft.nombre}
            onChangeText={(nombre) => setDraft((prev) => ({ ...prev, nombre }))}
            placeholder="Atletas 20%"
            placeholderTextColor={theme.textMuted}
          />
          <Text style={[styles.label, { color: theme.textMuted }]}>Roles</Text>
          <View style={styles.chips}>
            {ROLES.map((role) => {
              const on = draft.roles.includes(role.id);
              return (
                <TouchableOpacity
                  key={role.id}
                  onPress={() => setDraft((prev) => ({ ...prev, roles: toggle(prev.roles, role.id) }))}
                  style={[styles.chip, { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? `${colorMarca}22` : theme.surface }]}
                >
                  <Text style={{ color: on ? colorMarca : theme.text, fontWeight: '700' }}>{role.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {(pickers?.cuotasSociales || []).length ? (
            <>
              <Text style={[styles.label, { color: theme.textMuted }]}>Cuotas sociales</Text>
              <View style={styles.chips}>
                {pickers.cuotasSociales.map((fee) => {
                  const id = String(fee._id);
                  const on = draft.cuotasSociales.includes(id);
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => setDraft((prev) => ({ ...prev, cuotasSociales: toggle(prev.cuotasSociales, id) }))}
                      style={[styles.chip, { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? `${colorMarca}22` : theme.surface }]}
                    >
                      <Text style={{ color: on ? colorMarca : theme.text, fontWeight: '700' }}>{fee.nombre}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}
          {(pickers?.planes || []).length ? (
            <>
              <Text style={[styles.label, { color: theme.textMuted }]}>Planes</Text>
              <View style={styles.chips}>
                {pickers.planes.map((plan) => {
                  const id = String(plan._id);
                  const on = draft.planes.includes(id);
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => setDraft((prev) => ({ ...prev, planes: toggle(prev.planes, id) }))}
                      style={[styles.chip, { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? `${colorMarca}22` : theme.surface }]}
                    >
                      <Text style={{ color: on ? colorMarca : theme.text, fontWeight: '700' }}>{plan.nombre}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}
          <Text style={[styles.label, { color: theme.textMuted }]}>Cómo</Text>
          <View style={styles.chips}>
            {MODOS.map((modo) => {
              const on = draft.modo === modo.id;
              return (
                <TouchableOpacity
                  key={modo.id}
                  onPress={() => setDraft((prev) => ({ ...prev, modo: modo.id }))}
                  style={[styles.chip, { borderColor: on ? colorMarca : theme.border, backgroundColor: on ? `${colorMarca}22` : theme.surface }]}
                >
                  <Text style={{ color: on ? colorMarca : theme.text, fontWeight: '700' }}>{modo.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {draft.modo !== 'gratis' ? (
            <>
              <Text style={[styles.label, { color: theme.textMuted }]}>
                {draft.modo === 'porcentaje' ? 'Porcentaje' : 'Precio fijo ($)'}
              </Text>
              <TextInput
                style={inputStyle}
                value={draft.valor}
                onChangeText={(valor) => setDraft((prev) => ({ ...prev, valor }))}
                keyboardType="decimal-pad"
              />
            </>
          ) : null}
          <Text style={[styles.label, { color: theme.textMuted }]}>Máx. entradas con descuento</Text>
          <TextInput
            style={inputStyle}
            value={draft.maxEntradasConDescuento}
            onChangeText={(maxEntradasConDescuento) => setDraft((prev) => ({ ...prev, maxEntradasConDescuento }))}
            keyboardType="number-pad"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={[styles.save, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{saveLabel}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  error: { color: '#ef4444', marginTop: 8, fontWeight: '600' },
  save: { marginTop: 16, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
