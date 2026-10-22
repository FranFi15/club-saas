import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Pressable,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import CourtPresetImage from './CourtPresetImage';
import { isCourtPresetUrl } from '../constants/courtMetrics';

/**
 * Court image with normalized pin markers.
 * editMode: tap empty area to add pin; tap pin to edit/delete.
 * viewMode: tap pin calls onPinPress(pin).
 */
export default function CourtImageBoard({
  imagenUrl,
  deporte,
  pines = [],
  editMode = false,
  theme,
  primaryColor,
  onPinsChange,
  onPinPress,
  height = 240,
}) {
  const [layout, setLayout] = useState({ w: 1, h: 1 });
  const [draft, setDraft] = useState(null);
  const unbindClick = useRef(null);

  const placeDraft = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setDraft({
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      label: '',
      notas: '',
      isNew: true,
    });
  };

  // Web press events report locationX/locationY as 0 on the court SVG, so the
  // pin was saved in the corner. Measure the click against the board itself.
  const bindBoard = useCallback((node) => {
    if (unbindClick.current) {
      unbindClick.current();
      unbindClick.current = null;
    }
    if (Platform.OS !== 'web' || !editMode || !node || typeof node.addEventListener !== 'function') {
      return;
    }
    const onClick = (ev) => {
      if (ev.target?.closest?.('[data-testid="court-pin"]')) return;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      setDraft({
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
        label: '',
        notas: '',
        isNew: true,
      });
    };
    node.addEventListener('click', onClick);
    unbindClick.current = () => node.removeEventListener('click', onClick);
  }, [editMode]);

  const handleBoardPress = (e) => {
    if (!editMode || Platform.OS === 'web') return;
    const { locationX, locationY } = e.nativeEvent;
    placeDraft(locationX / layout.w, locationY / layout.h);
  };

  const saveDraft = () => {
    const label = String(draft?.label || '').trim();
    if (!label || !draft) {
      setDraft(null);
      return;
    }
    const nextPin = {
      ...(draft._id ? { _id: draft._id } : {}),
      label,
      x: draft.x,
      y: draft.y,
      notas: String(draft.notas || '').trim(),
    };
    let next;
    if (draft.isNew) {
      next = [...pines, nextPin];
    } else {
      next = pines.map((p) =>
        String(p._id || p.label) === String(draft._id || draft.prevKey) ? nextPin : p,
      );
    }
    onPinsChange?.(next);
    setDraft(null);
  };

  const deleteDraft = () => {
    if (!draft || draft.isNew) {
      setDraft(null);
      return;
    }
    const key = String(draft._id || draft.prevKey);
    onPinsChange?.(pines.filter((p) => String(p._id || p.label) !== key));
    setDraft(null);
  };

  const openPin = (pin, index) => {
    if (editMode) {
      setDraft({
        ...pin,
        prevKey: pin._id || pin.label || index,
        isNew: false,
      });
      return;
    }
    onPinPress?.(pin);
  };

  return (
    <View>
      <Pressable
        ref={bindBoard}
        onPress={handleBoardPress}
        onLayout={(e) => {
          const { width, height: h } = e.nativeEvent.layout;
          setLayout({ w: width || 1, h: h || 1 });
        }}
        style={[styles.board, { height }]}
      >
        {isCourtPresetUrl(imagenUrl) ? (
          <CourtPresetImage imagenUrl={imagenUrl} deporte={deporte} height={height} />
        ) : (
          <Image source={{ uri: imagenUrl }} style={{ width: '100%', height }} resizeMode="cover" />
        )}
        {pines.map((pin, index) => (
          <Pressable
            key={String(pin._id || `${pin.label}-${index}`)}
            testID="court-pin"
            onPress={(ev) => {
              ev.stopPropagation?.();
              openPin(pin, index);
            }}
            style={[
              styles.pin,
              {
                left: `${pin.x * 100}%`,
                top: `${pin.y * 100}%`,
                backgroundColor: primaryColor || '#2563eb',
                borderColor: '#fff',
              },
            ]}
            hitSlop={8}
          >
            <Text style={styles.pinNum}>{index + 1}</Text>
          </Pressable>
        ))}
      </Pressable>

      <Modal visible={!!draft} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme?.surface || '#fff' }]}>
            <Text style={[styles.modalTitle, { color: theme?.text || '#111' }]}>
              {draft?.isNew ? 'Nuevo punto' : 'Editar punto'}
            </Text>
            <Text style={{ color: theme?.textMuted || '#6b7280', fontSize: 12, marginBottom: 8 }}>
              Ej. Tiro a 45°
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme?.text || '#111',
                  borderColor: theme?.border || '#d1d5db',
                  backgroundColor: theme?.background || '#f9fafb',
                },
              ]}
              value={draft?.label || ''}
              onChangeText={(v) => setDraft((d) => ({ ...d, label: v }))}
              placeholder="Nombre del punto"
              placeholderTextColor={theme?.textMuted || '#9ca3af'}
              autoFocus
            />
            <TextInput
              style={[
                styles.input,
                {
                  color: theme?.text || '#111',
                  borderColor: theme?.border || '#d1d5db',
                  backgroundColor: theme?.background || '#f9fafb',
                  marginTop: 8,
                },
              ]}
              value={draft?.notas || ''}
              onChangeText={(v) => setDraft((d) => ({ ...d, notas: v }))}
              placeholder="Notas (opcional)"
              placeholderTextColor={theme?.textMuted || '#9ca3af'}
            />
            <View style={styles.modalActions}>
              {!draft?.isNew ? (
                <TouchableOpacity onPress={deleteDraft} style={{ marginRight: 'auto' }}>
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Eliminar</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity onPress={() => setDraft(null)} style={{ marginRight: 16 }}>
                <Text style={{ color: theme?.textMuted || '#6b7280', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveDraft}>
                <Text style={{ color: primaryColor || '#2563eb', fontWeight: '800' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  pin: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pinNum: { color: '#fff', fontSize: 11, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 14, padding: 18 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
});
