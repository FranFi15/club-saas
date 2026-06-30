import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import UserAvatar from './UserAvatar';
import { clearScreenCache } from '../hooks/useCachedFocusLoad';

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 450;

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

function selectedFromInscriptoIds(ids = []) {
  const map = {};
  ids.forEach((id) => {
    map[String(id)] = true;
  });
  return map;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [categoria, setCategoria] = useState(null);
  const [atletas, setAtletas] = useState([]);
  const [selected, setSelected] = useState({});
  const [estado, setEstado] = useState(null);
  const [profesores, setProfesores] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const rosterCacheKey = categoryId ? `category-roster-modal:${categoryId}` : '';
  const searchDebounceRef = useRef(null);
  const prevDebouncedSearchRef = useRef(null);

  const applyMeta = useCallback((data) => {
    setCategoria(data.categoria || null);
    setEstado(data.plantelEdicion?.estado || null);
    setProfesores(data.categoria?.profesores || []);
    setSelected(selectedFromInscriptoIds(data.inscriptoIds));
  }, []);

  const buildPlantelUrl = useCallback(
    (pageNum, searchTerm) => {
      let url = `/categories/${categoryId}/plantel?page=${pageNum}&limit=${PAGE_SIZE}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      return url;
    },
    [categoryId],
  );

  const fetchAthletesPage = useCallback(
    async (pageNum, searchTerm, { append = false } = {}) => {
      const h = await getHeaders();
      const { data } = await clubApi.get(buildPlantelUrl(pageNum, searchTerm), { headers: h });
      const rows = data.atletasElegibles || [];
      setAtletas((prev) => (append ? [...prev, ...rows] : rows));
      setPage(data.page ?? pageNum);
      setHasMore(data.hasMore ?? false);
      return data;
    },
    [buildPlantelUrl, getHeaders],
  );

  const loadPlantel = useCallback(
    async (searchTerm) => {
      setLoading(true);
      try {
        const h = await getHeaders();
        const [metaRes] = await Promise.all([
          clubApi.get(`/categories/${categoryId}/plantel?metaOnly=true`, { headers: h }),
          fetchAthletesPage(1, searchTerm),
        ]);
        applyMeta(metaRes.data);
      } catch (e) {
        onSaved(null, e.response?.data?.message || 'No se pudo cargar el plantel.');
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [categoryId, getHeaders, fetchAthletesPage, applyMeta, onClose, onSaved],
  );

  useEffect(() => {
    if (!visible || !categoryId) return;
    setSearch('');
    setDebouncedSearch('');
    prevDebouncedSearchRef.current = null;
    setAtletas([]);
    setPage(1);
    setHasMore(false);
    loadPlantel('');
  }, [visible, categoryId, loadPlantel]);

  useEffect(() => {
    if (!visible || !categoryId) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search, visible, categoryId]);

  useEffect(() => {
    if (!visible || !categoryId) return;
    if (prevDebouncedSearchRef.current === null) {
      prevDebouncedSearchRef.current = debouncedSearch;
      return;
    }
    if (prevDebouncedSearchRef.current === debouncedSearch) return;
    prevDebouncedSearchRef.current = debouncedSearch;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await fetchAthletesPage(1, debouncedSearch);
      } catch (e) {
        if (!cancelled) {
          onSaved(null, e.response?.data?.message || 'No se pudo buscar atletas.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, visible, categoryId, fetchAthletesPage, onSaved]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      await fetchAthletesPage(page + 1, debouncedSearch, { append: true });
    } catch {
      onSaved(null, 'No se pudieron cargar más atletas.');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, page, debouncedSearch, fetchAthletesPage, onSaved]);

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
    atletas.forEach((a) => {
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

  const isSearchPending = search.trim() !== debouncedSearch;
  const selectedCount = Object.keys(selected).length;

  const renderAthlete = ({ item: a }) => {
    const id = String(a._id);
    const on = !!selected[id];
    const otras = a.otrasCategorias || [];
    return (
      <TouchableOpacity
        style={[
          styles.row,
          { borderColor: theme.border, backgroundColor: on ? colorMarca + '12' : theme.background },
        ]}
        onPress={() => toggle(id)}
      >
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colorMarca : theme.icon} />
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
  };

  const listHeader = (
    <>
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
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={theme.icon} />
          </TouchableOpacity>
        ) : isSearchPending || (loading && atletas.length > 0) ? (
          <ActivityIndicator size="small" color={colorMarca} />
        ) : null}
      </View>

      <TouchableOpacity onPress={selectAllVisible} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
        <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>
          Seleccionar cargados ({atletas.length})
        </Text>
      </TouchableOpacity>
    </>
  );

  const listEmpty = () => {
    if (loading && atletas.length === 0) {
      return <ActivityIndicator color={colorMarca} style={{ marginTop: 24 }} />;
    }
    return (
      <Text style={[styles.hint, { color: theme.textMuted, textAlign: 'center' }]}>
        {debouncedSearch
          ? 'Ningún resultado para la búsqueda.'
          : 'No hay atletas que cumplan la edad de esta categoría.'}
      </Text>
    );
  };

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

          {loading && atletas.length === 0 && !categoria ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colorMarca} />
            </View>
          ) : (
            <View style={styles.sheetBody}>
              <FlatList
                data={atletas}
                keyExtractor={(item) => String(item._id)}
                renderItem={renderAthlete}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={listEmpty}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                onEndReached={loadMore}
                onEndReachedThreshold={0.35}
                ListFooterComponent={
                  loadingMore ? <ActivityIndicator color={colorMarca} style={{ marginVertical: 12 }} /> : null
                }
              />

              <View style={styles.footer}>
                <Text style={[styles.countLbl, { color: theme.textMuted }]}>
                  {selectedCount} atleta{selectedCount === 1 ? '' : 's'} seleccionado
                  {selectedCount === 1 ? '' : 's'}
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
  listContent: { paddingBottom: 8, flexGrow: 1 },
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
