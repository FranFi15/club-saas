import React from 'react';
import { View, StyleSheet } from 'react-native';
import UserAvatar from './UserAvatar';
import { COACH_HEADER_HERO_RIGHT_SIZE } from './CoachScreenHeader';

/** Avatar para el costado derecho del header de perfil (fondo de marca). */
export default function ProfileHeaderAvatar({ user, size = COACH_HEADER_HERO_RIGHT_SIZE }) {
  if (!user) return null;
  const radius = size / 2;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: radius }]}>
      <UserAvatar
        user={user}
        size={size}
        colorMarca="#ffffff"
        fallbackBackground="rgba(255,255,255,0.28)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
  },
});
