// src/screens/admin/EstructuraScreen.js
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, StatusBar, TextInput, Modal,
  KeyboardAvoidingView, Platform, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler'; 

import { clubApi } from '../../utils/api';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext'; 
import { getToken } from '../../utils/storage';

// 1. IMPORTAMOS EL CUSTOM ALERT
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { sortByNombre } from '../../utils/listSort';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function EstructuraScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext); 
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const estructuraCacheKey = clubData?.urlIdentifier ? `admin-estructura:${clubData.urlIdentifier}` : '';

  const [disciplines, setDisciplines] = useState(() => readScreenCache(estructuraCacheKey)?.list ?? []);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredDisciplines, setFilteredDisciplines] = useState([]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [disciplineName, setDisciplineName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingDiscipline, setEditingDiscipline] = useState(null); 

  // Plan default de la disciplina (fallback si categoría no tiene planDefault)
  const [plans, setPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [planPickerVisible, setPlanPickerVisible] = useState(false);
  const [planDefaultId, setPlanDefaultId] = useState(null);

  // 2. ESTADO PARA CONTROLAR LA ALERTA
  const [alertConfig, setAlertConfig] = useState({
    visible: false, title: '', message: '', showCancel: false, isDanger: false,
    onConfirm: () => {}, onCancel: () => {}, confirmText: 'Aceptar', cancelText: 'Cancelar'
  });

  // FUNCIÓN AYUDANTE PARA MOSTRAR ALERTA
  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: closeAlert
    });
  };

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      'Authorization': `Bearer ${token}`,
    };
  };

  const fetchDisciplinasData = useCallback(async () => {
    const response = await clubApi.get('/disciplines', { headers: await getHeaders() });
    return { list: sortByNombre(response.data) };
  }, [clubData?.urlIdentifier]);

  const applyDisciplinas = useCallback((data) => {
    setDisciplines(data.list ?? []);
    setFilteredDisciplines(data.list ?? []);
  }, []);

  const { loading: isLoading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: estructuraCacheKey,
    enabled: !!estructuraCacheKey,
    fetchData: fetchDisciplinasData,
    onFetched: applyDisciplinas,
    onFetchError: (error) => {
      console.log('Error cargando:', error.message);
    },
  });

  const showInitialLoader = isLoading && disciplines.length === 0;

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredDisciplines(disciplines);
    } else {
      const filtered = disciplines.filter(discipline => 
        discipline.nombre.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredDisciplines(filtered);
    }
  }, [searchQuery, disciplines]);

  const fetchPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const response = await clubApi.get('/financial/plans', { headers: await getHeaders() });
      setPlans(response.data);
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudieron cargar los planes.');
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const handleSaveDiscipline = async () => {
    if (!disciplineName.trim()) {
      // 3. USAMOS LA NUEVA ALERTA ACÁ
      showAlert('Atención', 'El nombre de la disciplina no puede estar vacío.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingDiscipline) {
        const response = await clubApi.put(`/disciplines/${editingDiscipline._id}`, 
          { nombre: disciplineName.trim(), planDefault: planDefaultId },
          { headers: await getHeaders() }
        );
        const updatedList = disciplines.map(d => 
          d._id === editingDiscipline._id ? { ...d, ...response.data } : d
        );
        setDisciplines(sortByNombre(updatedList));
      } else {
        const response = await clubApi.post('/disciplines', 
          { nombre: disciplineName.trim(), planDefault: planDefaultId },
          { headers: await getHeaders() }
        );
        const newDiscipline = response.data.disciplina || response.data;
        setDisciplines(sortByNombre([...disciplines, newDiscipline]));
      }
      closeModal();
    } catch (error) {
      // 3. USAMOS LA NUEVA ALERTA ACÁ
      showAlert('Error', error.response?.data?.message || 'Hubo un problema al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (item) => {
    // 3. USAMOS LA NUEVA ALERTA ACÁ (CON BOTÓN DE CANCELAR Y COLOR ROJO)
    showAlert(
      "Quitar disciplina",
      `¿Querés quitar ${item.nombre} de la estructura? Si tiene categorías asociadas, no se va a poder.`,
      {
        showCancel: true,
        isDanger: true,
        confirmText: "Eliminar",
        onConfirm: async () => {
          closeAlert(); // Cerramos la alerta inmediatamente
          try {
            await clubApi.delete(`/disciplines/${item._id}`, { headers: await getHeaders() });
            setDisciplines(prev => prev.filter(d => d._id !== item._id));
          } catch (error) {
            showAlert('Error', 'No se pudo eliminar. Verificá si tiene categorías asociadas.');
          }
        }
      }
    );
  };

  const openEditModal = (item) => {
    setEditingDiscipline(item);
    setDisciplineName(item.nombre);
    setPlanDefaultId(item.planDefault?._id || null);
    setIsModalVisible(true);
  };

  const openCreateModal = () => {
    setEditingDiscipline(null);
    setDisciplineName('');
    setPlanDefaultId(null);
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setEditingDiscipline(null);
    setDisciplineName('');
    setPlanDefaultId(null);
    setPlanPickerVisible(false);
  };

  const renderRightActions = (item) => {
    return (
      <View style={styles.swipeActionsContainer}>
        <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#f59e0b' }]} onPress={() => openEditModal(item)}>
          <Ionicons name="pencil" size={22} color="#ffffff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#ef4444' }]} onPress={() => handleDelete(item)}>
          <Ionicons name="trash" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>
    );
  };

 const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: theme.surface }]} 
        activeOpacity={0.7} 
        onPress={() => navigation.navigate('Categorias', { disciplina: item })} 
      >
        <View style={styles.cardContent}>
          
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{item.nombre}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>
              Plan auto: {item.planDefault?.nombre || 'Sin plan'}
              {item.planDefault?.monto ? ` • $${Number(item.planDefault.monto).toLocaleString('es-AR')}` : ''}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.icon} />
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Gestión"
        title="Estructura deportiva"
        subtitle={clubData?.nombre || 'Disciplinas y categorías'}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={20} color={theme.icon} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar disciplina..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.icon} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {showInitialLoader ? (
          <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={filteredDisciplines}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={60} color={theme.icon} />
                <Text style={[styles.emptyText, { color: theme.text }]}>
                  {disciplines.length === 0 ? "No hay disciplinas cargadas." : "No se encontraron resultados."}
                </Text>
                <Text style={[styles.emptySubText, { color: theme.textMuted }]}>
                  {disciplines.length === 0 ? "Tocá el botón '+' para crear la primera." : "Intentá con otro nombre."}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity style={[styles.fab, { backgroundColor: colorMarca }]} onPress={openCreateModal}>
        <Ionicons name="add" size={30} color="#ffffff" />
      </TouchableOpacity>

      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {planPickerVisible ? (
                    <TouchableOpacity onPress={() => setPlanPickerVisible(false)} style={{ paddingVertical: 4, paddingRight: 6 }}>
                      <Ionicons name="arrow-back" size={22} color={theme.icon} />
                    </TouchableOpacity>
                  ) : null}
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {planPickerVisible ? 'Elegir Plan' : (editingDiscipline ? "Editar Disciplina" : "Nueva Disciplina")}
                  </Text>
                </View>
                <TouchableOpacity onPress={closeModal}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>
              {planPickerVisible ? (
                <>
                  {isLoadingPlans ? (
                    <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 20 }} />
                  ) : (
                    <FlatList
                      data={[{ _id: null, nombre: 'Sin plan', monto: 0 }, ...plans.filter((p) => p.activo !== false)]}
                      keyExtractor={(p, idx) => (p._id ? p._id : `none-${idx}`)}
                      renderItem={({ item: p }) => {
                        const isSel = (p._id || null) === (planDefaultId || null);
                        return (
                          <TouchableOpacity
                            style={[
                              styles.planPickItem,
                              { borderBottomColor: theme.border, backgroundColor: isSel ? colorMarca + '12' : 'transparent' },
                            ]}
                            onPress={() => {
                              setPlanDefaultId(p._id || null);
                              setPlanPickerVisible(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{p.nombre}</Text>
                              {p._id ? (
                                <Text style={{ color: theme.textMuted, marginTop: 2 }}>${Number(p.monto || 0).toLocaleString('es-AR')}</Text>
                              ) : null}
                            </View>
                            {isSel ? (
                              <Ionicons name="checkmark-circle" size={22} color={colorMarca} />
                            ) : (
                              <Ionicons name="ellipse-outline" size={22} color={theme.icon} />
                            )}
                          </TouchableOpacity>
                        );
                      }}
                      style={{ marginTop: 10, maxHeight: 420 }}
                    />
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Nombre de la disciplina</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    placeholder="Ej: Básquet"
                    placeholderTextColor={theme.textMuted}
                    value={disciplineName}
                    onChangeText={setDisciplineName}
                    autoFocus={true}
                  />

                  <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Plan por defecto (auto al inscribir)</Text>
                  <TouchableOpacity
                    style={[styles.planSelect, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={async () => {
                      if (plans.length === 0) await fetchPlans();
                      setPlanPickerVisible(true);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>
                        {planDefaultId ? (plans.find((p) => p._id === planDefaultId)?.nombre || 'Plan seleccionado') : 'Sin plan'}
                      </Text>
                      {planDefaultId ? (
                        <Text style={{ color: theme.textMuted, marginTop: 2 }}>
                          {(() => {
                            const p = plans.find((x) => x._id === planDefaultId);
                            return p?.monto ? `$${Number(p.monto).toLocaleString('es-AR')}` : '';
                          })()}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.icon} />
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.modalButton, { backgroundColor: colorMarca }]} onPress={handleSaveDiscipline} disabled={isSaving}>
                    {isSaving ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.modalButtonText}>{editingDiscipline ? "Guardar Cambios" : "Crear Disciplina"}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 4. RENDERIZAMOS EL CUSTOM ALERT AL FINAL DE TODO */}
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 20, marginTop: 12, marginBottom: 10, zIndex: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 5, paddingHorizontal: 15, borderWidth: 1, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16 },
  body: { flex: 1, paddingHorizontal: 20 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 5, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { padding: 10, borderRadius: 10, marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  swipeActionsContainer: { flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 5 },
  swipeBtn: { width: 70, justifyContent: 'center', alignItems: 'center', height: '100%' },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubText: { fontSize: 14, marginTop: 5 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 5, borderTopRightRadius: 5, padding: 25, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalLabel: { fontSize: 14, marginBottom: 8, fontWeight: '500' },
  modalInput: { width: '100%', height: 50, borderWidth: 1, borderRadius: 5, paddingHorizontal: 16, fontSize: 16, marginBottom: 25 },
  planSelect: { width: '100%', minHeight: 54, borderWidth: 1, borderRadius: 5, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  planPickItem: { paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  modalButton: { width: '100%', height: 50, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  modalButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});