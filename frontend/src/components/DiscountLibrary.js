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
  Alert,
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

function idOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(value._id || value);
}

function fromDiscount(discount) {
  if (!discount) return emptyDraft();
  return {
    _id: discount._id,
    nombre: discount.nombre || '',
    roles: discount.roles || [],
    cuotasSociales: (discount.cuotasSociales || []).map(idOf),
    planes: (discount.planes || []).map(idOf),
    modo: discount.modo || 'porcentaje',
    valor: String(discount.valor ?? 0),
    maxEntradasConDescuento: String(discount.maxEntradasConDescuento ?? 1),
  };
}

function discountSummary(discount) {
  const modo =
    discount.modo === 'gratis'
      ? 'Gratis'
      : discount.modo === 'precio_fijo'
        ? `$${discount.valor || 0}`
        : `${discount.valor || 0}%`;
  const roles = (discount.roles || []).length ? discount.roles.join(', ') : 'cualquier rol';
  return `${modo} · máx ${discount.maxEntradasConDescuento || 1} · ${roles}`;
}

export default function DiscountLibrary({
  visible,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
  discounts = [],
  getHeaders,
  theme,
  colorMarca,
  pickers,
  hint = 'Queda guardado para usarlo en este evento y en los próximos.',
  saveLabel = 'Guardar y usar',
  embedded = false,
  mode = 'create',
}) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setDraft(null);
      return;
    }
    setDraft(mode === 'create' ? emptyDraft() : null);
    setError('');
    setSaving(false);
  }, [visible, mode]);

  if (visible && mode === 'create' && !draft) {
    setDraft(emptyDraft());
  }

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
      const payload = {
        nombre,
        roles: draft.roles,
        cuotasSociales: draft.cuotasSociales,
        planes: draft.planes,
        modo: draft.modo,
        valor: Number(draft.valor) || 0,
        maxEntradasConDescuento: Math.max(1, parseInt(draft.maxEntradasConDescuento, 10) || 1),
      };
      const { data } = draft._id
        ? await clubApi.patch(`/events/admin/discounts/${draft._id}`, payload, { headers })
        : await clubApi.post('/events/admin/discounts', payload, { headers });
      if (mode === 'create') {
        onCreated?.(data);
        onClose?.();
        return;
      }
      onSaved?.(data);
      setDraft(null);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'No se pudo guardar el descuento.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (discount) => {
    Alert.alert('Quitar descuento', `¿Quitás ${discount.nombre}? Los eventos que ya lo usan conservan su copia.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            const headers = await getHeaders();
            await clubApi.delete(`/events/admin/discounts/${discount._id}`, { headers });
            onDeleted?.(discount._id);
          } catch (e) {
            setError(e.response?.data?.message || 'No se pudo quitar el descuento.');
          }
        },
      },
    ]);
  };

  if (embedded && !visible) return null;

  const showingList = mode !== 'create' && !draft;

  const sheet = (
      <View style={embedded ? [StyleSheet.absoluteFill, styles.overlay, styles.embedded] : styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.head}>
          {mode !== 'create' ? (
            <TouchableOpacity
              onPress={() => (draft ? setDraft(null) : onClose())}
              style={[styles.back, { backgroundColor: theme.surface }]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {showingList ? 'Descuentos' : draft?._id ? 'Editar descuento' : 'Nuevo descuento'}
          </Text>
          {mode === 'create' ? (
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.text} />
            </TouchableOpacity>
          ) : null}
        </View>
        {showingList ? null : (
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
            {draft?._id ? 'Los eventos que ya lo usan conservan su copia.' : hint}
          </Text>
        )}
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {showingList ? (
            <View>
              <Text style={{ color: theme.textMuted, marginBottom: 12 }}>
                Creá un descuento una vez. Después podés reutilizarlo en cada evento.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {discounts.map((discount) => (
                <View key={discount._id} style={[styles.card, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{discount.nombre}</Text>
                  <Text style={{ color: theme.textMuted, marginTop: 2 }}>{discountSummary(discount)}</Text>
                  <View style={styles.actions}>
                    <TouchableOpacity onPress={() => setDraft(fromDiscount(discount))}>
                      <Text style={{ color: theme.text, fontWeight: '700' }}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(discount)}>
                      <Text style={{ color: '#ef4444', fontWeight: '700' }}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {discounts.length === 0 ? (
                <Text style={{ color: theme.textMuted }}>Todavía no hay descuentos guardados.</Text>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  setError('');
                  setDraft(emptyDraft());
                }}
                style={[styles.add, { borderColor: colorMarca }]}
              >
                <Ionicons name="add" size={18} color={colorMarca} />
                <Text style={{ color: colorMarca, fontWeight: '800', marginLeft: 6 }}>Nuevo descuento</Text>
              </TouchableOpacity>
            </View>
          ) : draft ? (
          <>
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
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.saveText}>{draft?._id ? 'Guardar descuento' : saveLabel}</Text>
            )}
          </TouchableOpacity>
          </>
          ) : null}
        </ScrollView>
      </View>
      </View>
  );

  if (embedded) return sheet;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => (draft && mode !== 'create' ? setDraft(null) : onClose?.())}
    >
      {sheet}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  embedded: { zIndex: 40, elevation: 40 },
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  add: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  error: { color: '#ef4444', marginTop: 8, fontWeight: '600' },
  save: { marginTop: 16, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
