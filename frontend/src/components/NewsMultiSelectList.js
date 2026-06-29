import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { compareListItem } from '../utils/listSort';

function matchesQuery(text, q) {
  if (!q) return true;
  const hay = String(text || '').toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

/**
 * Lista con búsqueda, filtro opcional por chips y selección múltiple (categorías, tutores, atletas, etc.).
 */
export default function NewsMultiSelectList({
  items = [],
  selectedIds = [],
  onToggle,
  onSetSelected,
  theme,
  colorMarca,
  searchLabel = 'Buscar',
  searchPlaceholder = 'Escribí para filtrar…',
  filterOptions = [],
  getItemFilterIds = () => [],
  getPrimaryLabel = (item) => item?.nombre || item?.label || '',
  getSecondaryLabel = () => null,
  getSearchText = (item) => getPrimaryLabel(item),
  emptyListHint = 'No hay opciones disponibles.',
  emptySearchHint = 'Ningún resultado coincide con la búsqueda.',
  singleSelect = false,
}) {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState(null);

  const selectedSet = useMemo(
    () => new Set((selectedIds || []).map((id) => String(id))),
    [selectedIds],
  );

  const filtered = useMemo(() => {
    let list = [...items];
    if (groupFilter) {
      list = list.filter((item) =>
        (getItemFilterIds(item) || []).some((id) => String(id) === String(groupFilter)),
      );
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((item) => matchesQuery(getSearchText(item), q));
    }
    return list.sort((a, b) => compareListItem(a, b, getPrimaryLabel));
  }, [items, groupFilter, query, getItemFilterIds, getPrimaryLabel, getSearchText]);

  const toggleAllVisible = () => {
    if (singleSelect) return;
    const visibleIds = filtered.map((item) => item._id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(String(id)));
    if (allSelected) {
      const remove = new Set(visibleIds.map(String));
      onSetSelected((selectedIds || []).filter((id) => !remove.has(String(id))));
      return;
    }
    const merged = new Set((selectedIds || []).map(String));
    visibleIds.forEach((id) => merged.add(String(id)));
    onSetSelected([...merged]);
  };

  const clearAll = () => onSetSelected([]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.searchLabel, { color: theme.textMuted }]}>{searchLabel}</Text>
      <View style={[styles.searchRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={20} color={theme.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
          placeholder={searchPlaceholder}
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {filterOptions.length > 1 ? (
        <>
          <Text style={[styles.filterLabel, { color: theme.textMuted }]}>Filtrar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: !groupFilter ? colorMarca : theme.border,
                  backgroundColor: !groupFilter ? colorMarca : theme.background,
                },
              ]}
              onPress={() => setGroupFilter(null)}
            >
              <Text style={{ color: !groupFilter ? '#fff' : theme.text, fontSize: 12, fontWeight: '600' }}>
                Todos
              </Text>
            </TouchableOpacity>
            {filterOptions.map((opt) => {
              const active = groupFilter === opt.id;
              return (
                <TouchableOpacity
                  key={String(opt.id)}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: active ? colorMarca : theme.border,
                      backgroundColor: active ? colorMarca : theme.background,
                    },
                  ]}
                  onPress={() => setGroupFilter(active ? null : opt.id)}
                >
                  <Text
                    style={{ color: active ? '#fff' : theme.text, fontSize: 12, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <View style={styles.toolbar}>
        <Text style={[styles.count, { color: theme.textMuted }]}>
          {singleSelect
            ? selectedIds.length
              ? '1 seleccionado'
              : 'Elegí uno'
            : `${selectedIds.length} seleccionado${selectedIds.length === 1 ? '' : 's'}`}
          {!singleSelect && filtered.length !== items.length ? ` · ${filtered.length} en lista` : ''}
        </Text>
        {!singleSelect ? (
          <View style={styles.toolbarBtns}>
            <TouchableOpacity onPress={toggleAllVisible}>
              <Text style={[styles.link, { color: colorMarca }]}>
                {filtered.length > 0 && filtered.every((item) => selectedSet.has(String(item._id)))
                  ? 'Quitar todos'
                  : 'Seleccionar todos'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <ScrollView style={[styles.list, { borderColor: theme.border }]} nestedScrollEnabled>
        {filtered.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            {items.length === 0 ? emptyListHint : emptySearchHint}
          </Text>
        ) : (
          filtered.map((item) => {
            const sel = selectedSet.has(String(item._id));
            const sub = getSecondaryLabel(item);
            return (
              <TouchableOpacity
                key={String(item._id)}
                style={[
                  styles.row,
                  { borderBottomColor: theme.border },
                  sel && { backgroundColor: colorMarca + '12' },
                ]}
                onPress={() => {
                  if (singleSelect) {
                    const id = item._id;
                    if (selectedSet.has(String(id))) {
                      onSetSelected([]);
                    } else {
                      onSetSelected([id]);
                    }
                    return;
                  }
                  onToggle(item._id);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    singleSelect
                      ? sel
                        ? 'radio-button-on'
                        : 'radio-button-off'
                      : sel
                        ? 'checkbox'
                        : 'square-outline'
                  }
                  size={22}
                  color={sel ? colorMarca : theme.icon}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: theme.text }]}>{getPrimaryLabel(item)}</Text>
                  {sub ? (
                    <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 15 },
  searchLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: Platform.OS === 'web' ? 10 : 8 },
  filterLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  filterScroll: { gap: 8, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  count: { fontSize: 12, flex: 1 },
  toolbarBtns: { flexDirection: 'row', gap: 12 },
  link: { fontSize: 12, fontWeight: '700' },
  list: { maxHeight: 280, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  empty: { padding: 20, textAlign: 'center', fontSize: 13 },
});
