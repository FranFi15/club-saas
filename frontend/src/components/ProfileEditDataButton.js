import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileEditDataButton({ onPress, theme }) {
  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor: theme.border, backgroundColor: theme.surface }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name="create-outline" size={20} color={theme.icon} />
      <Text style={[styles.txt, { color: theme.text }]}>Editar datos</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  txt: { fontWeight: '800', fontSize: 15 },
});
