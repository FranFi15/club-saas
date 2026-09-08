import React, { useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BadgeDot from './BadgeDot';
import DesignCard from './DesignCard';
import { ThemeContext } from '../context/ThemeContext';

/**
 * Tarjeta de menú hub con punto/contador opcional (estilo DesignCard).
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
  const { isDarkMode } = useContext(ThemeContext);
  const accent = colorMarca || '#3b82f6';

  return (
    <DesignCard
      theme={theme}
      isDarkMode={isDarkMode}
      accent={accent}
      onPress={onPress}
      style={style}
      contentStyle={styles.row}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${accent}22` }]}>
        <Ionicons name={icon} size={28} color={accent} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
      </View>
      <BadgeDot count={badge} />
      <Ionicons name="chevron-forward" size={24} color={theme.icon} />
    </DesignCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  iconContainer: { padding: 12, borderRadius: 12, marginRight: 12 },
  cardText: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
