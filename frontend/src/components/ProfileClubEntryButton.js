import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileClubEntryButton({ onPress, theme, colorMarca }) {
  const accent = colorMarca || '#3b82f6';
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: accent }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name="qr-code-outline" size={22} color="#fff" />
      <Text style={styles.txt}>Mi QR de ingreso</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  txt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
