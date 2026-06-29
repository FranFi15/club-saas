import React, { useContext } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';

const LOGO_SIZE = 45;

export default function TabBarClubLogo({
  focused,
  color,
  fallbackIcon = 'home-outline',
  fallbackIconFocused = 'home',
  size = LOGO_SIZE,
}) {
  const { clubData } = useContext(ClubContext);
  const logoUrl = clubData?.logoUrl?.trim();
  const brand = clubData?.primaryColor || '#3b82f6';
  const iconSize = Math.max(24, size - 6);

  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, opacity: focused ? 1 : 0.5 }}
        resizeMode="contain"
      />
    );
  }

  const initial = clubData?.nombre?.charAt(0)?.toUpperCase();
  if (initial) {
    return (
      <View
        style={[
          styles.letterWrap,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: brand,
            opacity: focused ? 1 : 0.6,
          },
        ]}
      >
        <Text style={[styles.letter, { fontSize: size * 0.46 }]}>{initial}</Text>
      </View>
    );
  }

  return (
    <Ionicons
      name={focused ? fallbackIconFocused : fallbackIcon}
      size={iconSize}
      color={color}
    />
  );
}

const styles = StyleSheet.create({
  letterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#fff',
    fontWeight: '800',
  },
});
