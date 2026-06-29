import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

/**
 * Filtro horizontal por categorías del coach.
 * selectedId: null = todas las categorías.
 */
export default function CoachCategoryFilter({
  categories,
  selectedId,
  onSelect,
  colorMarca,
  theme,
}) {
  const chips = [
    { id: null, label: 'Todas' },
    ...(categories || []).map((c) => ({ id: c._id, label: c.nombre })),
  ];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Categoría</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {chips.map((chip) => {
          const active =
            chip.id == null ? selectedId == null || selectedId === '' : String(selectedId) === String(chip.id);
          return (
            <TouchableOpacity
              key={chip.id ?? 'all'}
              style={[
                styles.chip,
                {
                  borderColor: active ? colorMarca : theme.border,
                  backgroundColor: active ? colorMarca : theme.surface,
                },
              ]}
              onPress={() => onSelect(chip.id)}
            >
              <Text
                style={[styles.chipTxt, { color: active ? '#fff' : theme.text }]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  scroll: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 160,
  },
  chipTxt: { fontSize: 13, fontWeight: '600' },
});
