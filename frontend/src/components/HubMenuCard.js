import React, { useContext } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BadgeDot from './BadgeDot';
import DesignCard from './DesignCard';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';
import { clubPrimaryColor, clubIconColor } from '../utils/clubBrandColors';
import {
  shouldPlayEntrance,
  staggerEntering,
  useEntranceAllowed,
  useStaggerSlot,
} from '../hooks/useEntranceEpoch';

const EntranceHost = Platform.OS === 'web'
  ? // Lazy require keeps native launch path free of Reanimated views.
    require('react-native-reanimated').default.View
  : View;

/**
 * Tarjeta de menú hub con punto/contador opcional (estilo DesignCard).
 * Accent/borde usa color principal; el ícono usa el secundario del club.
 * Entrance: Gain-style fade + rise staggered by index (StaggerScope or animationIndex).
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
  animationIndex,
  entranceKey,
  animateEntrance = true,
}) {
  const { isDarkMode } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  const isFocused = useIsFocused();
  const accent = colorMarca || clubPrimaryColor(clubData);
  const iconTint = colorIconos || clubIconColor(clubData);
  const allowed = useEntranceAllowed() && isFocused;
  const { index, epoch } = useStaggerSlot(animationIndex, 'hub');
  const token = `${epoch}:${entranceKey || title || icon || index}`;
  const entering =
    animateEntrance && shouldPlayEntrance(token, allowed) ? staggerEntering(index) : undefined;

  const hostProps = entering ? { entering, style } : { style };

  return (
    <EntranceHost {...hostProps}>
      <DesignCard
        theme={theme}
        isDarkMode={isDarkMode}
        accent={accent}
        onPress={onPress}
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
    </EntranceHost>
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
