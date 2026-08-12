// src/screens/admin/DetalleCategoriaScreen.js
import React, { useState, useContext, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
  Switch,
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
import { sortEnrollmentsByAtleta, sortUsersByName } from '../../utils/listSort';
import UserDetailsModal from '../../components/UserDetailsModal';
import UserAvatar from '../../components/UserAvatar';
import CategoryRosterModal from '../../components/CategoryRosterModal';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function DetalleCategoriaScreen({ navigation, route }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext); 
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  
  const { categoria } = route.params;
  const plantelCacheKey =
    clubData?.urlIdentifier && categoria?._id
      ? `admin-detalle-categoria:${clubData.urlIdentifier}:${categoria._id}`
      : '';

  const [activeTab, setActiveTab] = useState('atletas'); // 'atletas' | 'profesores' | 'preparadores' | 'nutricionistas' | 'psicologos'

  const [enrollments, setEnrollments] = useState(() => readScreenCache(plantelCacheKey)?.enrollments ?? []);
  const [profesores, setProfesores] = useState(categoria.profesores || []);
  const [preparadoresFisicos, setPreparadoresFisicos] = useState(categoria.preparadoresFisicos || []);
  const [nutricionistas, setNutricionistas] = useState(categoria.nutricionistas || []);
  const [psicologos, setPsicologos] = useState(categoria.psicologos || []);

  // Plan assignment (financials)
  const [plans, setPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  // Selector Modal
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);

  const [plantelModalOpen, setPlantelModalOpen] = useState(false);
  const [plantelEdicionEstado, setPlantelEdicionEstado] = useState(
    () => readScreenCache(plantelCacheKey)?.plantelEdicionEstado ?? null,
  );
  const [totalInscriptosPlantel, setTotalInscriptosPlantel] = useState(
    () => readScreenCache(plantelCacheKey)?.totalInscriptosPlantel ?? 0,
  );
  const [chatAtletaProfesionalEnabled, setChatAtletaProfesionalEnabled] = useState(
    Boolean(categoria?.chatAtletaProfesionalEnabled),
  );
  const [chatGrupalCategoriaEnabled, setChatGrupalCategoriaEnabled] = useState(
    Boolean(categoria?.chatGrupalCategoriaEnabled),
  );
  const [chatToggleSaving, setChatToggleSaving] = useState(false);
  const [chatGrupalToggleSaving, setChatGrupalToggleSaving] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false, title: '', message: '', showCancel: false, isDanger: false,
    onConfirm: () => {}, onCancel: () => {}
  });

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true, title, message,
      showCancel: options.showCancel || false, isDanger: options.isDanger || false,
      confirmText: options.confirmText || 'Aceptar', cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert, onCancel: closeAlert
    });
  };
  const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchPlantelData = useCallback(async () => {
    const h = await getHeaders();
    const [enrRes, plantelRes] = await Promise.all([
      clubApi.get(`/enrollments/categoria/${categoria._id}`, { headers: h }),
      clubApi.get(`/categories/${categoria._id}/plantel?metaOnly=true`, { headers: h }).catch(() => ({ data: {} })),
    ]);
    return {
      enrollments: sortEnrollmentsByAtleta(enrRes.data),
      plantelEdicionEstado: plantelRes.data?.plantelEdicion?.estado || null,
      totalInscriptosPlantel: plantelRes.data?.totalInscriptos ?? 0,
    };
  }, [categoria._id, clubData?.urlIdentifier]);

  const applyPlantelData = useCallback((data) => {
    setEnrollments(data.enrollments ?? []);
    setPlantelEdicionEstado(data.plantelEdicionEstado ?? null);
    setTotalInscriptosPlantel(data.totalInscriptosPlantel ?? 0);
  }, []);

  const { loading: isLoading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: plantelCacheKey,
    enabled: !!plantelCacheKey && activeTab === 'atletas',
    fetchData: fetchPlantelData,
    onFetched: applyPlantelData,
  });

  const showInitialLoader = isLoading && activeTab === 'atletas' && enrollments.length === 0;

  const fetchPlantelMeta = async () => {
    try {
      const { data } = await clubApi.get(`/categories/${categoria._id}/plantel?metaOnly=true`, {
        headers: await getHeaders(),
      });
      setPlantelEdicionEstado(data.plantelEdicion?.estado || null);
      setTotalInscriptosPlantel(data.totalInscriptos ?? 0);
    } catch {
      setPlantelEdicionEstado(null);
      setTotalInscriptosPlantel(0);
    }
  };

  const onPlantelSaved = (data, errorMsg) => {
    if (errorMsg) {
      showAlert('Error', errorMsg);
      return;
    }
    showAlert('Listo', data?.message || 'Plantel actualizado.');
    fetchPlantelMeta();
    if (activeTab === 'atletas') {
      reload({ background: true });
    }
  };

  const toggleChatAtletaProfesional = async (value) => {
    if (!clubData?.urlIdentifier || chatToggleSaving) return;
    const prev = chatAtletaProfesionalEnabled;
    setChatAtletaProfesionalEnabled(value);
    setChatToggleSaving(true);
    try {
      const { data } = await clubApi.put(
        `/categories/${categoria._id}`,
        { chatAtletaProfesionalEnabled: value },
        { headers: await getHeaders() },
      );
      const enabled = Boolean(data?.chatAtletaProfesionalEnabled);
      setChatAtletaProfesionalEnabled(enabled);
      navigation.setParams({
        categoria: { ...categoria, chatAtletaProfesionalEnabled: enabled },
      });
    } catch (e) {
      setChatAtletaProfesionalEnabled(prev);
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el ajuste de chat.');
    } finally {
      setChatToggleSaving(false);
    }
  };

  const toggleChatGrupalCategoria = async (value) => {
    if (!clubData?.urlIdentifier || chatGrupalToggleSaving) return;
    const prev = chatGrupalCategoriaEnabled;
    setChatGrupalCategoriaEnabled(value);
    setChatGrupalToggleSaving(true);
    try {
      const { data } = await clubApi.put(
        `/categories/${categoria._id}`,
        { chatGrupalCategoriaEnabled: value },
        { headers: await getHeaders() },
      );
      const enabled = Boolean(data?.chatGrupalCategoriaEnabled);
      setChatGrupalCategoriaEnabled(enabled);
      navigation.setParams({
        categoria: {
          ...categoria,
          chatAtletaProfesionalEnabled,
          chatGrupalCategoriaEnabled: enabled,
        },
      });
    } catch (e) {
      setChatGrupalCategoriaEnabled(prev);
      showAlert('Error', e.response?.data?.message || 'No se pudo guardar el chat grupal.');
    } finally {
      setChatGrupalToggleSaving(false);
    }
  };

  const headerPlantelBtn = (
    <TouchableOpacity
      style={styles.headerPlantelBtn}
      onPress={() => setPlantelModalOpen(true)}
      accessibilityRole="button"
      accessibilityLabel="Actualizar plantel"
    >
      <Ionicons name="people-outline" size={16} color="#fff" />
      <Text style={styles.headerPlantelBtnTxt}>Actualizar plantel</Text>
    </TouchableOpacity>
  );

  const fetchPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const response = await clubApi.get('/financial/plans', { headers: await getHeaders() });
      setPlans(response.data);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar los planes.');
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const openPlanModal = async (enrollment) => {
    setSelectedEnrollment(enrollment);
    setSelectedPlanId(enrollment?.plan?._id || null);
    setPlanModalVisible(true);
    if (plans.length === 0) {
      await fetchPlans();
    }
  };

  const saveEnrollmentPlan = async () => {
    if (!selectedEnrollment) return;
    try {
      const response = await clubApi.patch(
        `/enrollments/${selectedEnrollment._id}/financials`,
        { planId: selectedPlanId },
        { headers: await getHeaders() }
      );

      // Update local list
      setEnrollments((prev) =>
        prev.map((e) => (e._id === selectedEnrollment._id ? { ...e, plan: response.data.plan || null } : e))
      );

      setPlanModalVisible(false);
      showAlert('Éxito', selectedPlanId ? 'Plan asignado a la inscripción.' : 'Plan quitado de la inscripción.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo asignar el plan.');
    }
  };

  // ===============================
  // BUSCADOR PARA AÑADIR
  // ===============================
  useEffect(() => {
    if (isPickerVisible) {
      const handler = setTimeout(() => { searchUsers(); }, 500);
      return () => clearTimeout(handler);
    }
  }, [searchQuery, isPickerVisible]);

  const searchUsers = async () => {
    setIsSearching(true);
    try {
      const rolDeseado =
        activeTab === 'atletas'
          ? 'atleta'
          : activeTab === 'profesores'
            ? 'profe'
            : activeTab === 'preparadores'
              ? 'preparador_fisico'
              : activeTab === 'nutricionistas'
                ? 'nutricionista'
                : 'psicologo';
      // Si la búsqueda está vacía, solo trae los últimos 20 de ese rol
      const response = await clubApi.get('/users', {
        headers: await getHeaders(),
        params: { rol: rolDeseado, search: searchQuery, limit: 20 }
      });

      // Filtrar los que YA están adentro
      let filtered = response.data.users;
      if (activeTab === 'atletas') {
        const inscriptosIds = enrollments.map(e => e.atleta._id);
        filtered = filtered.filter(u => !inscriptosIds.includes(u._id));
      } else if (activeTab === 'profesores') {
        const staffIds = profesores.map(p => p._id);
        filtered = filtered.filter(u => !staffIds.includes(u._id));
      } else if (activeTab === 'preparadores') {
        const prepIds = preparadoresFisicos.map((p) => p._id);
        filtered = filtered.filter((u) => !prepIds.includes(u._id));
      } else if (activeTab === 'nutricionistas') {
        const nIds = nutricionistas.map((p) => p._id);
        filtered = filtered.filter((u) => !nIds.includes(u._id));
      } else {
        const pIds = psicologos.map((p) => p._id);
        filtered = filtered.filter((u) => !pIds.includes(u._id));
      }

      setAvailableUsers(sortUsersByName(filtered));
    } catch (e) {
      console.log(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectUser = async (user) => {
    setIsPickerVisible(false);
    try {
      if (activeTab === 'atletas') {
        // Inscribir Atleta POST /api/enrollments
        const response = await clubApi.post('/enrollments', {
          atletaId: user._id,
          categoriaId: categoria._id,
          aptoMedico: false
        }, { headers: await getHeaders() });

        // Actualizamos localmente para no hacer refetch
        setEnrollments([...enrollments, { ...response.data, atleta: user }]);
        showAlert('Éxito', `${user.nombre} inscrito correctamente.`);
        
      } else if (activeTab === 'profesores') {
        const nuevosProfes = [...profesores.map(p => p._id), user._id];
        await clubApi.put(`/categories/${categoria._id}`, { profesores: nuevosProfes }, { headers: await getHeaders() });
        setProfesores([...profesores, user]);
        showAlert('Éxito', `${user.nombre} añadido como profesor/a.`);
      } else if (activeTab === 'preparadores') {
        const nuevos = [...preparadoresFisicos.map((p) => p._id), user._id];
        await clubApi.put(
          `/categories/${categoria._id}`,
          { preparadoresFisicos: nuevos },
          { headers: await getHeaders() },
        );
        setPreparadoresFisicos([...preparadoresFisicos, user]);
        showAlert('Éxito', `${user.nombre} añadido/a como preparador/a físico/a.`);
      } else if (activeTab === 'nutricionistas') {
        const nuevos = [...nutricionistas.map((p) => p._id), user._id];
        await clubApi.put(`/categories/${categoria._id}`, { nutricionistas: nuevos }, { headers: await getHeaders() });
        setNutricionistas([...nutricionistas, user]);
        showAlert('Éxito', `${user.nombre} añadido/a como nutricionista.`);
      } else {
        const nuevos = [...psicologos.map((p) => p._id), user._id];
        await clubApi.put(`/categories/${categoria._id}`, { psicologos: nuevos }, { headers: await getHeaders() });
        setPsicologos([...psicologos, user]);
        showAlert('Éxito', `${user.nombre} añadido/a como psicólogo/a.`);
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudo vincular.');
    }
  };

  const handleRemove = (item) => {
    const nombre = activeTab === 'atletas' ? item.atleta.nombre : item.nombre;
    
    showAlert(
      "Desvincular",
      `¿Estás seguro de desvincular a ${nombre}?`,
      {
        showCancel: true, isDanger: true, confirmText: "Desvincular",
        onConfirm: async () => {
          closeAlert();
          try {
            if (activeTab === 'atletas') {
              // Dar de baja la suscripción.
              await clubApi.delete(`/enrollments/${item._id}`, { headers: await getHeaders() });
              setEnrollments(enrollments.filter(e => e._id !== item._id));
            } else if (activeTab === 'profesores') {
              const nuevosProfes = profesores.filter((p) => p._id !== item._id).map((p) => p._id);
              await clubApi.put(`/categories/${categoria._id}`, { profesores: nuevosProfes }, { headers: await getHeaders() });
              setProfesores(profesores.filter((p) => p._id !== item._id));
            } else if (activeTab === 'preparadores') {
              const nuevos = preparadoresFisicos.filter((p) => p._id !== item._id).map((p) => p._id);
              await clubApi.put(
                `/categories/${categoria._id}`,
                { preparadoresFisicos: nuevos },
                { headers: await getHeaders() },
              );
              setPreparadoresFisicos(preparadoresFisicos.filter((p) => p._id !== item._id));
            } else if (activeTab === 'nutricionistas') {
              const nuevos = nutricionistas.filter((p) => p._id !== item._id).map((p) => p._id);
              await clubApi.put(`/categories/${categoria._id}`, { nutricionistas: nuevos }, { headers: await getHeaders() });
              setNutricionistas(nutricionistas.filter((p) => p._id !== item._id));
            } else {
              const nuevos = psicologos.filter((p) => p._id !== item._id).map((p) => p._id);
              await clubApi.put(`/categories/${categoria._id}`, { psicologos: nuevos }, { headers: await getHeaders() });
              setPsicologos(psicologos.filter((p) => p._id !== item._id));
            }
          } catch (e) {
            showAlert('Error', 'No se pudo desvincular.');
          }
        }
      }
    );
  };

  const renderRightActions = (item) => (
    <View style={styles.swipeActionsContainer}>
      <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#ef4444' }]} onPress={() => handleRemove(item)}>
        <Ionicons name="close-circle" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  const handleUserClick = (user) => {
    setSelectedUser(user);
    setIsDetailsModalVisible(true);
  };

  const renderListItem = ({ item }) => {
    const user = activeTab === 'atletas' ? item.atleta : item;
    const planName = activeTab === 'atletas' ? (item.plan?.nombre || 'Sin plan') : null;

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        <TouchableOpacity style={[styles.card, { backgroundColor: theme.surface }]} onPress={() => handleUserClick(user)}>
          <UserAvatar user={user} size={44} colorMarca={colorMarca} style={{ marginRight: 15 }} />
          <View style={styles.info}>
            <Text style={[styles.name, { color: theme.text }]}>{user.nombre} {user.apellido}</Text>
            {(activeTab === 'profesores' ||
              activeTab === 'preparadores' ||
              activeTab === 'nutricionistas' ||
              activeTab === 'psicologos') && (
               <Text style={[styles.sub, { color: theme.textMuted }]}>
                  {user.email}
               </Text>
            )}
            {activeTab === 'atletas' && (
              <>
                <View style={[styles.badge, { backgroundColor: item.estado === 'activo' ? '#10b98120' : '#ef444420' }]}>
                  <Text style={{ color: item.estado === 'activo' ? '#10b981' : '#ef4444', fontSize: 12, fontWeight: 'bold' }}>
                    {item.estado === 'activo' ? 'Inscrito' : 'Inactivo'}
                  </Text>
                </View>
                <View style={[styles.planRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.planText, { color: theme.textMuted }]} numberOfLines={1}>
                    Plan: {planName}
                  </Text>
                  <TouchableOpacity style={[styles.planBtn, { borderColor: colorMarca }]} onPress={() => openPlanModal(item)}>
                    <Ionicons name="cash-outline" size={16} color={colorMarca} />
                    <Text style={[styles.planBtnText, { color: colorMarca }]}>Asignar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const listData =
    activeTab === 'atletas'
      ? sortEnrollmentsByAtleta(enrollments)
      : sortUsersByName(
          activeTab === 'profesores'
            ? profesores
            : activeTab === 'preparadores'
              ? preparadoresFisicos
              : activeTab === 'nutricionistas'
                ? nutricionistas
                : psicologos,
        );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Categoría"
        title={`Plantel: ${categoria.nombre}`}
        subtitle={
          plantelEdicionEstado === 'delegado_coach'
            ? 'Plantel pendiente del profesor'
            : categoria.edadMinima != null && categoria.edadMaxima != null
              ? `${totalInscriptosPlantel} atleta(s) · ${categoria.edadMinima}–${categoria.edadMaxima} años`
              : `${totalInscriptosPlantel} atleta(s) · Sin límite de edad`
        }
        onBack={() => navigation.goBack()}
        bottomRightAccessory={headerPlantelBtn}
      />

      <View style={[styles.chatPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.chatPanelHeader}
          onPress={() => setChatPanelOpen((o) => !o)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: chatPanelOpen }}
          accessibilityLabel="Opciones de chat"
        >
          <Text style={[styles.chatPanelTitle, { color: theme.text }]}>Chat</Text>
          <View style={styles.chatDots}>
            <View
              style={[
                styles.chatDot,
                { backgroundColor: chatAtletaProfesionalEnabled ? '#22c55e' : '#ef4444' },
              ]}
              accessibilityLabel={
                chatAtletaProfesionalEnabled
                  ? 'Chat atleta profesionales activo'
                  : 'Chat atleta profesionales inactivo'
              }
            />
            <View
              style={[
                styles.chatDot,
                { backgroundColor: chatGrupalCategoriaEnabled ? '#22c55e' : '#ef4444' },
              ]}
              accessibilityLabel={
                chatGrupalCategoriaEnabled ? 'Chat grupal activo' : 'Chat grupal inactivo'
              }
            />
          </View>
          <Ionicons
            name={chatPanelOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.textMuted}
          />
        </TouchableOpacity>
        {chatPanelOpen ? (
          <>
            <View style={[styles.chatRowDivider, { backgroundColor: theme.border }]} />
            <View style={styles.chatRow}>
              <Text style={[styles.chatRowTitle, { color: theme.text }]} numberOfLines={1}>
                Atleta ↔ profesionales
              </Text>
              <Switch
                value={chatAtletaProfesionalEnabled}
                onValueChange={toggleChatAtletaProfesional}
                disabled={chatToggleSaving}
                trackColor={{ false: theme.border, true: colorMarca + '99' }}
                thumbColor={chatAtletaProfesionalEnabled ? colorMarca : '#f4f3f4'}
              />
            </View>
            <View style={[styles.chatRowDivider, { backgroundColor: theme.border }]} />
            <View style={styles.chatRow}>
              <Text style={[styles.chatRowTitle, { color: theme.text }]} numberOfLines={1}>
                Grupal de la categoría
              </Text>
              <Switch
                value={chatGrupalCategoriaEnabled}
                onValueChange={toggleChatGrupalCategoria}
                disabled={chatGrupalToggleSaving}
                trackColor={{ false: theme.border, true: colorMarca + '99' }}
                thumbColor={chatGrupalCategoriaEnabled ? colorMarca : '#f4f3f4'}
              />
            </View>
          </>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsScroll, { borderBottomColor: theme.border }]}
        contentContainerStyle={styles.tabsRow}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'atletas' && { borderBottomColor: colorMarca }]}
          onPress={() => setActiveTab('atletas')}
        >
          <Text style={[styles.tabText, activeTab === 'atletas' ? { color: colorMarca, fontWeight: 'bold' } : { color: theme.textMuted }]}>
            Atletas ({enrollments.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profesores' && { borderBottomColor: colorMarca }]}
          onPress={() => setActiveTab('profesores')}
        >
          <Text
            style={[styles.tabText, activeTab === 'profesores' ? { color: colorMarca, fontWeight: 'bold' } : { color: theme.textMuted }]}
          >
            Profesores ({profesores.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'preparadores' && { borderBottomColor: colorMarca }]}
          onPress={() => setActiveTab('preparadores')}
        >
          <Text
            style={[styles.tabText, activeTab === 'preparadores' ? { color: colorMarca, fontWeight: 'bold' } : { color: theme.textMuted }]}
          >
            Prep. físico ({preparadoresFisicos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'nutricionistas' && { borderBottomColor: colorMarca }]}
          onPress={() => setActiveTab('nutricionistas')}
        >
          <Text
            style={[styles.tabText, activeTab === 'nutricionistas' ? { color: colorMarca, fontWeight: 'bold' } : { color: theme.textMuted }]}
          >
            Nutrición ({nutricionistas.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'psicologos' && { borderBottomColor: colorMarca }]}
          onPress={() => setActiveTab('psicologos')}
        >
          <Text
            style={[styles.tabText, activeTab === 'psicologos' ? { color: colorMarca, fontWeight: 'bold' } : { color: theme.textMuted }]}
          >
            Psicología ({psicologos.length})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.body}>
        {showInitialLoader ? (
          <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
             data={listData}
             keyExtractor={(item) => item._id}
             renderItem={renderListItem}
             contentContainerStyle={{ paddingBottom: 80, paddingTop: 10 }}
             refreshControl={
               activeTab === 'atletas' ? (
                 <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
               ) : undefined
             }
             ListEmptyComponent={
               <View style={styles.emptyState}>
                 <Ionicons name="folder-open-outline" size={60} color={theme.icon} />
                 <Text style={[styles.emptyText, { color: theme.text }]}>Lista vacía</Text>
                 <Text style={[styles.emptySubText, { color: theme.textMuted }]}>
                   Aún no hay{' '}
                   {activeTab === 'atletas'
                     ? 'atletas'
                     : activeTab === 'profesores'
                       ? 'profesores'
                       : activeTab === 'preparadores'
                         ? 'preparadores físicos'
                         : activeTab === 'nutricionistas'
                           ? 'nutricionistas'
                           : 'psicólogos'}{' '}
                   asignados.
                 </Text>
               </View>
             }
          />
        )}
      </View>

      <TouchableOpacity style={[styles.fab, { backgroundColor: colorMarca }]} onPress={() => { setSearchQuery(''); setAvailableUsers([]); setIsPickerVisible(true); }}>
        <Ionicons name="add" size={30} color="#ffffff" />
      </TouchableOpacity>

      {/* Modal Buscador para Añadir */}
      <Modal visible={isPickerVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
           <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                 <Text style={[styles.modalTitle, { color: theme.text }]}>
                   Añadir{' '}
                   {activeTab === 'atletas'
                     ? 'Atleta'
                     : activeTab === 'profesores'
                       ? 'Profesor/a'
                       : activeTab === 'preparadores'
                         ? 'Preparador/a físico/a'
                         : activeTab === 'nutricionistas'
                           ? 'Nutricionista'
                           : 'Psicólogo/a'}
                 </Text>
                 <TouchableOpacity onPress={() => setIsPickerVisible(false)}>
                    <Ionicons name="close" size={28} color={theme.icon} />
                 </TouchableOpacity>
              </View>
              
              <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                 <Ionicons name="search" size={20} color={theme.icon} style={{ marginLeft: 15, marginRight: 10 }} />
                 <TextInput style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Buscar por nombre o apellido..."
                    placeholderTextColor={theme.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                 />
                 {isSearching && <ActivityIndicator color={colorMarca} style={{ marginRight: 15 }} />}
              </View>

              <FlatList
                 data={availableUsers}
                 keyExtractor={item => item._id}
                 renderItem={({ item }) => (
                    <TouchableOpacity style={[styles.pickerItem, { borderBottomColor: theme.border }]} onPress={() => handleSelectUser(item)}>
                       <Text style={{ color: theme.text, fontSize: 16, fontWeight: '500' }}>{item.nombre} {item.apellido}</Text>
                       <Text style={{ color: theme.textMuted, fontSize: 13 }}>{item.email}</Text>
                    </TouchableOpacity>
                 )}
                 style={{ marginTop: 15, maxHeight: 300 }}
                 ListEmptyComponent={
                   <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>
                     {!isSearching && searchQuery ? "No se encontraron usuarios disponibles." : "Escribe para buscar..."}
                   </Text>
                 }
              />
           </View>
        </View>
      </Modal>

      {/* Modal Asignar Plan a Inscripción */}
      <Modal visible={planModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Asignar Plan</Text>
              <TouchableOpacity onPress={() => setPlanModalVisible(false)}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            {selectedEnrollment ? (
              <View style={[styles.planContext, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>
                  {selectedEnrollment.atleta?.nombre} {selectedEnrollment.atleta?.apellido}
                </Text>
                <Text style={{ color: theme.textMuted, marginTop: 4 }}>
                  {categoria.nombre}
                </Text>
              </View>
            ) : null}

            {isLoadingPlans ? (
              <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={[{ _id: null, nombre: 'Sin plan', monto: 0 }, ...plans.filter((p) => p.activo !== false)]}
                keyExtractor={(p, idx) => (p._id ? p._id : `none-${idx}`)}
                renderItem={({ item: p }) => {
                  const isSel = (p._id || null) === (selectedPlanId || null);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.planPickItem,
                        { borderBottomColor: theme.border, backgroundColor: isSel ? colorMarca + '12' : 'transparent' },
                      ]}
                      onPress={() => setSelectedPlanId(p._id || null)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{p.nombre}</Text>
                        {p._id ? <Text style={{ color: theme.textMuted, marginTop: 2 }}>${Number(p.monto || 0).toLocaleString('es-AR')}</Text> : null}
                      </View>
                      {isSel ? <Ionicons name="checkmark-circle" size={22} color={colorMarca} /> : <Ionicons name="ellipse-outline" size={22} color={theme.icon} />}
                    </TouchableOpacity>
                  );
                }}
                style={{ marginTop: 10, maxHeight: 320 }}
                ListEmptyComponent={
                  <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>
                    No hay planes disponibles.
                  </Text>
                }
              />
            )}

            <TouchableOpacity style={[styles.savePlanBtn, { backgroundColor: colorMarca }]} onPress={saveEnrollmentPlan}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CustomAlert 
        visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message}
        showCancel={alertConfig.showCancel} isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm}
        cancelText={alertConfig.cancelText} onCancel={alertConfig.onCancel}
      />

      <CategoryRosterModal
        visible={plantelModalOpen}
        onClose={() => setPlantelModalOpen(false)}
        categoryId={categoria._id}
        getHeaders={getHeaders}
        theme={theme}
        colorMarca={colorMarca}
        canDelegateToCoach={profesores.length > 0}
        coachOnly={false}
        onSaved={onPlantelSaved}
      />

      <UserDetailsModal 
        visible={isDetailsModalVisible} 
        user={selectedUser} 
        onClose={() => setIsDetailsModalVisible(false)}
        onEdit={() => showAlert('Aviso', 'Por favor, ve a la sección de Usuarios para editar perfiles.')}
        onDelete={() => showAlert('Aviso', 'Por favor, ve a la sección de Usuarios para eliminar perfiles.')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabsScroll: { maxHeight: 52, borderBottomWidth: 1 },
  tabsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {},
  tabText: { fontSize: 12 },
  body: { flex: 1, paddingHorizontal: 20 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 5, marginBottom: 12, elevation: 1 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 5 },
  swipeActionsContainer: { flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 5 },
  swipeBtn: { width: 70, justifyContent: 'center', alignItems: 'center', height: '100%' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubText: { fontSize: 14, marginTop: 5, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 5, borderTopRightRadius: 5, padding: 25, paddingBottom: 40, height: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 1, borderRadius: 5   },
  searchInput: { flex: 1, fontSize: 16, height: '100%' },
  pickerItem: { paddingVertical: 15, borderBottomWidth: 1 }
  ,
  planRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planText: { fontSize: 12, flex: 1, paddingRight: 10 },
  planBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 5, borderWidth: 1 },
  planBtnText: { fontSize: 12, fontWeight: 'bold' },
  planContext: { padding: 12, borderRadius: 5, borderWidth: 1, marginBottom: 10 },
  planPickItem: { paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  savePlanBtn: { height: 52, borderRadius: 5, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  headerPlantelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  headerPlantelBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  chatPanel: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chatPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
  },
  chatPanelTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  chatDots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chatDot: { width: 8, height: 8, borderRadius: 4 },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
    paddingVertical: 2,
  },
  chatRowTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  chatRowDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
