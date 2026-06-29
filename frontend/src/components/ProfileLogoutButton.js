import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileLogoutButton({ onPress, style }) {
  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="log-out-outline" size={22} color="#fff" />
      <Text style={styles.txt}>Salir del club</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  txt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
