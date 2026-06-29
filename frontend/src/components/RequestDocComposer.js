import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getToken } from '../utils/storage';
import { clubApi } from '../utils/api';
import CustomAlert from './CustomAlert';
import SearchableDropdown from './SearchableDropdown';
import NewsMultiSelectList from './NewsMultiSelectList';
import CoachNewsAthletePicker from './CoachNewsAthletePicker';
import { sortByNombre, sortUsersByName } from '../utils/listSort';
import { displayDateToIsoCalendar, maskDateDDMMAAAA } from '../utils/dateDisplay';
import { USER_FILTER_ROLES, USER_ROL_LABELS, userRoleFilterLabel } from '../constants/userRoles';

const DOC_ADMIN_ALCANCE = [
  { value: 'global', label: 'Todo el club', icon: 'globe-outline', hint: 'Todos los atletas activos' },
  { value: 'categoria', label: 'Categorías', icon: 'shirt-outline', hint: 'Una o varias categorías' },
  { value: 'usuario', label: 'Personas', icon: 'person-outline', hint: 'Una o varias personas del club' },
];

const DOC_STAFF_ALCANCE = [
  { value: 'categoria', label: 'Mis categorías', icon: 'shirt-outline', hint: 'Uno o varios equipos' },
  { value: 'usuario', label: 'Atletas', icon: 'person-outline', hint: 'Uno o varios atletas' },
];

