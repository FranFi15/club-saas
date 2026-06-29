// src/screens/admin/CategoriasScreen.js
import React, { useState, useContext, useCallback } from 'react';
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
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { sortByNombre } from '../../utils/listSort';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function CategoriasScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext); 
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  
  const { disciplina } = route.params;
  const categoriesCacheKey =
    clubData?.urlIdentifier && disciplina?._id
      ? `admin-categorias:${clubData.urlIdentifier}:${disciplina._id}`
      : '';

  const [categories, setCategories] = useState(() => readScreenCache(categoriesCacheKey)?.list ?? []);

  // ESTADOS DEL MODAL
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [edadMin, setEdadMin] = useState('');
  const [edadMax, setEdadMax] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); 

  // Plan default (auto-asignación al inscribir)
  const [plans, setPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [planPickerVisible, setPlanPickerVisible] = useState(false);
  const [planDefaultId, setPlanDefaultId] = useState(null);
  const [categorySexo, setCategorySexo] = useState('ambos');

  const SEXO_OPTS = [
    { value: 'ambos', label: 'Ambos' },
    { value: 'M', label: 'Varones' },
    { value: 'F', label: 'Mujeres' },
  ];

  // ESTADO PARA LA ALERTA
  const [alertConfig, setAlertConfig] = useState({
    visible: false, title: '', message: '', showCancel: false, isDanger: false,
    onConfirm: () => {}, onCancel: () => {}, confirmText: 'Aceptar', cancelText: 'Cancelar'
  });

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true, title, message,
      showCancel: options.showCancel || false,
      isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: closeAlert
    });
  };

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const fetchCategorias = useCallback(async () => {
    const response = await clubApi.get(`/categories/disciplina/${disciplina._id}`, { headers: await getHeaders() });
    return { list: sortByNombre(response.data) };
  }, [disciplina._id, clubData?.urlIdentifier]);

  const applyCategorias = useCallback((data) => {
    setCategories(data.list ?? []);
  }, []);

  const { loading: isLoading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: categoriesCacheKey,
    enabled: !!categoriesCacheKey,
    fetchData: fetchCategorias,
    onFetched: applyCategorias,
    onFetchError: (error) => {
      console.log('Error cargando categorías:', error.message);
    },
  });

  const showInitialLoader = isLoading && categories.length === 0;

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      'Authorization': `Bearer ${token}`,
    };
  };

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

  // ==========================================
  // API: CREAR O EDITAR CATEGORÍA (Actualizado a tus rutas)
  // ==========================================
  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      showAlert('Atención', 'El nombre de la categoría no puede estar vacío.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingCategory) {
        // MODO EDICIÓN: PUT /categories/:id
        const response = await clubApi.put(`/categories/${editingCategory._id}`, 
          { 
            nombre: categoryName.trim(),
            edadMinima: edadMin ? parseInt(edadMin) : undefined,
            edadMaxima: edadMax ? parseInt(edadMax) : undefined,
            planDefault: planDefaultId,
            sexo: categorySexo,
          },
          { headers: await getHeaders() }
        );
        const updatedList = categories.map(c => 
          c._id === editingCategory._id ? { ...c, ...response.data } : c
        );
        setCategories(sortByNombre(updatedList));
      } else {
        // MODO CREACIÓN: POST /categories
        const response = await clubApi.post(`/categories`, 
          { 
            nombre: categoryName.trim(),
            disciplina: disciplina._id,
            edadMinima: edadMin ? parseInt(edadMin) : undefined,
            edadMaxima: edadMax ? parseInt(edadMax) : undefined,
            planDefault: planDefaultId,
            sexo: categorySexo,
          },
          { headers: await getHeaders() }
        );
        
        // Extraemos la data de la misma forma blindada que hicimos en disciplinas
        const newCategory = response.data.categoria || response.data;
        if (!newCategory || !newCategory._id) throw new Error("Falta el _id de la categoría");

        setCategories(sortByNombre([...categories, newCategory]));
      }
      closeModal();
    } catch (error) {
      console.log("Error guardando categoría:", error.response?.data);
      showAlert('Error', error.response?.data?.message || 'Hubo un problema al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // API: ELIMINAR CATEGORÍA (Actualizado a tu ruta)
  // ==========================================
  const handleDelete = (item) => {
    showAlert(
      "Eliminar Categoría",
      `¿Estás seguro de que querés eliminar "${item.nombre}"?`,
      {
        showCancel: true,
        isDanger: true,
        confirmText: "Eliminar",
        onConfirm: async () => {
          closeAlert();
          try {
            // DELETE /categories/:id
            await clubApi.delete(`/categories/${item._id}`, { headers: await getHeaders() });
            setCategories(prev => prev.filter(c => c._id !== item._id));
          } catch (error) {
            showAlert('Error', 'No se pudo eliminar la categoría.');
          }
        }
      }
    );
  };

  // ==========================================
  // MÉTODOS DE UI Y RENDER
  // ==========================================
  const openEditModal = (item) => {
    setEditingCategory(item);
    setCategoryName(item.nombre);
    setEdadMin(item.edadMinima ? item.edadMinima.toString() : '');
    setEdadMax(item.edadMaxima ? item.edadMaxima.toString() : '');
    setPlanDefaultId(item.planDefault?._id || null);
    setCategorySexo(item.sexo === 'M' || item.sexo === 'F' ? item.sexo : 'ambos');
    setIsModalVisible(true);
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryName('');
    setEdadMin('');
    setEdadMax('');
    setPlanDefaultId(null);
    setCategorySexo('ambos');
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setEditingCategory(null);
    setCategoryName('');
    setEdadMin('');
    setEdadMax('');
    setCategorySexo('ambos');
    setPlanPickerVisible(false);
  };

  const renderRightActions = (item) => (
    <View style={styles.swipeActionsContainer}>
      <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#f59e0b' }]} onPress={() => openEditModal(item)}>
        <Ionicons name="pencil" size={22} color="#ffffff" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#ef4444' }]} onPress={() => handleDelete(item)}>
        <Ionicons name="trash" size={22} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
      {/* NAVEGACIÓN A DETALLE DE CATEGORIA */}
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: theme.surface }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('DetalleCategoria', { categoria: item })}
      >
        <View style={styles.cardContent}>
          <View style={[styles.iconBox, { backgroundColor: colorMarca + '20' }]}>
            <Ionicons name="people" size={24} color={colorMarca} />
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{item.nombre}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>
              Plan auto: {item.planDefault?.nombre || 'Sin plan'}
              {item.planDefault?.monto ? ` • $${Number(item.planDefault.monto).toLocaleString('es-AR')}` : ''}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
              {item.sexo === 'M' ? 'Solo varones' : item.sexo === 'F' ? 'Solo mujeres' : 'Varones y mujeres'}
              {(item.edadMinima || item.edadMaxima) ? ' · ' : ''}
              {item.edadMinima ? `Desde ${item.edadMinima} años` : ''}
              {item.edadMinima && item.edadMaxima ? ' - ' : ''}
              {item.edadMaxima ? `Hasta ${item.edadMaxima} años` : ''}
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
        kicker="Disciplina"
        title="Categorías"
        subtitle={disciplina.nombre}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.body}>
        {showInitialLoader ? (
          <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={60} color={theme.icon} />
                <Text style={[styles.emptyText, { color: theme.text }]}>No hay categorías en {disciplina.nombre}.</Text>
                <Text style={[styles.emptySubText, { color: theme.textMuted }]}>Tocá el botón "+" para agregar divisiones.</Text>
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
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {editingCategory ? "Editar Categoría" : "Nueva Categoría"}
                </Text>
                <TouchableOpacity onPress={closeModal}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalLabel, { color: theme.textMuted }]}>
                Nombre (Ej: Primera, U-15, Reserva)
              </Text>
              
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Ingresá el nombre"
                placeholderTextColor={theme.textMuted}
                value={categoryName}
                onChangeText={setCategoryName}
                autoFocus={true} 
              />

              <View style={{ flexDirection: 'row', gap: 15, marginBottom: 25 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Edad Mín.</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginBottom: 0 }]}
                    placeholder="Ej: 8"
                    placeholderTextColor={theme.textMuted}
                    value={edadMin}
                    onChangeText={setEdadMin}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Edad Máx.</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginBottom: 0 }]}
                    placeholder="Ej: 11"
                    placeholderTextColor={theme.textMuted}
                    value={edadMax}
                    onChangeText={setEdadMax}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Sexo del plantel</Text>
              <View style={styles.sexoRow}>
                {SEXO_OPTS.map((opt) => {
                  const on = categorySexo === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.sexoChip,
                        {
                          borderColor: on ? colorMarca : theme.border,
                          backgroundColor: on ? colorMarca + '15' : theme.background,
                        },
                      ]}
                      onPress={() => setCategorySexo(opt.value)}
                    >
                      <Text style={{ color: theme.text, fontWeight: on ? '700' : '500' }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Plan por defecto (auto al inscribir)</Text>
              <TouchableOpacity
                style={[styles.planSelect, { backgroundColor: theme.background, borderColor: theme.border }]}
                onPress={async () => {
                  // En Android, abrir 2 modales a la vez puede no renderizar bien.
                  // Primero cargamos planes (si hace falta) y luego abrimos el selector.
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

              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colorMarca }]}
                onPress={handleSaveCategory}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.modalButtonText}>
                    {editingCategory ? "Guardar Cambios" : "Crear Categoría"}
                  </Text>
                )}
              </TouchableOpacity>

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={planPickerVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Elegir Plan</Text>
              <TouchableOpacity onPress={() => setPlanPickerVisible(false)}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

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
                        {p._id ? <Text style={{ color: theme.textMuted, marginTop: 2 }}>${Number(p.monto || 0).toLocaleString('es-AR')}</Text> : null}
                      </View>
                      {isSel ? <Ionicons name="checkmark-circle" size={22} color={colorMarca} /> : <Ionicons name="ellipse-outline" size={22} color={theme.icon} />}
                    </TouchableOpacity>
                  );
                }}
                style={{ marginTop: 10, maxHeight: 360 }}
              />
            )}
          </View>
        </View>
      </Modal>

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
  body: { flex: 1, paddingHorizontal: 20 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderRadius: 5, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { padding: 10, borderRadius: 10, marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  swipeActionsContainer: { flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 5 },
  swipeBtn: { width: 70, justifyContent: 'center', alignItems: 'center', height: '100%' },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 15, textAlign: 'center' },
  emptySubText: { fontSize: 14, marginTop: 5, textAlign: 'center' },
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
  modalButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  sexoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  sexoChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
});