import React, { useState, useContext, useCallback, useMemo, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, StatusBar, Modal, TextInput, RefreshControl, ScrollView,
  KeyboardAvoidingView, Platform,
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
import SearchableDropdown from '../../components/SearchableDropdown';
import { isoCalendarDateToDisplay, displayDateToIsoCalendar, formatJsDateToDisplay, maskDateDDMMAAAA } from '../../utils/dateDisplay';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { isClubOwnerRole } from '../../constants/appRoles';

function defaultIndisponibleHastaDisplay() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return formatJsDateToDisplay(d);
}

const SESSION_ACTIONS = [
  { value: 'reubicar', label: 'Reubicar a otro espacio', hint: 'Solo espacios libres en el horario de todas las sesiones.' },
  { value: 'delegar_coach', label: 'Que el coach elija', hint: 'Cada sesión queda pendiente para que el staff defina lugar.' },
  { value: 'cancelar', label: 'Cancelar sesiones', hint: 'Se cancelan todas las sesiones afectadas.' },
];

export default function EspaciosFisicosScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext); 
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const spacesCacheKey = clubData?.urlIdentifier ? `admin-espacios:${clubData.urlIdentifier}` : '';

  const [spaces, setSpaces] = useState(() => readScreenCache(spacesCacheKey)?.list ?? []);

  // Form Modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', tipo: 'cancha', admiteSubdivision: false });
  const [editingSpace, setEditingSpace] = useState(null);

  // Status Action Modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedSpaceForStatus, setSelectedSpaceForStatus] = useState(null);
  const [notasMantenimiento, setNotasMantenimiento] = useState('');
  const [indisponibleHastaDisplay, setIndisponibleHastaDisplay] = useState('');
  const [sessionActionModalVisible, setSessionActionModalVisible] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('');
  const [affectedSessions, setAffectedSessions] = useState([]);
  const [freeSpacesForMove, setFreeSpacesForMove] = useState([]);
  const [loadingAffected, setLoadingAffected] = useState(false);
  const [sessionAction, setSessionAction] = useState('reubicar');
  const [reubicarEspacioId, setReubicarEspacioId] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [viewerRol, setViewerRol] = useState('');
  const canManageSpaces = isClubOwnerRole(viewerRol);

  useEffect(() => {
    getToken('userRol').then((r) => setViewerRol(r || ''));
  }, []);

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
      'Authorization': `Bearer ${token}`,
    };
  };

  const fetchSpacesData = useCallback(async () => {
    const response = await clubApi.get('/spaces', { headers: await getHeaders() });
    const list = Array.isArray(response.data) ? response.data : [];
    return { list };
  }, [clubData?.urlIdentifier]);

  const applySpaces = useCallback((data) => {
    setSpaces(data.list ?? []);
  }, []);

  const { loading: isLoading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: spacesCacheKey,
    enabled: !!spacesCacheKey,
    fetchData: fetchSpacesData,
    onFetched: applySpaces,
    onFetchError: () => {
      showAlert('Error', 'No se pudieron cargar los espacios físicos.');
    },
  });

  const showInitialLoader = isLoading && spaces.length === 0;

  const reubicarOptions = useMemo(
    () => [
      { label: 'Elegir espacio…', value: '' },
      ...freeSpacesForMove.map((s) => ({ label: s.nombre, value: s._id })),
    ],
    [freeSpacesForMove],
  );

  const resetSessionActionFlow = () => {
    setSessionActionModalVisible(false);
    setPendingStatus('');
    setAffectedSessions([]);
    setFreeSpacesForMove([]);
    setSessionAction('reubicar');
    setReubicarEspacioId('');
    setSavingStatus(false);
  };

  const getIndisponibleHastaIso = () => displayDateToIsoCalendar(indisponibleHastaDisplay);

  const validateRestrictedDates = () => {
    if (!notasMantenimiento.trim()) {
      return 'Debe indicar un motivo para el mantenimiento o clausura.';
    }
    if (!getIndisponibleHastaIso()) {
      return 'Indicá la fecha de fin (DD-MM-AAAA).';
    }
    return null;
  };

  const openStatusModal = (item) => {
    setSelectedSpaceForStatus(item);
    setNotasMantenimiento(item.notasMantenimiento || '');
    setIndisponibleHastaDisplay(
      item.indisponibleHasta ? isoCalendarDateToDisplay(item.indisponibleHasta) : defaultIndisponibleHastaDisplay(),
    );
    setStatusModalVisible(true);
  };

  const handleChangeStatus = async (nuevoEstado, options = {}) => {
    if (!selectedSpaceForStatus) return;

    if (nuevoEstado === 'mantenimiento' || nuevoEstado === 'clausurado') {
      const dateError = validateRestrictedDates();
      if (dateError) return showAlert('Error', dateError);
    }

    setSavingStatus(true);
    try {
      const headers = await getHeaders();
      const payload = {
        estado: nuevoEstado,
        notasMantenimiento: notasMantenimiento || '',
        accionSesiones: options.accionSesiones,
        nuevoEspacioId: options.nuevoEspacioId,
        indisponibleHasta:
          nuevoEstado === 'mantenimiento' || nuevoEstado === 'clausurado'
            ? getIndisponibleHastaIso()
            : null,
      };

      const response = await clubApi.patch(`/spaces/${selectedSpaceForStatus._id}/estado`, payload, { headers });

      setSpaces(spaces.map((s) => (s._id === selectedSpaceForStatus._id ? response.data.space : s)));

      showAlert('Estado actualizado', response.data.message || 'Cambio guardado.');
      setStatusModalVisible(false);
      setNotasMantenimiento('');
      setIndisponibleHastaDisplay('');
      resetSessionActionFlow();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudo cambiar el estado.');
    } finally {
      setSavingStatus(false);
    }
  };

  const beginRestrictedStatusChange = async (nuevoEstado) => {
    if (!selectedSpaceForStatus) return;

    const dateError = validateRestrictedDates();
    if (dateError) return showAlert('Error', dateError);

    const isoHasta = getIndisponibleHastaIso();
    setLoadingAffected(true);
    try {
      const headers = await getHeaders();
      const { data } = await clubApi.get(
        `/spaces/${selectedSpaceForStatus._id}/sesiones-afectadas?indisponibleHasta=${isoHasta}`,
        { headers },
      );
      const sessions = data?.sessions || [];

      if (!sessions.length) {
        await handleChangeStatus(nuevoEstado, { accionSesiones: 'cancelar' });
        return;
      }

      let libres = [];
      try {
        const { data: freeData } = await clubApi.post(
          '/spaces/libres-para-sesiones',
          {
            excludeSpaceId: selectedSpaceForStatus._id,
            sessions: sessions.map((s) => ({
              _id: s._id,
              fecha: s.fecha,
              horaInicio: s.horaInicio,
              horaFin: s.horaFin,
            })),
          },
          { headers },
        );
        libres = freeData.espaciosLibresParaTodas || [];
      } catch {
        libres = [];
      }

      setPendingStatus(nuevoEstado);
      setAffectedSessions(sessions);
      setFreeSpacesForMove(libres);
      setSessionAction(libres.length ? 'reubicar' : 'delegar_coach');
      setReubicarEspacioId('');
      setStatusModalVisible(false);
      setSessionActionModalVisible(true);
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudieron cargar las sesiones afectadas.');
    } finally {
      setLoadingAffected(false);
    }
  };

  const confirmSessionAction = async () => {
    if (!pendingStatus) return;

    if (sessionAction === 'reubicar' && !reubicarEspacioId) {
      return showAlert('Espacio', 'Elegí el espacio destino para reubicar las sesiones.');
    }

    await handleChangeStatus(pendingStatus, {
      accionSesiones: sessionAction,
      nuevoEspacioId: sessionAction === 'reubicar' ? reubicarEspacioId : undefined,
    });
  };

  const handleSaveSpace = async () => {
    if (!formData.nombre.trim()) return showAlert('Error', 'Poné un nombre para el espacio.');
    
    setIsSaving(true);
    try {
      const headers = await getHeaders();
      if (editingSpace) {
        const response = await clubApi.put(`/spaces/${editingSpace._id}`, formData, { headers });
        setSpaces(spaces.map(s => s._id === response.data._id ? response.data : s));
        showAlert('Éxito', 'Espacio actualizado correctamente');
      } else {
        const response = await clubApi.post('/spaces', formData, { headers });
        setSpaces([...spaces, response.data]);
        showAlert('Éxito', 'Espacio creado correctamente');
      }
      setIsModalVisible(false);
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudo guardar el espacio');
    } finally {
      setIsSaving(false);
    }
  };

  const openForm = (space = null) => {
    if (space) {
      setEditingSpace(space);
      setFormData({ nombre: space.nombre, tipo: space.tipo, admiteSubdivision: space.admiteSubdivision });
    } else {
      setEditingSpace(null);
      setFormData({ nombre: '', tipo: 'cancha', admiteSubdivision: false });
    }
    setIsModalVisible(true);
  };

  const getStatusColor = (estado) => {
    switch(estado) {
      case 'disponible': return '#10b981';
      case 'mantenimiento': return '#f59e0b';
      case 'clausurado': return '#ef4444';
      default: return theme.textMuted;
    }
  };

  const getIconForType = (tipo) => {
    switch(tipo) {
      case 'cancha': return 'football-outline';
      case 'gimnasio': return 'barbell-outline';
      case 'pileta': return 'water-outline';
      case 'salon': return 'home-outline';
      default: return 'map-outline';
    }
  };

  const renderRightActions = (item) => (
    <View style={styles.swipeActionsContainer}>
      <TouchableOpacity style={[styles.swipeBtn, { backgroundColor: '#f59e0b' }]} onPress={() => openForm(item)}>
        <Ionicons name="pencil" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  const renderListItem = ({ item }) => {
    const card = (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface }]}
        onPress={() => openStatusModal(item)}
      >
          <View style={[styles.avatar, { backgroundColor: colorMarca + '20' }]}>
            <Ionicons name={getIconForType(item.tipo)} size={24} color={colorMarca} />
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, { color: theme.text }]}>{item.nombre}</Text>
            <Text style={[styles.sub, { color: theme.textMuted, textTransform: 'capitalize' }]}>{item.tipo}</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <View style={[styles.badge, { backgroundColor: getStatusColor(item.estado) + '20' }]}>
                <Text style={{ color: getStatusColor(item.estado), fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' }}>
                  {item.estado}
                </Text>
              </View>
              {item.admiteSubdivision ? (
                <View style={[styles.badge, { backgroundColor: colorMarca + '15' }]}>
                  <Text style={{ color: colorMarca, fontSize: 11, fontWeight: '600' }}>Multi-uso</Text>
                </View>
              ) : null}
            </View>
            {item.indisponibleHasta && item.estado !== 'disponible' ? (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
                Hasta {isoCalendarDateToDisplay(item.indisponibleHasta)}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
    );

    if (!canManageSpaces) return card;

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        {card}
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Infraestructura"
        title="Espacios físicos"
        subtitle="Canchas, gimnasios y salones"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.body}>
        {showInitialLoader ? (
          <ActivityIndicator size="large" color={colorMarca} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
             data={spaces}
             keyExtractor={(item) => item._id}
             renderItem={renderListItem}
             contentContainerStyle={{ paddingBottom: 80, paddingTop: 20 }}
             refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
             ListEmptyComponent={
               <View style={styles.emptyState}>
                 <Ionicons name="map-outline" size={60} color={theme.icon} />
                 <Text style={[styles.emptyText, { color: theme.text }]}>Sin espacios</Text>
                 <Text style={[styles.emptySubText, { color: theme.textMuted }]}>No hay espacios físicos registrados.</Text>
               </View>
             }
          />
        )}
      </View>

      {canManageSpaces ? (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colorMarca }]} onPress={() => openForm()}>
          <Ionicons name="add" size={30} color="#ffffff" />
        </TouchableOpacity>
      ) : null}

      {/* MODAL CREAR / EDITAR */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
           <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                 <Text style={[styles.modalTitle, { color: theme.text }]}>{editingSpace ? 'Editar Espacio' : 'Nuevo Espacio'}</Text>
                 <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                    <Ionicons name="close" size={28} color={theme.icon} />
                 </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre del Espacio *</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                 placeholder="Ej: Cancha 1" placeholderTextColor={theme.textMuted}
                 value={formData.nombre} onChangeText={(v) => setFormData({...formData, nombre: v})}
              />

              <Text style={[styles.label, { color: theme.textMuted }]}>Tipo *</Text>
              <View style={styles.typesContainer}>
                {['cancha', 'gimnasio', 'pileta', 'salon', 'otro'].map(t => (
                  <TouchableOpacity key={t} 
                    style={[styles.typeChip, { backgroundColor: formData.tipo === t ? colorMarca : theme.background, borderColor: formData.tipo === t ? colorMarca : theme.border }]}
                    onPress={() => setFormData({...formData, tipo: t})}
                  >
                    <Text style={{ color: formData.tipo === t ? '#fff' : theme.text, textTransform: 'capitalize' }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={[styles.subdivisionToggle, { backgroundColor: formData.admiteSubdivision ? colorMarca + '15' : theme.background, borderColor: formData.admiteSubdivision ? colorMarca : theme.border }]}
                onPress={() => setFormData({...formData, admiteSubdivision: !formData.admiteSubdivision})}
              >
                <Ionicons name={formData.admiteSubdivision ? 'checkbox' : 'square-outline'} size={22} color={formData.admiteSubdivision ? colorMarca : theme.textMuted} />
                <View style={{marginLeft:12,flex:1}}>
                  <Text style={{color:theme.text,fontWeight:'600',fontSize:14}}>Admite múltiples categorías a la vez</Text>
                  <Text style={{color:theme.textMuted,fontSize:12,marginTop:2}}>Permite que varias actividades usen el espacio simultáneamente sin choque de horarios</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colorMarca, marginTop: 20 }]} onPress={handleSaveSpace} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
              </TouchableOpacity>
              </ScrollView>
           </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL ESTADO */}
      <Modal visible={statusModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlayCenter}>
           <View style={[styles.modalContentCenter, { backgroundColor: theme.surface }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text, textAlign: 'center', marginBottom: 5 }]}>Cambiar Estado</Text>
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginBottom: 20 }}>{selectedSpaceForStatus?.nombre}</Text>

              <Text style={[styles.label, { color: theme.textMuted }]}>Motivo / Notas</Text>
              <TextInput style={[styles.inputArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                 placeholder="Requerido para mantenimiento o clausura" placeholderTextColor={theme.textMuted}
                 multiline
                 value={notasMantenimiento} onChangeText={setNotasMantenimiento}
              />

              <Text style={[styles.label, { color: theme.textMuted }]}>Fin del mantenimiento / clausura (DD-MM-AAAA)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="DD-MM-AAAA"
                placeholderTextColor={theme.textMuted}
                value={indisponibleHastaDisplay}
                onChangeText={(t) => setIndisponibleHastaDisplay(maskDateDDMMAAAA(t))}
                keyboardType="number-pad"
                maxLength={10}
              />
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 18 }}>
                Solo se afectan las sesiones hasta esa fecha. Las posteriores siguen en este espacio.
              </Text>

              <TouchableOpacity style={[styles.statusBtn, { backgroundColor: '#10b981' }]} onPress={() => handleChangeStatus('disponible')} disabled={savingStatus || loadingAffected}>
                <Text style={styles.statusBtnText}>Marcar como Disponible</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.statusBtn, { backgroundColor: '#f59e0b' }]} onPress={() => beginRestrictedStatusChange('mantenimiento')} disabled={savingStatus || loadingAffected}>
                {loadingAffected ? <ActivityIndicator color="#fff" /> : <Text style={styles.statusBtnText}>Mandar a Mantenimiento</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.statusBtn, { backgroundColor: '#ef4444' }]} onPress={() => beginRestrictedStatusChange('clausurado')} disabled={savingStatus || loadingAffected}>
                <Text style={styles.statusBtnText}>Clausurar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={{ marginTop: 15, padding: 10 }} onPress={() => setStatusModalVisible(false)}>
                <Text style={{ color: theme.textMuted, textAlign: 'center', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              </ScrollView>
           </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={sessionActionModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Sesiones afectadas</Text>
              <TouchableOpacity onPress={resetSessionActionFlow}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: theme.textMuted, marginBottom: 12, lineHeight: 20 }}>
              {selectedSpaceForStatus?.nombre} pasará a{' '}
              <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{pendingStatus}</Text> hasta el{' '}
              {indisponibleHastaDisplay}. Hay {affectedSessions.length} sesión
              {affectedSessions.length === 1 ? '' : 'es'} programada{affectedSessions.length === 1 ? '' : 's'} en ese
              período.
            </Text>

            <ScrollView style={{ maxHeight: 160, marginBottom: 14 }} showsVerticalScrollIndicator={false}>
              {affectedSessions.slice(0, 8).map((s) => (
                <Text key={s._id} style={{ color: theme.text, fontSize: 13, marginBottom: 6 }}>
                  · {isoCalendarDateToDisplay(s.fecha)} {s.horaInicio}–{s.horaFin}
                  {s.categoria?.nombre ? ` · ${s.categoria.nombre}` : ''}
                </Text>
              ))}
              {affectedSessions.length > 8 ? (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  y {affectedSessions.length - 8} más…
                </Text>
              ) : null}
            </ScrollView>

            <Text style={[styles.label, { color: theme.textMuted }]}>Qué hacer con esas sesiones</Text>
            {SESSION_ACTIONS.map((opt) => {
              const disabled = opt.value === 'reubicar' && !freeSpacesForMove.length;
              const active = sessionAction === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.actionOption,
                    {
                      borderColor: active ? colorMarca : theme.border,
                      backgroundColor: active ? colorMarca + '14' : theme.background,
                      opacity: disabled ? 0.45 : 1,
                    },
                  ]}
                  onPress={() => !disabled && setSessionAction(opt.value)}
                  disabled={disabled}
                >
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{opt.label}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>{opt.hint}</Text>
                </TouchableOpacity>
              );
            })}

            {sessionAction === 'reubicar' ? (
              <>
                <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Espacio destino</Text>
                {freeSpacesForMove.length ? (
                  <SearchableDropdown
                    data={reubicarOptions}
                    value={reubicarEspacioId}
                    onChange={setReubicarEspacioId}
                    placeholder="Elegir espacio…"
                    theme={theme}
                    colorMarca={colorMarca}
                    compact
                  />
                ) : (
                  <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 18 }}>
                    No hay espacios libres para todas las sesiones afectadas en sus horarios. Delegá al coach o
                    cancelá las sesiones.
                  </Text>
                )}
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colorMarca, marginTop: 18 }]}
              onPress={confirmSessionAction}
              disabled={savingStatus}
            >
              {savingStatus ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Confirmar cambio de estado</Text>
              )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 5 },
  swipeActionsContainer: { flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 12 },
  swipeBtn: { width: 70, justifyContent: 'center', alignItems: 'center', height: '100%' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubText: { fontSize: 14, marginTop: 5, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  label: { fontSize: 13, marginBottom: 5, fontWeight: '600', marginLeft: 4 },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, marginBottom: 15 },
  typesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  saveBtn: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  subdivisionToggle: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, borderWidth: 1, marginTop: 15 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContentCenter: { width: '100%', borderRadius: 25, padding: 25 },
  inputArea: { height: 80, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, textAlignVertical: 'top' },
  statusBtn: { padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  statusBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  actionOption: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
});