export default function RequestDocComposer({
  onSuccess,
  variant = 'staff',
  theme,
  colorMarca,
  clubData,
}) {
  const isAdmin = variant === 'admin';

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [categories, setCategories] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [staffAthletes, setStaffAthletes] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [viewerRol, setViewerRol] = useState('');

  const [alcance, setAlcance] = useState(isAdmin ? 'global' : 'categoria');
  const [disciplinaFilter, setDisciplinaFilter] = useState('');
  const [targetCategorias, setTargetCategorias] = useState([]);
  const [targetUsuarios, setTargetUsuarios] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [obligatorio, setObligatorio] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showAlert = (title, message) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const resetForm = useCallback(() => {
    setAlcance(isAdmin ? 'global' : 'categoria');
    setDisciplinaFilter('');
    setTargetCategorias([]);
    setTargetUsuarios([]);
    setTitulo('');
    setDescripcion('');
    setFechaVencimiento('');
    setObligatorio(true);
  }, [isAdmin]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const h = await headers();
      const rol = (await getToken('userRol')) || '';
      setViewerRol(rol);

      if (isAdmin) {
        const [catRes, discRes, usersRes] = await Promise.all([
          clubApi.get('/categories', { headers: h }),
          clubApi.get('/disciplines', { headers: h }),
          clubApi.get('/users', { headers: h, params: { limit: 500 } }),
        ]);
        const cats = sortByNombre(catRes.data || []);
        setCategories(cats);
        setDisciplines(sortByNombre(discRes.data || []));
        setAdminUsers(sortUsersByName(usersRes.data?.users || []));
      } else {
        const [catRes, athRes] = await Promise.all([
          clubApi.get('/categories/mis-categorias', { headers: h }),
          clubApi.get('/categories/mis-atletas', { headers: h }),
        ]);
        const cats = sortByNombre(catRes.data || []);
        setCategories(cats);
        setDisciplines([]);
        setStaffAthletes(
          sortUsersByName(
            (athRes.data || []).map((row) => {
              const a = row?.atleta || {};
              const categorias = Array.isArray(row?.categorias) ? row.categorias : [];
              const categoriaIds = categorias.map((c) => c?._id).filter(Boolean);
              const categoriasLabel = categorias.map((c) => c?.nombre).filter(Boolean).join(' · ');
              return { ...a, categoriaIds, categoriasLabel };
            }),
          ),
        );
      }
    } catch {
      showAlert('Error', 'No se pudieron cargar los datos del club.');
    } finally {
      setLoadingMeta(false);
    }
  }, [headers, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      resetForm();
      loadMeta();
    }, [resetForm, loadMeta]),
  );

  const categoryPickerItems = useMemo(
    () =>
      (categories || []).map((c) => {
        const discId = c.disciplina?._id || c.disciplina;
        const disc = (disciplines || []).find((d) => String(d._id) === String(discId));
        return {
          _id: c._id,
          nombre: c.nombre,
          disciplinaId: discId,
          disciplinaNombre: c.disciplina?.nombre || disc?.nombre || '',
        };
      }),
    [categories, disciplines],
  );

  const disciplinaDropdownOptions = useMemo(() => {
    if (isAdmin) {
      return [
        { label: 'Todas las disciplinas', value: '' },
        ...sortByNombre((disciplines || []).map((d) => ({ label: d.nombre, value: d._id }))),
      ];
    }
    const seen = new Map();
    (categories || []).forEach((c) => {
      const id = c.disciplina?._id || c.disciplina;
      if (!id || seen.has(String(id))) return;
      seen.set(String(id), c.disciplina?.nombre || 'Disciplina');
    });
    return [
      { label: 'Todas las disciplinas', value: '' },
      ...sortByNombre([...seen.entries()].map(([value, label]) => ({ value, label }))),
    ];
  }, [isAdmin, disciplines, categories]);

  const filteredCategoryPickerItems = useMemo(() => {
    if (!disciplinaFilter) return categoryPickerItems;
    return categoryPickerItems.filter((c) => String(c.disciplinaId) === String(disciplinaFilter));
  }, [categoryPickerItems, disciplinaFilter]);

  const handleDisciplinaChange = useCallback(
    (value) => {
      setDisciplinaFilter(value);
      if (!value) return;
      setTargetCategorias((prev) =>
        prev.filter((id) => {
          const cat = categoryPickerItems.find((c) => String(c._id) === String(id));
          return cat && String(cat.disciplinaId) === String(value);
        }),
      );
    },
    [categoryPickerItems],
  );

  const toggleCategoria = useCallback((catId) => {
    setTargetCategorias((prev) => {
      const id = String(catId);
      if (prev.some((x) => String(x) === id)) return prev.filter((x) => String(x) !== id);
      return [...prev, catId];
    });
  }, []);

  const toggleUsuario = useCallback((userId) => {
    setTargetUsuarios((prev) => {
      const id = String(userId);
      if (prev.some((x) => String(x) === id)) return prev.filter((x) => String(x) !== id);
      return [...prev, userId];
    });
  }, []);

  const showDisciplinaDropdown = disciplinaDropdownOptions.length > 1;

  const adminUserFilterOptions = useMemo(
    () =>
      USER_FILTER_ROLES.filter((r) => r !== 'Todos').map((r) => ({
        id: r,
        label: userRoleFilterLabel(r),
      })),
    [],
  );

  const adminUserItems = useMemo(
    () =>
      (adminUsers || []).map((u) => ({
        ...u,
        rolFilterId: u.rol,
      })),
    [adminUsers],
  );

  const submit = async () => {
    if (!titulo.trim()) {
      showAlert('Atención', 'Indicá un título para el pedido.');
      return;
    }
    if (alcance === 'categoria' && targetCategorias.length === 0) {
      showAlert('Atención', 'Elegí al menos una categoría.');
      return;
    }
    if (alcance === 'usuario' && targetUsuarios.length === 0) {
      showAlert('Atención', isAdmin ? 'Elegí al menos una persona del club.' : 'Elegí al menos un atleta.');
      return;
    }

    let fechaIso;
    if (fechaVencimiento.trim()) {
      fechaIso = displayDateToIsoCalendar(fechaVencimiento.trim());
      if (!fechaIso) {
        showAlert('Fecha', 'Usá el formato DD-MM-AAAA para el vencimiento.');
        return;
      }
    }

    setSaving(true);
    try {
      const h = await headers();
      const basePayload = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        obligatorio,
        fechaVencimiento: fechaIso || undefined,
        alcance,
      };

      if (alcance === 'global') {
        await clubApi.post('/requirements', basePayload, { headers: h });
      } else if (alcance === 'categoria') {
        for (const targetCategoria of targetCategorias) {
          await clubApi.post(
            '/requirements',
            { ...basePayload, targetCategoria },
            { headers: h },
          );
        }
      } else {
        for (const targetUsuario of targetUsuarios) {
          await clubApi.post(
            '/requirements',
            { ...basePayload, targetUsuario },
            { headers: h },
          );
        }
      }
      onSuccess?.();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo crear el pedido.');
    } finally {
      setSaving(false);
    }
  };

  const alcanceOptions = isAdmin ? DOC_ADMIN_ALCANCE : DOC_STAFF_ALCANCE;
  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
  ];

  if (loadingMeta) {
    return <ActivityIndicator color={colorMarca} style={{ marginTop: 40 }} />;
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <Text style={[styles.label, { color: theme.textMuted }]}>Título del pedido</Text>
        <TextInput
          style={inputStyle}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ej. Apto médico 2026"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Detalle (opcional)</Text>
        <TextInput
          style={[inputStyle, styles.textArea]}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Instrucciones para quien debe subir el archivo"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Vencimiento (opcional)</Text>
        <TextInput
          style={inputStyle}
          value={fechaVencimiento}
          onChangeText={(t) => setFechaVencimiento(maskDateDDMMAAAA(t))}
          placeholder="DD-MM-AAAA"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
          maxLength={10}
        />

        <View style={[styles.switchRow, { borderColor: theme.border }]}>
          <Text style={[styles.switchLbl, { color: theme.text }]}>Obligatorio</Text>
          <Switch value={obligatorio} onValueChange={setObligatorio} trackColor={{ true: colorMarca }} />
        </View>

        <Text style={[styles.label, { color: theme.textMuted }]}>¿A quién va dirigido?</Text>
        <View style={styles.alcanceRow}>
          {alcanceOptions.map((opt) => {
            const active = alcance === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.alcanceChip,
                  active
                    ? { backgroundColor: colorMarca, borderColor: colorMarca }
                    : { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                      onPress={() => {
                        setAlcance(opt.value);
                        setDisciplinaFilter('');
                        setTargetCategorias([]);
                        setTargetUsuarios([]);
                      }}
              >
                <Ionicons name={opt.icon} size={14} color={active ? '#fff' : colorMarca} />
                <Text style={[styles.alcanceChipTxt, { color: active ? '#fff' : theme.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {alcanceOptions.find((o) => o.value === alcance)?.hint ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {alcanceOptions.find((o) => o.value === alcance).hint}
          </Text>
        ) : null}

        {alcance === 'categoria' && isAdmin ? (
          <View style={styles.pickerBlock}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Categoría destino</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Buscá y marcá una o varias categorías
              {showDisciplinaDropdown ? '. Filtrá por disciplina si hace falta' : ''}.
            </Text>
            {showDisciplinaDropdown ? (
              <View style={styles.dropdownWrap}>
                <Text style={[styles.dropdownLabel, { color: theme.textMuted }]}>Disciplina</Text>
                <SearchableDropdown
                  theme={theme}
                  colorMarca={colorMarca}
                  compact
                  data={disciplinaDropdownOptions}
                  value={disciplinaFilter}
                  onChange={handleDisciplinaChange}
                  placeholder="Todas las disciplinas"
                />
              </View>
            ) : null}
            <NewsMultiSelectList
              items={filteredCategoryPickerItems}
              selectedIds={targetCategorias}
              onToggle={toggleCategoria}
              onSetSelected={setTargetCategorias}
              theme={theme}
              colorMarca={colorMarca}
              searchLabel="Buscar categoría"
              searchPlaceholder="Nombre de categoría…"
              getPrimaryLabel={(c) => c.nombre}
              getSecondaryLabel={(c) => c.disciplinaNombre || null}
              getSearchText={(c) => `${c.nombre} ${c.disciplinaNombre}`}
              emptyListHint="No hay categorías cargadas."
              emptySearchHint="Ninguna categoría coincide con la búsqueda."
            />
          </View>
        ) : null}

        {alcance === 'categoria' && !isAdmin ? (
          <View style={styles.pickerBlock}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Tu categoría</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Marcá uno o varios equipos donde estás asignado
              {viewerRol === 'profe' ? ' como profesor' : ''}.
            </Text>
            {showDisciplinaDropdown ? (
              <View style={styles.dropdownWrap}>
                <Text style={[styles.dropdownLabel, { color: theme.textMuted }]}>Disciplina</Text>
                <SearchableDropdown
                  theme={theme}
                  colorMarca={colorMarca}
                  compact
                  data={disciplinaDropdownOptions}
                  value={disciplinaFilter}
                  onChange={handleDisciplinaChange}
                  placeholder="Todas las disciplinas"
                />
              </View>
            ) : null}
            <NewsMultiSelectList
              items={filteredCategoryPickerItems}
              selectedIds={targetCategorias}
              onToggle={toggleCategoria}
              onSetSelected={setTargetCategorias}
              theme={theme}
              colorMarca={colorMarca}
              searchLabel="Buscar categoría"
              searchPlaceholder="Nombre de categoría…"
              getPrimaryLabel={(c) => c.nombre}
              getSecondaryLabel={(c) => c.disciplinaNombre || null}
              getSearchText={(c) => `${c.nombre} ${c.disciplinaNombre}`}
              emptyListHint="No tenés categorías asignadas."
              emptySearchHint="Ninguna categoría coincide con la búsqueda."
            />
          </View>
        ) : null}

        {alcance === 'usuario' && isAdmin ? (
          <View style={styles.pickerBlock}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Personas destino</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Buscá y marcá una o varias personas. Filtrá por rol si hace falta.
            </Text>
            <NewsMultiSelectList
              items={adminUserItems}
              selectedIds={targetUsuarios}
              onToggle={toggleUsuario}
              onSetSelected={setTargetUsuarios}
              theme={theme}
              colorMarca={colorMarca}
              searchLabel="Buscar persona"
              searchPlaceholder="Nombre, apellido o email…"
              filterOptions={adminUserFilterOptions}
              getItemFilterIds={(u) => (u.rolFilterId ? [u.rolFilterId] : [])}
              getPrimaryLabel={(u) => `${u.nombre || ''} ${u.apellido || ''}`.trim()}
              getSecondaryLabel={(u) =>
                [USER_ROL_LABELS[u.rol] || u.rol, u.email].filter(Boolean).join(' · ')
              }
              getSearchText={(u) => `${u.nombre} ${u.apellido} ${u.email || ''} ${u.rol || ''}`}
              emptyListHint="No hay usuarios cargados."
              emptySearchHint="Ninguna persona coincide con la búsqueda."
            />
          </View>
        ) : null}

        {alcance === 'usuario' && !isAdmin ? (
          <View style={styles.pickerBlock}>
            <CoachNewsAthletePicker
              athletes={staffAthletes}
              categories={categories}
              selectedIds={targetUsuarios}
              onToggle={toggleUsuario}
              onSetSelected={setTargetUsuarios}
              theme={theme}
              colorMarca={colorMarca}
            />
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
          onPress={submit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnTxt}>Enviar pedido</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginLeft: 2,
  },
  dropdownWrap: { marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 15,
  },
  textArea: { minHeight: 88 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  switchLbl: { fontSize: 15, fontWeight: '600' },
  alcanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  alcanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  alcanceChipTxt: { fontSize: 12, fontWeight: '600' },
  pickerBlock: { marginTop: 4, marginBottom: 8 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
