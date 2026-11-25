import React, { useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BadgeDot from './BadgeDot';
import DesignCard from './DesignCard';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';
import { clubPrimaryColor, clubIconColor } from '../utils/clubBrandColors';

/**
 * Tarjeta de menú hub con punto/contador opcional (estilo DesignCard).
 * Accent/borde usa color principal; el ícono usa el secundario del club.
 */
export default function HubMenuCard({
  title,
  subtitle,
  icon,
  onPress,
  badge = 0,
  theme,
  colorMarca,
  colorIconos,
  style,
}) {
  const { isDarkMode } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  const accent = colorMarca || clubPrimaryColor(clubData);
  const iconTint = colorIconos || clubIconColor(clubData);

  return (
    <DesignCard
      theme={theme}
      isDarkMode={isDarkMode}
      accent={accent}
      onPress={onPress}
      style={style}
      contentStyle={styles.row}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${iconTint}22` }]}>
        <Ionicons name={icon} size={28} color={iconTint} />
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
