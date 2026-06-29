import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

export function getUserInitials(nombre = '', apellido = '') {
  const n = (nombre || '').charAt(0);
  const a = (apellido || '').charAt(0);
  const initials = `${n}${a}`.toUpperCase();
  return initials || 'U';
}

/**
 * Avatar con foto de perfil (fotoPerfil) o iniciales como respaldo.
 */
export default function UserAvatar({
  user,
  nombre,
  apellido,
  fotoPerfil,
  size = 46,
  colorMarca = '#3b82f6',
  fallbackBackground,
  style,
  textStyle,
}) {
  const u = user || {};
  const n = nombre ?? u.nombre ?? '';
  const a = apellido ?? u.apellido ?? '';
  const photo = (fotoPerfil ?? u.fotoPerfil ?? '').trim();
  const radius = size / 2;
  const fontSize = Math.max(12, Math.round(size * 0.35));

  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={[
          styles.photo,
          { width: size, height: size, borderRadius: radius },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: fallbackBackground ?? colorMarca + '20',
        },
        style,
      ]}
    >
      <Text style={[styles.initials, { color: colorMarca, fontSize }, textStyle]}>
        {getUserInitials(n, a)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { resizeMode: 'cover' },
  fallback: { justifyContent: 'center', alignItems: 'center' },
  initials: { fontWeight: 'bold' },
});
