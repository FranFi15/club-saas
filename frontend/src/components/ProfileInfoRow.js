import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileInfoRow({ icon, label, value, theme, isLast }) {
  const display = value != null && String(value).trim() !== '' ? String(value) : '—';
  return (
    <View style={[styles.row, { borderBottomColor: theme.border, borderBottomWidth: isLast ? 0 : 1 }]}>
      <Ionicons name={icon} size={18} color={theme.icon} />
      <Text style={[styles.rowLabel, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={3}>
        {display}
      </Text>
    </View>
  );
}

export const profileCardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 12, marginLeft: 10, width: 120, flexShrink: 0 },
  rowValue: { flex: 1, fontWeight: '600', fontSize: 14, textAlign: 'right' },
});

const styles = profileCardStyles;
