import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const WINDOW_HEIGHT = Dimensions.get('window').height;

export default function SearchableDropdown({ 
  data = [], 
  value, 
  onChange, 
  placeholder = "Seleccionar...", 
  theme,
  colorMarca,
  compact = false,
  searchable = true,
  borderRadius,
  onDismiss,
  inputHeight,
}) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const selectedItem = data.find(item => item.value === value);

  const filteredData = useMemo(() => {
    if (!search) return data;
    return data.filter(item => item.label.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const handleSelect = (val) => {
    onChange(val);
    setVisible(false);
    setSearch('');
  };

  const radius = borderRadius ?? (compact ? 10 : 12);

  const optionsListMaxHeight = useMemo(() => {
    const sheetHeight = searchable ? WINDOW_HEIGHT * 0.9 : WINDOW_HEIGHT * 0.7;
    const chrome = searchable ? 200 : 130;
    return Math.max(sheetHeight - chrome, 160);
  }, [searchable]);

  const renderOption = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: theme.border }]}
      onPress={() => handleSelect(item.value)}
    >
      <Text
        style={[
          styles.itemText,
          {
            color: item.value === value ? colorMarca : theme.text,
            fontWeight: item.value === value ? 'bold' : 'normal',
          },
        ]}
      >
        {item.label}
      </Text>
      {item.value === value ? <Ionicons name="checkmark" size={22} color={colorMarca} /> : null}
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity 
        style={[
          styles.container,
          compact && styles.containerCompact,
          inputHeight ? { height: inputHeight } : null,
          { backgroundColor: theme.background, borderColor: theme.border, borderRadius: radius },
        ]} 
        onPress={() => setVisible(true)}
      >
        <Text
          style={[
            compact && styles.selectedTextCompact,
            { color: selectedItem ? theme.text : theme.textMuted, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {selectedItem ? selectedItem.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 16 : 20} color={theme.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setVisible(false)}
        onDismiss={onDismiss}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              searchable ? styles.modalContent : styles.modalContentShort,
              { backgroundColor: theme.surface },
            ]}
          >
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: theme.text }]}>{placeholder}</Text>
              <View style={{ width: 26 }} />
            </View>

            {searchable ? (
              <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name="search" size={20} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text, outlineStyle: 'none' }]}
                  placeholder="Buscar..."
                  placeholderTextColor={theme.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus={false}
                />
              </View>
            ) : null}

            <FlatList
              data={filteredData}
              keyExtractor={(item, index) =>
                item.value !== undefined ? item.value.toString() : index.toString()
              }
              renderItem={renderOption}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={searchable ? styles.optionsListFlex : { maxHeight: optionsListMaxHeight }}
              contentContainerStyle={styles.optionsListContent}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  containerCompact: {
    height: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  selectedTextCompact: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%', 
    width: '100%', 
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    paddingHorizontal: 10,
    paddingTop: 25,
  },
  modalContentShort: {
    maxHeight: '70%',
    width: '100%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    paddingHorizontal: 10,
    paddingTop: 25,
    paddingBottom: 24,
  },
  optionsListFlex: {
    flex: 1,
    minHeight: 0,
  },
  optionsListContent: {
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20, // Más separación entre el título y el buscador
  },
  closeBtn: {
    padding: 5,
    marginLeft: -5, // Lo empujamos un chiquito a la izquierda para alinear visualmente
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 20, // Más separación entre el buscador y la lista
    borderWidth: 1,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    height: '100%',
    fontSize: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18, // Ítems más altos para que sea más fácil tocarlos
    paddingHorizontal: 5, // Un pequeño padding interno al texto
    borderBottomWidth: 1,
  },
  itemText: {
    fontSize: 16,
  }
});