import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useMember } from '../context/MemberContext';
import UserAvatar from './UserAvatar';

/** Selector horizontal de hijos para tutores (vista por atleta). */
export default function MemberChildPicker({ theme, colorMarca, compact, viewingLabel = 'Viendo a' }) {
  const { hijos, activeAtletaId, setActiveAtletaId, activeHijo, refresh, isTutor } = useMember();

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
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{viewingLabel}</Text>
        {activeHijo ? (
          <Text style={[styles.activeName, { color: theme.text }]} numberOfLines={1}>
            {activeHijo.nombre} {activeHijo.apellido}
          </Text>
        ) : null}
      </View>
      {hijos.length > 1 ? (
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
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${h.nombre} ${h.apellido}`}
              >
                <UserAvatar user={h} size={28} colorMarca={colorMarca} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={[styles.chipTxt, { color: on ? colorMarca : theme.text }]} numberOfLines={1}>
                    {h.nombre}
                  </Text>
                  {h.edad != null ? (
                    <Text style={[styles.chipAge, { color: on ? colorMarca : theme.textMuted }]}>
                      {h.edad} años
                    </Text>
                  ) : null}
                </View>
                {hasAlerts ? <View style={[styles.alertDot, { backgroundColor: '#ef4444' }]} /> : null}
                {on ? <Ionicons name="checkmark-circle" size={16} color={colorMarca} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeName: { fontSize: 15, fontWeight: '800', flex: 1 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 110,
  },
  chipTxt: { fontSize: 13, fontWeight: '700' },
  chipAge: { fontSize: 11, marginTop: 1 },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
