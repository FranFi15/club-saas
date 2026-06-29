import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BODY_FAT_METHOD_OPTIONS, bodyFatMethodLabel } from '../utils/nutriBodyComposition';
import { useNutritionSettings } from '../context/NutritionSettingsContext';

/** Selector compacto de % grasa (club) para el header del nutricionista. */
export default function NutriBodyFatMethodHeaderPicker({ theme, colorMarca = '#3b82f6' }) {
  const { metodoGrasaCorporal, setMetodoGrasaCorporal } = useNutritionSettings();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = async (value) => {
    if (saving || value === metodoGrasaCorporal) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await setMetodoGrasaCorporal(value);
      setOpen(false);
    } catch {
      // caller may show alert via parent if needed
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => setOpen(true)}
        accessibilityLabel="Elegir fórmula de porcentaje de grasa"
        hitSlop={8}
      >
        <Ionicons name="body-outline" size={17} color="#fff" />
        <Text style={styles.btnTxt} numberOfLines={1}>
          {bodyFatMethodLabel(metodoGrasaCorporal)}
        </Text>
        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => !saving && setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme?.surface || '#fff', borderColor: theme?.border || '#e5e7eb' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: theme?.text || '#111' }]}>% grasa corporal</Text>
            <Text style={[styles.sheetSub, { color: theme?.textMuted || '#6b7280' }]}>
              Aplica a todos los atletas del club
            </Text>
            {BODY_FAT_METHOD_OPTIONS.map((opt) => {
              const on = metodoGrasaCorporal === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.option,
                    {
                      borderColor: on ? colorMarca : theme?.border || '#e5e7eb',
                      backgroundColor: on ? colorMarca + '22' : theme?.background || '#f9fafb',
                    },
                  ]}
                  onPress={() => pick(opt.value)}
                  disabled={saving}
                >
                  <Text style={[styles.optionTxt, { color: theme?.text || '#111', fontWeight: on ? '800' : '600' }]}>
                    {opt.label}
                  </Text>
                  {on ? <Ionicons name="checkmark-circle" size={22} color={colorMarca} /> : null}
                </TouchableOpacity>
              );
            })}
            {saving ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 148,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  btnTxt: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: 16,
  },
  sheet: {
    width: 280,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  sheetSub: { fontSize: 12, marginTop: 4, marginBottom: 12, lineHeight: 17 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  optionTxt: { fontSize: 15 },
});
