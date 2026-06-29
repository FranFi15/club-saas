import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import UserAvatar from './UserAvatar';
import { readScreenCache, writeScreenCache, clearScreenCache } from '../hooks/useCachedFocusLoad';

const ESTADO_LABEL = {
  delegado_coach: 'Pendiente del profesor',
};

function ageRangeLabel(cat) {
  if (!cat) return '';
  const min = cat.edadMinima;
  const max = cat.edadMaxima;
  if (min == null && max == null) return 'Sin restricción de edad';
  if (min != null && max != null) return `Atletas de ${min} a ${max} años`;
  if (max != null) return `Atletas de hasta ${max} años`;
  return `Atletas de ${min} años o más`;
}

export default function CategoryRosterModal({
  visible,
  onClose,
  categoryId,
  getHeaders,
  theme,
  colorMarca,
  canDelegateToCoach,
  coachOnly,
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [categoria, setCategoria] = useState(null);
  const [atletas, setAtletas] = useState([]);
  const [selected, setSelected] = useState({});
  const [estado, setEstado] = useState(null);
  const [profesores, setProfesores] = useState([]);
  const [search, setSearch] = useState('');

  const rosterCacheKey = categoryId ? `category-roster-modal:${categoryId}` : '';

  const applyPlantel = useCallback((data) => {
    setCategoria(data.categoria || null);
    setAtletas(data.atletasElegibles || []);
    setEstado(data.plantelEdicion?.estado || null);
    setProfesores(data.categoria?.profesores || []);
    const map = {};
    (data.atletasElegibles || []).forEach((a) => {
      if (a.inscriptoEnEsta) map[String(a._id)] = true;
    });
    setSelected(map);
  }, []);

  useEffect(() => {
    if (!visible || !categoryId) return;
    let cancelled = false;
    setSearch('');

    const cached = readScreenCache(rosterCacheKey);
    if (cached) {
      applyPlantel(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    (async () => {
      try {
        const h = await getHeaders();
        const { data } = await clubApi.get(`/categories/${categoryId}/plantel`, { headers: h });
        if (cancelled) return;
        writeScreenCache(rosterCacheKey, data);
        applyPlantel(data);
      } catch (e) {
        if (!cancelled) {
          onSaved(null, e.response?.data?.message || 'No se pudo cargar el plantel.');
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, categoryId, rosterCacheKey, applyPlantel, getHeaders, onClose, onSaved]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return atletas;
    return atletas.filter((a) => {
      const full = `${a.nombre || ''} ${a.apellido || ''}`.toLowerCase();
      const dni = String(a.dni || '').toLowerCase();
      return full.includes(q) || dni.includes(q);
    });
  }, [atletas, search]);

  const toggle = (atletaId) => {
    const id = String(atletaId);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const selectAllVisible = () => {
    const map = { ...selected };
    filtered.forEach((a) => {
      map[String(a._id)] = true;
    });
    setSelected(map);
  };

  const handleSave = async () => {
    const ids = Object.keys(selected);
    if (!ids.length) return;
    setSaving(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.put(
        `/categories/${categoryId}/plantel`,
        { atletaIds: ids },
        { headers: h },
      );
      onSaved(data);
      clearScreenCache(rosterCacheKey);
      onClose();
    } catch (e) {
      onSaved(null, e.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelegate = async () => {
    setDelegating(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post(`/categories/${categoryId}/plantel/delegar`, {}, { headers: h });
      onSaved(data);
      clearScreenCache(rosterCacheKey);
      onClose();
    } catch (e) {
      onSaved(null, e.response?.data?.message || 'No se pudo delegar.');
    } finally {
      setDelegating(false);
    }
  };

  const selectedCount = Object.keys(selected).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              {coachOnly ? 'Actualizar plantel' : 'Plantel de la categoría'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={theme.icon} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colorMarca} />
            </View>
          ) : (
            <View style={styles.sheetBody}>
              <Text style={[styles.meta, { color: theme.textMuted }]}>
                {categoria?.nombre ? `${categoria.nombre} · ` : ''}
                {ageRangeLabel(categoria)}
              </Text>
              {estado === 'delegado_coach' ? (
                <View style={[styles.badge, { backgroundColor: colorMarca + '18' }]}>
                  <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 12 }}>
                    {ESTADO_LABEL[estado]}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {coachOnly
                  ? 'Marcá los atletas que integran esta categoría. Al guardar se actualizan las inscripciones.'
                  : 'Elegí quiénes pertenecen a esta categoría'}
              </Text>

              <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Ionicons name="search" size={18} color={theme.icon} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Buscar por nombre o DNI"
                  placeholderTextColor={theme.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              <TouchableOpacity onPress={selectAllVisible} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
                <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>
                  Seleccionar visibles ({filtered.length})
                </Text>
              </TouchableOpacity>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
                {filtered.length === 0 ? (
                  <Text style={[styles.hint, { color: theme.textMuted, textAlign: 'center' }]}>
                    {atletas.length === 0
                      ? 'No hay atletas que cumplan la edad de esta categoría.'
                      : 'Ningún resultado para la búsqueda.'}
                  </Text>
                ) : (
                  filtered.map((a) => {
                    const id = String(a._id);
                    const on = !!selected[id];
                    const otras = a.otrasCategorias || [];
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.row,
                          { borderColor: theme.border, backgroundColor: on ? colorMarca + '12' : theme.background },
                        ]}
                        onPress={() => toggle(id)}
                      >
                        <Ionicons
                          name={on ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={on ? colorMarca : theme.icon}
                        />
                        <UserAvatar user={a} size={36} style={{ marginLeft: 10 }} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: theme.text, fontWeight: '600' }}>
                            {a.nombre} {a.apellido}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {a.edad != null ? `${a.edad} años` : 'Sin edad'}
                            {a.dni ? ` · DNI ${a.dni}` : ''}
                          </Text>
                          {otras.length > 0 ? (
                            <Text style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                              También en: {otras.map((c) => c.nombre).join(', ')}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Text style={[styles.countLbl, { color: theme.textMuted }]}>
                  {selectedCount} atleta{selectedCount === 1 ? '' : 's'} seleccionado{selectedCount === 1 ? '' : 's'}
                </Text>

                <TouchableOpacity
                  style={[styles.primary, { backgroundColor: colorMarca, opacity: saving ? 0.6 : 1 }]}
                  onPress={handleSave}
                  disabled={saving || !selectedCount}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryTxt}>Guardar plantel</Text>
                  )}
                </TouchableOpacity>

                {canDelegateToCoach && !coachOnly ? (
                  <TouchableOpacity
                    style={[styles.secondary, { borderColor: colorMarca, opacity: delegating ? 0.6 : 1 }]}
                    onPress={handleDelegate}
                    disabled={delegating || !profesores.length || estado === 'delegado_coach'}
                  >
                    {delegating ? (
                      <ActivityIndicator color={colorMarca} />
                    ) : (
                      <>
                        <Ionicons name="person-outline" size={18} color={colorMarca} />
                        <Text style={[styles.secondaryTxt, { color: colorMarca }]}>
                          Pedir al profesor que arme el plantel
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
                {canDelegateToCoach && !profesores.length ? (
                  <Text style={[styles.hint, { color: theme.textMuted, marginTop: 8, marginBottom: 0 }]}>
                    Asigná un profesor en la pestaña Profesores para poder delegar.
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    height: '90%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  sheetBody: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  meta: { fontSize: 13, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, marginBottom: 10 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  list: { flex: 1, marginBottom: 8 },
  listContent: { paddingBottom: 8 },
  footer: { paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 8,
  },
  countLbl: { fontSize: 12, marginBottom: 8 },
  primary: { height: 48, borderRadius: 5, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  primaryTxt: { color: '#fff', fontWeight: '800' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 10,
  },
  secondaryTxt: { fontWeight: '700', fontSize: 14 },
});
