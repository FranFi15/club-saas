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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import StadiumAreaStage from './StadiumAreaStage';
import { AlertHost } from './CustomAlert';

const emptySection = () => ({
  nombre: '',
  filas: '5',
  asientosPorFila: '10',
  x: 20,
  y: 20,
  w: 24,
  h: 16,
});

function fromApi(stadium) {
  return {
    _id: stadium?._id,
    nombre: stadium?.nombre || '',
    mapaUrl: stadium?.mapaUrl || '',
    secciones: (stadium?.secciones || []).map((section) => ({
      _id: section._id,
      nombre: section.nombre || '',
      filas: String(section.filas || 1),
      asientosPorFila: String(section.asientosPorFila || 1),
      x: Number(section.x) || 0,
      y: Number(section.y) || 0,
      w: Number(section.w) || 0,
      h: Number(section.h) || 0,
    })),
  };
}

export default function StadiumLibrary({
  visible,
  mode,
  onClose,
  stadiums,
  reload,
  onUse,
  requestMapUpload,
  getHeaders,
  theme,
  colorMarca,
  uploading,
  embedded = false,
  children = null,
}) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(null);

  useEffect(() => {
    if (!visible) {
      setDraft(null);
      return;
    }
    setError('');
    setPlacing(null);
    setDraft(mode === 'create' ? fromApi(null) : null);
  }, [visible, mode]);

  if (visible && mode === 'create' && !draft) {
    setDraft(fromApi(null));
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  const save = async (useOnEvent) => {
    const nombre = draft?.nombre?.trim();
    if (!nombre) {
      setError('Poné un nombre al estadio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getHeaders();
      const payload = {
        nombre,
        mapaUrl: draft.mapaUrl || '',
        secciones: (draft.secciones || []).map((section) => ({
          ...(section._id ? { _id: section._id } : {}),
          nombre: section.nombre.trim() || 'Sector',
          filas: Math.max(1, parseInt(section.filas, 10) || 1),
          asientosPorFila: Math.max(1, parseInt(section.asientosPorFila, 10) || 1),
          x: Number(section.x) || 0,
          y: Number(section.y) || 0,
          w: Number(section.w) || 0,
          h: Number(section.h) || 0,
        })),
      };
      const { data } = draft._id
        ? await clubApi.patch(`/events/admin/stadiums/${draft._id}`, payload, { headers })
        : await clubApi.post('/events/admin/stadiums', payload, { headers });
      await reload();
      if (useOnEvent && onUse) {
        onUse(data);
        onClose();
        return;
      }
      if (mode === 'create') {
        onClose();
        return;
      }
      setDraft(null);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'No se pudo guardar el estadio.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (stadium) => {
    Alert.alert('Quitar estadio', `¿Quitás ${stadium.nombre}? Los eventos que ya lo usan conservan su copia.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            const headers = await getHeaders();
            await clubApi.delete(`/events/admin/stadiums/${stadium._id}`, { headers });
            await reload();
          } catch (e) {
            setError(e.response?.data?.message || 'No se pudo quitar el estadio.');
          }
        },
      },
    ]);
  };

  const updateSection = (idx, patch) => {
    setDraft((current) => {
      const secciones = [...(current?.secciones || [])];
      secciones[idx] = { ...secciones[idx], ...patch };
      return { ...current, secciones };
    });
  };

  const nudge = (idx, dx, dy, dw, dh) => {
    setDraft((current) => {
      const secciones = [...(current?.secciones || [])];
      const section = secciones[idx];
      if (!section) return current;
      const w = Math.max(8, Math.min(80, (Number(section.w) || 24) + dw));
      const h = Math.max(8, Math.min(80, (Number(section.h) || 16) + dh));
      secciones[idx] = {
        ...section,
        w,
        h,
        x: Math.max(0, Math.min(100 - w, (Number(section.x) || 0) + dx)),
        y: Math.max(0, Math.min(100 - h, (Number(section.y) || 0) + dy)),
      };
      return { ...current, secciones };
    });
  };

  const place = (idx) => {
    const section = draft?.secciones?.[idx];
    if (!section) return;
    const w = Number(section.w) > 0 ? Number(section.w) : 24;
    const h = Number(section.h) > 0 ? Number(section.h) : 16;
    const hadArea = Number(section.w) > 0 && Number(section.h) > 0;
    updateSection(idx, {
      w,
      h,
      x: Math.max(0, Math.min(100 - w, hadArea ? Number(section.x) || 0 : 20)),
      y: Math.max(0, Math.min(100 - h, hadArea ? Number(section.y) || 0 : 20)),
    });
    setPlacing(idx);
  };

  if (embedded && !visible) return null;

  const sheet = (
      <View style={embedded ? [StyleSheet.absoluteFill, styles.overlay, styles.embedded] : styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={() => (draft && mode !== 'create' ? setDraft(null) : onClose())}
              style={[styles.back, { backgroundColor: theme.surface }]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {draft ? (draft._id ? 'Editar estadio' : 'Nuevo estadio') : 'Estadios'}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {mode !== 'create' && !draft ? (
              <View>
                <Text style={{ color: theme.textMuted, marginBottom: 12 }}>
                  Creá el plano y los sectores una vez. Después podés reutilizarlos en cada evento.
                </Text>
                {(stadiums || []).map((stadium) => (
                  <View key={stadium._id} style={[styles.card, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{stadium.nombre}</Text>
                    <Text style={{ color: theme.textMuted, marginTop: 2 }}>
                      {(stadium.secciones || []).length} sectores
                    </Text>
                    <View style={styles.actions}>
                      {onUse ? (
                        <TouchableOpacity onPress={() => onUse(stadium)}>
                          <Text style={{ color: colorMarca, fontWeight: '800' }}>Usar</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity onPress={() => setDraft(fromApi(stadium))}>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(stadium)}>
                        <Text style={{ color: '#ef4444', fontWeight: '700' }}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {(stadiums || []).length === 0 ? (
                  <Text style={{ color: theme.textMuted }}>Todavía no hay estadios guardados.</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => setDraft(fromApi(null))}
                  style={[styles.add, { borderColor: colorMarca }]}
                >
                  <Ionicons name="add" size={18} color={colorMarca} />
                  <Text style={{ color: colorMarca, fontWeight: '800', marginLeft: 6 }}>Nuevo estadio</Text>
                </TouchableOpacity>
              </View>
            ) : draft ? (
              <View>
                <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
                <TextInput
                  style={inputStyle}
                  value={draft.nombre}
                  onChangeText={(nombre) => setDraft((current) => ({ ...current, nombre }))}
                  placeholder="Estadio principal"
                  placeholderTextColor={theme.textMuted}
                />
                <Text style={[styles.label, { color: theme.textMuted }]}>Plano</Text>
                <TouchableOpacity
                  onPress={async () => {
                    const url = await requestMapUpload();
                    if (url) setDraft((current) => ({ ...current, mapaUrl: url }));
                  }}
                  style={draft.mapaUrl ? { marginBottom: 8 } : [styles.mapPicker, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  {uploading ? (
                    <ActivityIndicator color={colorMarca} />
                  ) : (
                    <Text style={{ color: draft.mapaUrl ? colorMarca : theme.textMuted, fontWeight: '700' }}>
                      {draft.mapaUrl ? 'Cambiar plano' : 'Subir plano'}
                    </Text>
                  )}
                </TouchableOpacity>
                {draft.mapaUrl ? (
                  <StadiumAreaStage
                    uri={draft.mapaUrl}
                    sections={draft.secciones || []}
                    activeIndex={placing}
                    color={colorMarca}
                    onChange={(idx, box) => updateSection(idx, box)}
                    onPressPoint={(px, py) => {
                      const section = draft.secciones[placing];
                      const w = Number(section?.w) || 24;
                      const h = Number(section?.h) || 16;
                      updateSection(placing, {
                        x: Math.max(0, Math.min(100 - w, px - w / 2)),
                        y: Math.max(0, Math.min(100 - h, py - h / 2)),
                      });
                    }}
                    style={[styles.stage, { borderColor: theme.border }]}
                  />
                ) : null}
                {placing != null ? (
                  <View style={styles.controls}>
                    {Platform.OS === 'web' ? (
                      <Text style={{ color: theme.textMuted, width: '100%' }}>
                        Arrastrá el área para moverla y una esquina para cambiar el tamaño.
                      </Text>
                    ) : (
                      [
                        ['←', -4, 0, 0, 0],
                        ['↑', 0, -4, 0, 0],
                        ['↓', 0, 4, 0, 0],
                        ['→', 4, 0, 0, 0],
                        ['Ancho −', 0, 0, -4, 0],
                        ['Ancho +', 0, 0, 4, 0],
                        ['Alto −', 0, 0, 0, -4],
                        ['Alto +', 0, 0, 0, 4],
                      ].map(([label, dx, dy, dw, dh]) => (
                        <TouchableOpacity
                          key={label}
                          onPress={() => nudge(placing, dx, dy, dw, dh)}
                          style={[styles.control, { borderColor: theme.border }]}
                        >
                          <Text style={{ color: theme.text, fontWeight: '800' }}>{label}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                    <TouchableOpacity
                      onPress={() => setPlacing(null)}
                      style={[styles.control, { backgroundColor: colorMarca, borderColor: colorMarca }]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Listo</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {(draft.secciones || []).map((section, idx) => (
                  <View key={`sec-${idx}`} style={[styles.card, { borderColor: theme.border }]}>
                    <TextInput
                      style={inputStyle}
                      value={section.nombre}
                      onChangeText={(nombre) => updateSection(idx, { nombre })}
                      placeholder="Nombre del sector"
                      placeholderTextColor={theme.textMuted}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        style={[inputStyle, { flex: 1 }]}
                        value={String(section.filas)}
                        onChangeText={(filas) => updateSection(idx, { filas: filas.replace(/\D/g, '') })}
                        keyboardType="number-pad"
                        placeholder="Filas"
                        placeholderTextColor={theme.textMuted}
                      />
                      <TextInput
                        style={[inputStyle, { flex: 1 }]}
                        value={String(section.asientosPorFila)}
                        onChangeText={(asientosPorFila) =>
                          updateSection(idx, { asientosPorFila: asientosPorFila.replace(/\D/g, '') })
                        }
                        keyboardType="number-pad"
                        placeholder="Asientos"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => place(idx)} disabled={!draft.mapaUrl}>
                        <Text style={{ color: draft.mapaUrl ? colorMarca : theme.textMuted, fontWeight: '800' }}>
                          Ubicar en el plano
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          setDraft((current) => ({
                            ...current,
                            secciones: current.secciones.filter((_, index) => index !== idx),
                          }))
                        }
                      >
                        <Text style={{ color: '#ef4444', fontWeight: '700' }}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      secciones: [...(current.secciones || []), emptySection()],
                    }))
                  }
                >
                  <Text style={{ color: colorMarca, fontWeight: '800', marginBottom: 16 }}>+ Sector</Text>
                </TouchableOpacity>
                {mode === 'create' ? (
                  <View style={styles.saveRow}>
                    <TouchableOpacity
                      onPress={() => save(false)}
                      disabled={saving}
                      style={[styles.save, styles.saveHalf, styles.saveGhost, { borderColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
                    >
                      <Text style={{ color: colorMarca, fontWeight: '800' }}>Guardar estadio</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => save(true)}
                      disabled={saving}
                      style={[styles.save, styles.saveHalf, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar y usar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => save(false)}
                    disabled={saving}
                    style={[styles.save, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar estadio</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
  );

  if (embedded) {
    return (
      <>
        {sheet}
        {children}
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        {sheet}
        {children}
        <AlertHost active={visible} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  embedded: { zIndex: 50, elevation: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1 },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  body: { padding: 16, paddingBottom: 32 },
  error: { color: '#b91c1c', fontWeight: '700', marginBottom: 10 },
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
  label: { fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  mapPicker: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stage: {
    marginTop: 10,
    width: '100%',
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'flex-start' } : {}),
  },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  control: {
    minWidth: 72,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  saveRow: { flexDirection: 'row', gap: 8 },
  save: { borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveHalf: { flex: 1 },
  saveGhost: { borderWidth: 1, backgroundColor: 'transparent' },
});
