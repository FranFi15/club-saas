import React, { useContext } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { ClubContext } from '../context/ClubContext';

export const HEADER_CLUB_LOGO_SIZE = 88;

/** Escudo del club para el header de marca. */
export default function HeaderClubLogo({ size = HEADER_CLUB_LOGO_SIZE }) {
  const { clubData } = useContext(ClubContext);
  const logoUrl = clubData?.logoUrl?.trim();
  const initial = clubData?.nombre?.charAt(0)?.toUpperCase() || '?';

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel={clubData?.nombre ? `Logo ${clubData.nombre}` : 'Logo del club'}
    >
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={{ width: size, height: size }} resizeMode="contain" />
      ) : (
        <Text style={[styles.letter, { fontSize: size * 0.55 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  letter: {
    color: '#fff',
    fontWeight: '800',
  },
});
