import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BadgeDot from './BadgeDot';

/**
 * Tarjeta de menú hub con punto/contador opcional.
 */
export default function HubMenuCard({
  title,
  subtitle,
  icon,
  onPress,
  badge = 0,
  theme,
  colorMarca,
  style,
}) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: colorMarca + '20' }]}>
        <Ionicons name={icon} size={28} color={colorMarca} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
      </View>
      <BadgeDot count={badge} />
      <Ionicons name="chevron-forward" size={24} color={theme.icon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 5,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  iconContainer: { padding: 12, borderRadius: 12, marginRight: 15 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
});
