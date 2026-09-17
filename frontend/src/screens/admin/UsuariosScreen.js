// src/screens/admin/UsuariosScreen.js
import React, { useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, StatusBar, TextInput, Alert, RefreshControl
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
import DesignCard from '../../components/DesignCard';
import UserFormModal from '../../components/UserFormModal';
import UserDetailsModal from '../../components/UserDetailsModal';
import UserAvatar from '../../components/UserAvatar';
import SearchableDropdown from '../../components/SearchableDropdown';
import { USER_ROL_LABELS, USER_ROLE_FILTROS } from '../../constants/userRoles';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { sortUsersByName } from '../../utils/listSort';

export default function UsuariosScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext); 
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('Todos');

  const usersCacheKey = clubData?.urlIdentifier
    ? `admin-usuarios:${clubData.urlIdentifier}:${selectedRole}:${debouncedSearch}`
    : '';

  const cachedUsers = readScreenCache(usersCacheKey);
  const [users, setUsers] = useState(() => cachedUsers?.users ?? []);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewerRol, setViewerRol] = useState('');
  const [convertingTrial, setConvertingTrial] = useState(false);

  useEffect(() => {
    if (!usersCacheKey) return;
    const cached = readScreenCache(usersCacheKey);
    if (cached) {
      setUsers(cached.users ?? []);
      setPage(cached.page ?? 1);
      setTotalPages(cached.totalPages ?? 1);
    } else {
      setUsers([]);
      setPage(1);
      setTotalPages(1);
    }
  }, [usersCacheKey]);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);
  
  const [page, setPage] = useState(() => cachedUsers?.page ?? 1);
  const [totalPages, setTotalPages] = useState(() => cachedUsers?.totalPages ?? 1);

  // Modales
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

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

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  // Debounce para el buscador
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchUsersPage1 = useCallback(async () => {
    const token = await getToken('userToken');
    const response = await clubApi.get('/users', {
      headers: { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` },
      params: {
        page: 1,
        limit: 15,
        ...(debouncedSearch?.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(selectedRole && selectedRole !== 'Todos' ? { rol: selectedRole } : {}),
      },
    });
    const { users: fetchedUsers, totalPages: fetchedTotal, page: fetchedPage } = response.data;
    return { users: fetchedUsers, totalPages: fetchedTotal, page: fetchedPage };
  }, [clubData?.urlIdentifier, debouncedSearch, selectedRole]);

  const applyUsersPage1 = useCallback((data) => {
    setUsers(data.users ?? []);
    setTotalPages(data.totalPages ?? 1);
    setPage(data.page ?? 1);
  }, []);

  const { loading: isLoading, refreshing, onRefresh: refreshUsers } = useCachedFocusLoad({
    cacheKey: usersCacheKey,
    enabled: !!usersCacheKey,
    fetchData: fetchUsersPage1,
    onFetched: applyUsersPage1,
    onFetchError: () => {
      Alert.alert('Error', 'No se pudieron cargar los usuarios.');
    },
  });

  const onRefresh = useCallback(() => {
    refreshUsers();
  }, [refreshUsers]);

  const handleConvertTrial = async () => {
    if (!selectedUser?._id) return;
    setConvertingTrial(true);
    try {
      const headers = await getHeaders();
      await clubApi.post(`/users/atletas/${selectedUser._id}/prueba/continuar`, {}, { headers });
      setIsFormVisible(false);
      showAlert('Listo', 'El atleta quedó como permanente. Se activaron cuotas y planes.');
      onRefresh();
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo convertir el atleta.');
    } finally {
      setConvertingTrial(false);
    }
  };

  const showInitialLoader = isLoading && users.length === 0;
  const isRefreshingUsers = isLoading && users.length > 0;
  const sortedUsers = useMemo(() => sortUsersByName(users), [users]);

  const fetchUsers = async (pageNumber = 1) => {
    if (pageNumber === 1) return;
    setIsFetchingMore(true);

    try {
      const token = await getToken('userToken');
      const response = await clubApi.get('/users', {
        headers: { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` },
        params: {
          page: pageNumber,
          limit: 15,
          ...(debouncedSearch?.trim() ? { search: debouncedSearch.trim() } : {}),
          ...(selectedRole && selectedRole !== 'Todos' ? { rol: selectedRole } : {}),
        }
      });
      
      const { users: fetchedUsers, totalPages: fetchedTotal, page: fetchedPage } = response.data;
      
      if (pageNumber === 1) setUsers(fetchedUsers);
      else setUsers(prev => [...prev, ...fetchedUsers]);
      
      setTotalPages(fetchedTotal);
      setPage(fetchedPage);
      
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar los usuarios.');
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (page < totalPages && !isFetchingMore && !isLoading) {
      fetchUsers(page + 1);
    }
  };

  const openCreateModal = () => {
    setSelectedUser(null);
    setIsFormVisible(true);
  };

  const openEditModal = (user) => {
    if (
      viewerRol === 'administrativo' &&
      (user?.rol === 'admin_club' || (Array.isArray(user?.roles) && user.roles.includes('admin_club')))
    ) {
      showAlert('Sin permiso', 'No podés modificar al administrador del club.');
      return;
    }
    setSelectedUser(user);
    setIsFormVisible(true);
  };

  const openDetailsModal = (user) => {
    setSelectedUser(user);
    setIsDetailsVisible(true);
  };

  const handleSaveUser = async (formData) => {
    setIsSaving(true);
    try {
      const token = await getToken ('userToken');
      const headers = { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` };
      
      if (selectedUser) {
        // Edit
        await clubApi.patch(`/users/${selectedUser._id}`, formData, { headers });
        showAlert('Éxito', 'El usuario fue actualizado.');
      } else {
        // Create
        if (!formData.password) {
           showAlert('Atención', 'La contraseña es obligatoria para nuevos usuarios.');
           setIsSaving(false);
           return;
        }
        const { data } = await clubApi.post('/users', formData, { headers });
        showAlert(
          'Éxito',
          data?.message ||
            (data?.emailGenerado
              ? `Usuario creado. Puede entrar con "${data.loginHint}".`
              : 'El usuario fue creado correctamente.'),
        );
      }
      // Volvemos a traer todos de la DB para que los objetos populados (tutorPrincipal) vengan íntegros
      fetchUsers(1); 
      setIsFormVisible(false);
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Hubo un error al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (item) => {
    const inactive = item.estado === 'inactivo';
    if (inactive) {
      showAlert(
        `Activar a ${item.nombre}`,
        `¿Querés volver a activar a ${item.nombre} ${item.apellido}?`,
        {
          showCancel: true,
          confirmText: 'Activar',
          onConfirm: async () => {
            closeAlert();
            try {
              const headers = await getHeaders();
              await clubApi.patch(`/users/${item._id}`, { estado: 'activo' }, { headers });
              showAlert('Éxito', 'Usuario activado correctamente.');
              onRefresh();
            } catch (error) {
              showAlert('Error', error.response?.data?.message || 'No se pudo activar el usuario.');
            }
          },
        },
      );
      return;
    }

    showAlert(
      `Dar de baja a ${item.nombre}`,
      `¿Querés desactivar a ${item.nombre} ${item.apellido}? Podés volver a activarlo después.`,
      {
        showCancel: true,
        isDanger: true,
        confirmText: 'Desactivar',
        onConfirm: async () => {
          closeAlert();
          try {
            const headers = await getHeaders();

            if (item.rol === 'atleta') {
              const res = await clubApi.patch(`/users/atletas/${item._id}/deactivate`, {}, { headers });
              if (res.data.infoTutor?.requiereAccionPantalla) {
                showAlert('Información', res.data.infoTutor.mensaje);
              } else {
                showAlert('Éxito', 'Atleta dado de baja.');
              }
            } else {
              await clubApi.patch(`/users/${item._id}`, { estado: 'inactivo' }, { headers });
              showAlert('Éxito', 'Usuario desactivado correctamente.');
            }

            onRefresh();
          } catch (error) {
            showAlert('Error', 'Hubo un problema al desactivar el usuario.');
          }
        },
      },
    );
  };

  const renderRightActions = (item) => {
    const inactive = item.estado === 'inactivo';
    return (
      <View style={styles.swipeActionsContainer}>
        <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#f59e0b' }]} onPress={() => openEditModal(item)}>
          <Ionicons name="pencil" size={22} color="#ffffff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeBtn, { backgroundColor: inactive ? '#10b981' : '#ef4444' }]}
          onPress={() => handleDelete(item)}
        >
          <Ionicons name={inactive ? 'checkmark-circle' : 'trash'} size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    let familyTagText = null;
    let familyIcon = null;
    const inactive = item.estado === 'inactivo';

    if (item.tutorPrincipal && item.tutorPrincipal.nombre) {
      familyTagText = `A cargo de: ${item.tutorPrincipal.nombre} ${item.tutorPrincipal.apellido}`;
      familyIcon = 'person';
    } else if (item.familiaresACargo && item.familiaresACargo.length > 0) {
      const nombresFamiliares = item.familiaresACargo.map((f) => f.nombre).join(', ');
      familyTagText = `Tutor de: ${nombresFamiliares}`;
      familyIcon = 'people';
    }

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        <DesignCard
          theme={theme}
          isDarkMode={isDarkMode}
          accent={inactive ? '#9ca3af' : colorMarca}
          muted={inactive}
          onPress={() => openDetailsModal(item)}
          style={{ marginBottom: 12, opacity: inactive ? 0.72 : 1 }}
          contentStyle={styles.cardContent}
        >
          <UserAvatar user={item} size={46} colorMarca={inactive ? '#9ca3af' : colorMarca} style={{ marginRight: 15 }} />

          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: inactive ? theme.textMuted : theme.text }]}>
              {item.nombre} {item.apellido}
            </Text>
            <Text style={[styles.userEmail, { color: theme.textMuted }]}>{item.email}</Text>

            {familyTagText && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons name={familyIcon} size={14} color={inactive ? theme.textMuted : colorMarca} style={{ marginRight: 4 }} />
                <Text
                  style={[styles.familyTag, { color: inactive ? theme.textMuted : colorMarca }]}
                  numberOfLines={1}
                >
                  {familyTagText}
                </Text>
              </View>
            )}
            {inactive ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons name="pause-circle-outline" size={14} color="#ef4444" style={{ marginRight: 4 }} />
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Inactivo</Text>
              </View>
            ) : null}
            {!inactive && item.esPrueba ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons
                  name="hourglass-outline"
                  size={14}
                  color={item.pruebaDecision === 'pendiente' ? '#ef4444' : '#f59e0b'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={{
                    color: item.pruebaDecision === 'pendiente' ? '#ef4444' : '#f59e0b',
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {item.pruebaDecision === 'pendiente' ? 'Prueba vencida' : 'Prueba'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.roleBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.roleBadgeText, { color: theme.textMuted }]} numberOfLines={2}>
              {(Array.isArray(item.roles) && item.roles.length
                ? item.roles
                : [item.rol || item.role]
              )
                .filter(Boolean)
                .map((r) => USER_ROL_LABELS[r] || r)
                .join(' · ') || 'Usuario'}
            </Text>
          </View>
        </DesignCard>
      </Swipeable>
    );
  };

  const renderFooter = () => {
    if (!isFetchingMore) return null;
    return <ActivityIndicator size="small" color={colorMarca} style={{ padding: 20 }} />;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Gestión"
        title="Usuarios y familias"
        subtitle={clubData?.nombre || 'Staff, atletas y tutores'}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={20} color={theme.icon} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar por nombre, email o familia..."
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

      <View style={styles.filtersContainer}>
        <SearchableDropdown
          data={USER_ROLE_FILTROS}
          value={selectedRole}
          onChange={setSelectedRole}
          placeholder="Rol"
          theme={theme}
          colorMarca={colorMarca}
          compact
          searchable={false}
          borderRadius={5}
          inputHeight={48}
        />
        {isRefreshingUsers ? (
          <ActivityIndicator size="small" color={colorMarca} style={styles.filterRefreshing} />
        ) : null}
      </View>

      <View style={styles.body}>
        {showInitialLoader ? (
          <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={sortedUsers}
            keyExtractor={(item) => item._id || Math.random().toString()}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={60} color={theme.icon} />
                <Text style={[styles.emptyText, { color: theme.text }]}>No se encontraron usuarios.</Text>
                <Text style={[styles.emptySubText, { color: theme.textMuted }]}>Probá ajustando los filtros de búsqueda.</Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity
        style={[styles.fabSecondary, { backgroundColor: theme.surface, borderColor: colorMarca }]}
        onPress={() => navigation.navigate('InvitarFamilia')}
      >
        <Ionicons name="link-outline" size={24} color={colorMarca} />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.fab, { backgroundColor: colorMarca }]} onPress={openCreateModal}>
        <Ionicons name="add" size={30} color="#ffffff" />
      </TouchableOpacity>

      <UserFormModal 
        visible={isFormVisible} 
        onClose={() => setIsFormVisible(false)} 
        onSave={handleSaveUser} 
        initialData={selectedUser} 
        isSaving={isSaving}
        viewerRol={viewerRol}
        onConvertTrial={selectedUser?.esPrueba ? handleConvertTrial : undefined}
        convertingTrial={convertingTrial}
      />

      <UserDetailsModal 
        visible={isDetailsVisible} 
        user={selectedUser} 
        onClose={() => setIsDetailsVisible(false)} 
        onEdit={openEditModal} 
        onDelete={handleDelete} 
      />

      <CustomAlert 
        visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message}
        showCancel={alertConfig.showCancel} isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText} cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm} onCancel={alertConfig.onCancel}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 20, marginTop: 12, zIndex: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 5, paddingHorizontal: 15, borderWidth: 1, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16 },
  filtersContainer: { marginTop: 12, marginBottom: 10, paddingHorizontal: 20, zIndex: 9, position: 'relative' },
  filterRefreshing: { position: 'absolute', right: 44, top: 14 },
  body: { flex: 1, paddingHorizontal: 20 },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  userEmail: { fontSize: 13 },
  familyTag: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  roleBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  swipeActionsContainer: { flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 5 },
  swipeBtn: { width: 70, justifyContent: 'center', alignItems: 'center', height: '100%' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubText: { fontSize: 14, marginTop: 5, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
  fabSecondary: {
    position: 'absolute',
    bottom: 20,
    right: 92,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});