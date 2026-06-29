import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useMember } from '../context/MemberContext';

/** Selector horizontal de hijos para tutores. */
export default function MemberChildPicker({ theme, colorMarca, compact }) {
  const { hijos, activeAtletaId, setActiveAtletaId, refresh, isTutor } = useMember();

  useFocusEffect(
    useCallback(() => {
      if (isTutor && hijos.length > 1) {
        refresh({ background: true });
      }
    }, [isTutor, hijos.length, refresh]),
  );

  if (!hijos?.length) return null;

  if (hijos.length === 1 && compact) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Atleta seleccionado</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {hijos.map((h) => {
          const on = String(h._id) === String(activeAtletaId);
          const hasAlerts = Boolean(h.tieneAlertas);
          return (
            <TouchableOpacity
              key={h._id}
              style={[
                styles.chip,
                {
                  borderColor: on ? colorMarca : theme.border,
                  backgroundColor: on ? colorMarca + '22' : theme.surface,
                },
              ]}
              onPress={() => setActiveAtletaId(h._id)}
            >
              <View style={styles.chipRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chipTxt, { color: on ? colorMarca : theme.text }]}>
                    {h.nombre} {h.apellido}
                  </Text>
                  {h.edad != null ? (
                    <Text style={[styles.chipAge, { color: on ? colorMarca : theme.textMuted }]}>{h.edad} años</Text>
                  ) : null}
                </View>
                {hasAlerts ? <View style={[styles.alertDot, { backgroundColor: '#ef4444' }]} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 100,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipTxt: { fontSize: 13, fontWeight: '700' },
  chipAge: { fontSize: 11, marginTop: 2 },
  alertDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 2,
  },
});
