import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, StatusBar, Modal, TextInput, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Swipeable } from 'react-native-gesture-handler';

import { clubApi } from '../../utils/api';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext'; 
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { sortByNombre } from '../../utils/listSort';
import SearchableDropdown from '../../components/SearchableDropdown';
import { maskTimeHHMM, isValidTimeHHMM } from '../../utils/timeDisplay';
import {
  maskDateDDMMAAAA,
  displayDateToIsoCalendar,
  isoCalendarDateToDisplay,
  formatJsDateToDisplay,
} from '../../utils/dateDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function defaultVigenteHastaDisplay() {
  const d = new Date();
  d.setDate(d.getDate() + 12 * 7);
  return formatJsDateToDisplay(d);
}

const EMPTY_FORM = {
  disciplina: '',
  categoria: '',
  diasSemana: ['Lunes'],
  horaInicio: '18:00',
  horaFin: '19:30',
  espacio: '',
  vigenteHasta: defaultVigenteHastaDisplay(),
};

export default function GrillaEntrenamientosScreen({ navigation, route }) {
  const embeddedStaff = route?.params?.embeddedStaff === true;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext); 
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const grillaCacheKey = clubData?.urlIdentifier ? `admin-grilla:${clubData.urlIdentifier}` : '';

  const [viewerRol, setViewerRol] = useState('');
  
  const cachedGrilla = readScreenCache(grillaCacheKey);
  const [schedules, setSchedules] = useState(() => cachedGrilla?.schedules ?? []);
  const [categories, setCategories] = useState(() => cachedGrilla?.categories ?? []);
  const [disciplines, setDisciplines] = useState(() => cachedGrilla?.disciplines ?? []);
  const [spaces, setSpaces] = useState(() => cachedGrilla?.spaces ?? []);

  // Form Modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingId, setIsEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  // Filtros
  const [filterDay, setFilterDay] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

  const canModifyGrid = viewerRol === 'profe' || viewerRol === 'admin_club';
  const canDeleteGrid = viewerRol === 'admin_club';
  const uniqueDisciplines = useMemo(() => {
    const d = new Set();
    schedules.forEach(s => {
      if (s.categoria?.disciplina?.nombre) d.add(s.categoria.disciplina.nombre);
    });
    return Array.from(d).sort();
  }, [schedules]);

  const uniqueCategories = useMemo(() => {
    const c = new Set();
    schedules.forEach(s => {
      if (s.categoria?.nombre && (!filterDiscipline || s.categoria?.disciplina?.nombre === filterDiscipline)) {
        c.add(s.categoria.nombre);
      }
    });
    return Array.from(c).sort();
  }, [schedules, filterDiscipline]);

  const dayOrder = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Domingo': 7 };

  const filteredSchedules = useMemo(() => {
    let result = schedules.filter(s => {
      if (filterDay && s.diaSemana !== filterDay) return false;
      if (filterDiscipline && s.categoria?.disciplina?.nombre !== filterDiscipline) return false;
      if (filterCategory && s.categoria?.nombre !== filterCategory) return false;
      return true;
    });

    result.sort((a, b) => {
      if (dayOrder[a.diaSemana] !== dayOrder[b.diaSemana]) {
        return dayOrder[a.diaSemana] - dayOrder[b.diaSemana];
      }
      return a.horaInicio.localeCompare(b.horaInicio);
    });

    return result;
  }, [schedules, filterDay, filterDiscipline, filterCategory]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false, title: '', message: '', showCancel: false, isDanger: false,
    onConfirm: () => {}, onCancel: () => {}
  });

  const showAlert = (title, message) => {
    setAlertConfig({ visible: true, title, message, onConfirm: () => setAlertConfig(p => ({...p, visible: false})), onCancel: () => setAlertConfig(p => ({...p, visible: false})) });
  };

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` };
  };

  const fetchGrillaData = useCallback(async () => {
    const headers = await getHeaders();
    const [schedRes, catRes, spaceRes, discRes] = await Promise.all([
      clubApi.get('/schedules', { headers }),
      clubApi.get('/categories', { headers }),
      clubApi.get('/spaces', { headers }),
      clubApi.get('/disciplines', { headers }),
    ]);
    return {
      schedules: schedRes.data,
      categories: sortByNombre(catRes.data),
      spaces: sortByNombre(spaceRes.data),
      disciplines: sortByNombre(discRes.data),
    };
  }, [clubData?.urlIdentifier]);

  const applyGrillaData = useCallback((data) => {
    setSchedules(data.schedules ?? []);
    setCategories(data.categories ?? []);
    setSpaces(data.spaces ?? []);
    setDisciplines(data.disciplines ?? []);
  }, []);

  const { loading: isLoading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: grillaCacheKey,
    enabled: !!grillaCacheKey,
    fetchData: fetchGrillaData,
    onFetched: applyGrillaData,
    onFetchError: () => {
      showAlert('Error', 'No se pudo cargar la grilla.');
    },
  });

  const showInitialLoader = isLoading && schedules.length === 0;

  const handleSaveSchedule = async () => {
    if (!formData.categoria || !formData.espacio || !formData.horaInicio || !formData.horaFin || formData.diasSemana.length === 0) {
      return showAlert('Error', 'Todos los campos son obligatorios. Elige al menos un día.');
    }
    if (!isValidTimeHHMM(formData.horaInicio) || !isValidTimeHHMM(formData.horaFin)) {
      return showAlert('Error', 'Usá horarios en formato HH:MM (24 h), por ejemplo 18:30.');
    }
    const vigenteIso = displayDateToIsoCalendar(formData.vigenteHasta);
    if (!vigenteIso) {
      return showAlert('Error', 'Indicá hasta qué fecha crear sesiones para este horario (DD-MM-AAAA).');
    }
    setIsSaving(true);
    try {
      const headers = await getHeaders();
      const payload = {
        categoria: formData.categoria,
        horaInicio: formData.horaInicio,
        horaFin: formData.horaFin,
        espacio: formData.espacio,
        vigenteHasta: vigenteIso,
      };
      if (isEditingId) {
        const { data } = await clubApi.put(
          `/schedules/${isEditingId}`,
          { ...payload, diaSemana: formData.diasSemana[0] },
          { headers },
        );
        const n = data.sesionesActualizadas ?? 0;
        const del = data.sesionesEliminadas ?? 0;
        let msg = 'Horario actualizado.';
        if (n > 0) msg = `Horario actualizado. Se ajustaron ${n} sesión(es) programadas.`;
        if (del > 0) msg += ` Se quitaron ${del} sesión(es) posteriores a la nueva fecha límite.`;
        showAlert('Éxito', msg);
      } else {
        const { data } = await clubApi.post(
          '/schedules',
          { ...payload, diasSemana: formData.diasSemana },
          { headers },
        );
        showAlert('Éxito', data.message || 'Horario guardado en la grilla.');
      }
      
      reload({ background: true });
      setIsModalVisible(false);
      setFormData({ ...EMPTY_FORM, vigenteHasta: defaultVigenteHastaDisplay() });
      setIsEditingId(null);
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudo guardar el horario. Verifique que no haya choques.');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (item) => {
    setIsEditingId(item._id);
    setFormData({
      disciplina: item.categoria?.disciplina?._id || item.categoria?.disciplina || '',
      categoria: item.categoria?._id || '',
      diasSemana: [item.diaSemana],
      horaInicio: item.horaInicio,
      horaFin: item.horaFin,
      espacio: item.espacio?._id || '',
      vigenteHasta: item.vigenteHasta
        ? isoCalendarDateToDisplay(String(item.vigenteHasta).split('T')[0])
        : defaultVigenteHastaDisplay(),
    });
    setIsModalVisible(true);
  };

  const confirmDelete = (id) => {
    setAlertConfig({
      visible: true, title: 'Eliminar Horario', message: '¿Estás seguro de eliminar este horario de la grilla?',
      showCancel: true, isDanger: true, confirmText: 'Eliminar', cancelText: 'Cancelar',
      onConfirm: async () => {
        setAlertConfig(p => ({...p, visible: false}));
        try {
          const headers = await getHeaders();
          await clubApi.delete(`/schedules/${id}`, { headers });
          reload({ background: true });
        } catch (error) {
          showAlert('Error', 'No se pudo eliminar el horario.');
        }
      },
      onCancel: () => setAlertConfig(p => ({...p, visible: false}))
    });
  };

  const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const toggleDia = (dia) => {
    const current = formData.diasSemana;
    if (current.includes(dia)) {
      setFormData({ ...formData, diasSemana: current.filter(d => d !== dia) });
    } else {
      setFormData({ ...formData, diasSemana: [...current, dia] });
    }
  };

  const renderRightActions = (item) => {
    if (!canModifyGrid) return null;
    return (
      <View style={{ flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 12 }}>
        <TouchableOpacity
          onPress={() => openEditModal(item)}
          style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
        >
          <Ionicons name="pencil" size={20} color="#fff" />
        </TouchableOpacity>
        {canDeleteGrid ? (
          <TouchableOpacity
            onPress={() => confirmDelete(item._id)}
            style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
          >
            <Ionicons name="trash" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderListItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={[styles.timeBox, { backgroundColor: colorMarca + '20' }]}>
          <Text style={[styles.dayText, { color: colorMarca }]}>{item.diaSemana.substring(0, 3).toUpperCase()}</Text>
          <Text style={[styles.timeText, { color: colorMarca }]}>{item.horaInicio}</Text>
          <Text style={{ color: colorMarca, fontSize: 10 }}>a {item.horaFin}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.text }]}>{item.categoria?.nombre || 'Categoría borrada'}</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>{item.categoria?.disciplina?.nombre}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            <Ionicons name="map-outline" size={14} color={theme.textMuted} />
            <Text style={{ marginLeft: 5, color: theme.textMuted, fontSize: 12 }}>{item.espacio?.nombre || 'Espacio no asignado'}</Text>
          </View>
          {item.vigenteHasta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Ionicons name="calendar-outline" size={14} color={theme.textMuted} />
              <Text style={{ marginLeft: 5, color: theme.textMuted, fontSize: 12 }}>
                Sesiones hasta {isoCalendarDateToDisplay(String(item.vigenteHasta).split('T')[0])}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Swipeable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Planificación"
        title="Grilla de entrenamientos"
        onBack={embeddedStaff ? undefined : () => navigation.goBack()}
      />

      <View style={styles.body}>
        {/* Filtros */}
        <View style={styles.filtersContainer}>
          <SearchableDropdown 
            data={[{ label: 'Todos los Días', value: '' }, ...diasSemana.map(d => ({ label: d, value: d }))]}
            value={filterDay}
            onChange={setFilterDay}
            placeholder="Todos los Días"
            theme={theme}
            colorMarca={colorMarca}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <SearchableDropdown 
                data={[{ label: 'Todas las Disciplinas', value: '' }, ...uniqueDisciplines.map(d => ({ label: d, value: d }))]}
                value={filterDiscipline}
                onChange={(v) => { setFilterDiscipline(v); setFilterCategory(''); }}
                placeholder="Disciplinas"
                theme={theme}
                colorMarca={colorMarca}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SearchableDropdown 
                data={[{ label: 'Todas las Categorías', value: '' }, ...uniqueCategories.map(c => ({ label: c, value: c }))]}
                value={filterCategory}
                onChange={setFilterCategory}
                placeholder="Categorías"
                theme={theme}
                colorMarca={colorMarca}
              />
            </View>
          </View>
        </View>

        {showInitialLoader ? (
          <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
             data={filteredSchedules}
             keyExtractor={(item) => item._id}
             renderItem={renderListItem}
             contentContainerStyle={{ paddingBottom: 80, paddingTop: 10 }}
             refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
             ListEmptyComponent={
               <View style={styles.emptyState}>
                 <Ionicons name="calendar-outline" size={60} color={theme.icon} />
                 <Text style={[styles.emptyText, { color: theme.text }]}>Sin horarios</Text>
                 <Text style={[styles.emptySubText, { color: theme.textMuted }]}>Aún no hay horarios registrados en la grilla fija.</Text>
               </View>
             }
          />
        )}
      </View>

      {canModifyGrid && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colorMarca }]}
          onPress={() => {
            setIsEditingId(null);
            setFormData({ ...EMPTY_FORM, vigenteHasta: defaultVigenteHastaDisplay() });
            setIsModalVisible(true);
          }}
        >
          <Ionicons name="add" size={30} color="#ffffff" />
        </TouchableOpacity>
      )}

      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
           <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                 <Text style={[styles.modalTitle, { color: theme.text }]}>{isEditingId ? 'Editar Horario' : 'Agregar a la Grilla'}</Text>
                 <TouchableOpacity onPress={() => {
                   setIsModalVisible(false);
                   setFormData({ ...EMPTY_FORM, vigenteHasta: defaultVigenteHastaDisplay() });
                   setIsEditingId(null);
                 }}>
                    <Ionicons name="close" size={28} color={theme.icon} />
                 </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <Text style={[styles.label, { color: theme.textMuted }]}>Día de la Semana</Text>
              {!isEditingId ? (
                <FlatList 
                  horizontal showsHorizontalScrollIndicator={false}
                  data={diasSemana} keyExtractor={item => item}
                  renderItem={({item}) => (
                    <TouchableOpacity 
                      style={[styles.chip, formData.diasSemana.includes(item) ? { backgroundColor: colorMarca, borderColor: colorMarca } : { backgroundColor: theme.background, borderColor: theme.border }]}
                      onPress={() => toggleDia(item)}
                    >
                      <Text style={{ color: formData.diasSemana.includes(item) ? '#fff' : theme.text }}>{item.substring(0,3)}</Text>
                    </TouchableOpacity>
                  )}
                  style={{ marginBottom: 15 }}
                />
              ) : (
                <View style={{ marginBottom: 15 }}>
                  <SearchableDropdown 
                    data={diasSemana.map(d => ({ label: d, value: d }))}
                    value={formData.diasSemana[0]}
                    onChange={(v) => setFormData({...formData, diasSemana: [v]})}
                    placeholder="Seleccionar Día"
                    theme={theme}
                    colorMarca={colorMarca}
                  />
                </View>
              )}

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Hora Inicio (HH:MM)</Text>
                  <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    placeholder="18:30" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={5}
                    value={formData.horaInicio} onChangeText={(v) => setFormData({...formData, horaInicio: maskTimeHHMM(v)})}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Hora Fin (HH:MM)</Text>
                  <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    placeholder="20:00" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={5}
                    value={formData.horaFin} onChangeText={(v) => setFormData({...formData, horaFin: maskTimeHHMM(v)})}
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: theme.textMuted }]}>Disciplina</Text>
              <View style={{ marginBottom: 15 }}>
                <SearchableDropdown 
                  data={disciplines.map(d => ({ label: d.nombre, value: d._id }))}
                  value={formData.disciplina}
                  onChange={(v) => setFormData({...formData, disciplina: v, categoria: ''})}
                  placeholder="Seleccione una Disciplina..."
                  theme={theme}
                  colorMarca={colorMarca}
                />
              </View>

              <Text style={[styles.label, { color: theme.textMuted }]}>Categoría</Text>
              <View style={{ marginBottom: 0 }}>
                <SearchableDropdown 
                  data={categories.filter(c => !formData.disciplina || c.disciplina === formData.disciplina || c.disciplina?._id === formData.disciplina).map(c => ({ label: c.nombre, value: c._id }))}
                  value={formData.categoria}
                  onChange={(v) => setFormData({...formData, categoria: v})}
                  placeholder="Seleccione una Categoría..."
                  theme={theme}
                  colorMarca={colorMarca}
                />
              </View>

              <Text style={[styles.label, { color: theme.textMuted, marginTop: 15 }]}>Espacio Físico</Text>
              <View style={{ marginBottom: 0 }}>
                <SearchableDropdown 
                  data={spaces.map(s => ({ label: s.nombre, value: s._id }))}
                  value={formData.espacio}
                  onChange={(v) => setFormData({...formData, espacio: v})}
                  placeholder="Seleccione un Espacio..."
                  theme={theme}
                  colorMarca={colorMarca}
                />
              </View>

              <Text style={[styles.label, { color: theme.textMuted, marginTop: 15 }]}>
                Crear sesiones hasta (DD-MM-AAAA)
              </Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                El cron diario genera entrenamientos para este horario solo hasta esta fecha (cada horario tiene su
                propio límite).
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginBottom: 8 }]}
                placeholder="DD-MM-AAAA"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                value={formData.vigenteHasta}
                onChangeText={(v) => setFormData({ ...formData, vigenteHasta: maskDateDDMMAAAA(v) })}
              />
              {isEditingId ? (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Si cambiás el día u horario, se actualizan las sesiones programadas que aún no empezaron. Si acortás
                  la fecha, se eliminan las sesiones posteriores.
                </Text>
              ) : null}

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colorMarca, marginTop: 25 }]} onPress={handleSaveSchedule} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.saveBtnText}>{isEditingId ? 'Guardar horario' : 'Guardar en la grilla'}</Text>
                )}
              </TouchableOpacity>
              </ScrollView>
           </View>
        </View>
      </Modal>

      <CustomAlert 
        visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message}
        showCancel={alertConfig.showCancel} isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm}
        cancelText={alertConfig.cancelText} onCancel={alertConfig.onCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 12, elevation: 1 },
  timeBox: { width: 70, height: 70, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  dayText: { fontSize: 13, fontWeight: 'bold' },
  timeText: { fontSize: 16, fontWeight: 'bold', marginVertical: 2 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubText: { fontSize: 14, marginTop: 5, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, paddingBottom: 40, maxHeight: '90%' },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 8, marginLeft: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  label: { fontSize: 13, marginBottom: 5, fontWeight: '600', marginLeft: 4 },
  row: { flexDirection: 'row', marginBottom: 10 },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15 },
  chip: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipText: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  saveBtn: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  filtersContainer: { marginTop: 10, marginBottom: 15 },
  pickerWrapper: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  actionBtn:  { width: 70, justifyContent: 'center', alignItems: 'center', height: '100%' },
});
