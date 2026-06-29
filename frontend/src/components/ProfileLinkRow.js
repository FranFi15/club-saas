import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Fila navegable dentro de una tarjeta de perfil (estilo staff). */
export default function ProfileLinkRow({ icon, title, subtitle, onPress, theme, badge, isLast }) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: theme.border, borderBottomWidth: isLast ? 0 : 1 }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={18} color={theme.icon} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.icon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: '#ef4444',
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
