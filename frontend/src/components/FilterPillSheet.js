import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  SectionList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Compact filter pills + bottom-sheet picker (agenda / enviar recurso style).
 *
 * Pill shape:
 * {
 *   key, placeholder, value, onChange,
 *   options?: [{ value, label }],
 *   sections?: [{ title, data: [{ value, label }] }],
 *   multi?, selectedIds?, displayLabel?,
 *   searchable?: boolean,
 * }
 */
export default function FilterPillSheet({
  pills,
  openKey,
  onOpen,
  onClose,
  colorMarca,
  theme,
}) {
  const active = pills.find((f) => f.key === openKey);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!openKey) setQuery('');
  }, [openKey]);

  const filteredSections = useMemo(() => {
    if (!active?.sections?.length) return null;
    const q = query.trim().toLowerCase();
    if (!q) return active.sections;
    return active.sections
      .map((s) => ({
        title: s.title,
        data: (s.data || []).filter((item) => {
          const hay = `${item.label || ''} ${s.title || ''} ${item.disciplinaNombre || ''}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((s) => s.data.length > 0);
  }, [active, query]);

  const filteredOptions = useMemo(() => {
    if (active?.sections?.length) return null;
    const opts = active?.options || [];
    const q = query.trim().toLowerCase();
    if (!q) return opts;
    return opts.filter((item) => {
      if (item.type === 'header') {
        return String(item.label || '')
          .toLowerCase()
          .includes(q);
      }
      return String(item.label || '')
        .toLowerCase()
        .includes(q);
    });
  }, [active, query]);

  const renderOptionRow = (item) => {
    if (item.type === 'header') {
      return (
        <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
          <Text style={[styles.sectionHeaderTxt, { color: theme.textMuted }]}>{item.label}</Text>
        </View>
      );
    }
    const isMulti = !!active?.multi;
    const selected = isMulti
      ? (active.selectedIds || []).some((id) => String(id) === String(item.value))
      : String(item.value) === String(active?.value);
    return (
      <TouchableOpacity
        style={[styles.filterOptionRow, { borderBottomColor: theme.border }]}
        onPress={() => {
          active?.onChange(item.value);
          if (!isMulti) onClose();
        }}
      >
        <Text
          style={{
            color: selected ? colorMarca : theme.text,
            fontWeight: selected ? '700' : '500',
            fontSize: 15,
            flex: 1,
          }}
        >
          {item.label}
        </Text>
        {selected ? (
          <Ionicons name={isMulti ? 'checkbox' : 'checkmark'} size={22} color={colorMarca} />
        ) : isMulti ? (
          <Ionicons name="square-outline" size={22} color={theme.textMuted} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={styles.filterPillsRow}>
        {pills.map((f) => {
          const flatOpts = f.options || [];
          const selected =
            flatOpts.find((o) => String(o.value) === String(f.value)) ||
            (f.sections || [])
              .flatMap((s) => s.data || [])
              .find((o) => String(o.value) === String(f.value));
          const hasValue = f.multi ? (f.selectedIds || []).length > 0 : f.value !== '' && f.value != null;
          const label = f.multi
            ? f.displayLabel || f.placeholder
            : hasValue
              ? f.displayLabel || selected?.label || f.placeholder
              : f.placeholder;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => onOpen(f.key)}
              style={[
                styles.filterChip,
                {
                  borderColor: hasValue ? colorMarca : theme.border,
                  backgroundColor: hasValue ? `${colorMarca}18` : theme.surface,
                  flex: pills.length === 1 ? 0 : 1,
                  alignSelf: pills.length === 1 ? 'flex-start' : undefined,
                  minWidth: pills.length === 1 ? 140 : 0,
                },
              ]}
            >
              <Text
                style={{
                  color: hasValue ? colorMarca : theme.text,
                  fontSize: 12,
                  fontWeight: '600',
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={hasValue ? colorMarca : theme.textMuted}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={!!openKey} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.filterModalOverlay}>
          <View style={[styles.filterModalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.filterModalHeader}>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
              <Text style={[styles.filterModalTitle, { color: theme.text }]}>
                {active?.placeholder || 'Elegir'}
              </Text>
              {active?.multi ? (
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 15 }}>Listo</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 26 }} />
              )}
            </View>

            {active?.searchable !== false &&
            ((active?.sections?.length || 0) > 0 || (active?.options?.length || 0) > 6) ? (
              <View
                style={[
                  styles.searchBox,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <Ionicons name="search" size={18} color={theme.icon} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Buscar…"
                  placeholderTextColor={theme.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {query.length > 0 ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.icon} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {filteredSections ? (
              <SectionList
                sections={filteredSections}
                keyExtractor={(item, index) =>
                  item.value !== undefined && item.value !== ''
                    ? String(item.value)
                    : `opt-${index}`
                }
                keyboardShouldPersistTaps="handled"
                stickySectionHeadersEnabled
                ListEmptyComponent={
                  <Text style={[styles.emptyOpts, { color: theme.textMuted }]}>
                    No hay opciones disponibles.
                  </Text>
                }
                renderSectionHeader={({ section }) =>
                  section.title ? (
                    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                      <Text style={[styles.sectionHeaderTxt, { color: theme.textMuted }]}>
                        {section.title}
                      </Text>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => renderOptionRow(item)}
              />
            ) : (
              <FlatList
                data={filteredOptions || []}
                keyExtractor={(item, index) =>
                  item.value !== undefined && item.value !== ''
                    ? String(item.value)
                    : `opt-${index}`
                }
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={[styles.emptyOpts, { color: theme.textMuted }]}>
                    No hay opciones disponibles.
                  </Text>
                }
                renderItem={({ item }) => renderOptionRow(item)}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  filterPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    minWidth: 0,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterModalTitle: { fontSize: 17, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionHeaderTxt: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyOpts: { textAlign: 'center', padding: 24, fontSize: 14 },
});
