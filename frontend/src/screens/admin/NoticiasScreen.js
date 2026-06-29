import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Modal, TextInput, ScrollView, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { clubApi } from '../../utils/api';
import { STAFF_NEWS_AUTHOR_ROLES, CLUB_NEWS_AUTHOR_ROLES } from '../../constants/appRoles';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { sortByNombre, sortUsersByName } from '../../utils/listSort';
import CoachNewsAthletePicker from '../../components/CoachNewsAthletePicker';
import NewsMultiSelectList from '../../components/NewsMultiSelectList';
import { formatJsDateToDisplay } from '../../utils/dateDisplay';
import { uploadFileToClub } from '../../utils/uploadMedia';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

const ADMIN_ALCANCE_OPTIONS = [
  { value: 'global', label: 'Todo el club', icon: 'globe-outline' },
  { value: 'categoria', label: 'Categorías', icon: 'shirt-outline' },
  { value: 'tutor', label: 'Tutores', icon: 'people-outline' },
];
const ALCANCE_OPTIONS = ADMIN_ALCANCE_OPTIONS;
/** Profes: solo categorías propias o atletas puntuales (backend valida) */
const COACH_ALCANCE_OPTIONS = [
  { value: 'categoria', label: 'Mis categorías', icon: 'shirt-outline' },
  { value: 'usuario', label: 'Atletas', icon: 'person-outline' },
];
/** Staff (nutri/psico/prepa): jugadores y tutores de sus equipos */
const STAFF_ALCANCE_OPTIONS = [
  { value: 'usuario', label: 'Jugadores', icon: 'person-outline' },
  { value: 'tutor', label: 'Tutores', icon: 'people-outline' },
];
const ADMIN_ROLES = ['admin_club', 'administrativo'];

export default function NoticiasScreen({ navigation, route }) {
  const embeddedStaff = route?.params?.embeddedStaff === true;
  const coachBrandedHeader = route?.params?.coachBrandedHeader === true;
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';

  const [viewerRol, setViewerRol] = useState('');
  const [viewerId, setViewerId] = useState('');
  const newsCacheKey =
    clubData?.urlIdentifier && viewerRol
      ? `noticias:${clubData.urlIdentifier}:${viewerRol}`
      : '';

  const [news, setNews] = useState(() => readScreenCache(newsCacheKey)?.list ?? []);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [categories, setCategories] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [coachMisCategorias, setCoachMisCategorias] = useState([]);
  const [coachAthletes, setCoachAthletes] = useState([]);
  const [adminTutors, setAdminTutors] = useState([]);
  const [staffAthletes, setStaffAthletes] = useState([]);
  const [staffTutors, setStaffTutors] = useState([]);

  const [formData, setFormData] = useState({
    titulo: '', contenido: '', tipo: 'general', alcance: 'global',
    targetRoles: [], targetCategorias: [], targetUsuarios: [], selectedDisciplina: '', imagen: null
  });

  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [alertConfig, setAlertConfig] = useState({ visible:false, title:'', message:'', showCancel:false, isDanger:false, onConfirm:()=>{}, onCancel:()=>{} });
  const showAlert = (t,m) => setAlertConfig({ visible:true, title:t, message:m, onConfirm:()=>setAlertConfig(p=>({...p,visible:false})), onCancel:()=>setAlertConfig(p=>({...p,visible:false})) });

  const isCoachComposer = viewerRol === 'profe';
  const isAdminComposer = ADMIN_ROLES.includes(viewerRol);
  const isStaffComposer = STAFF_NEWS_AUTHOR_ROLES.includes(viewerRol) && !isAdminComposer && !isCoachComposer;

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

  const disciplineFilterOptions = useMemo(
    () => (disciplines || []).map((d) => ({ id: d._id, label: d.nombre })),
    [disciplines],
  );

  const getHeaders = async () => {
    const token = await getToken('userToken');
    return { 'x-club-identifier': clubData.urlIdentifier, 'Authorization': `Bearer ${token}` };
  };

  const fetchNews = useCallback(async () => {
    const h = await getHeaders();
    let endpoint = '/news/feed';
    if (ADMIN_ROLES.includes(viewerRol) || STAFF_NEWS_AUTHOR_ROLES.includes(viewerRol)) {
      endpoint = '/news';
    }
    const res = await clubApi.get(endpoint, { headers: h });
    return { list: res.data };
  }, [clubData?.urlIdentifier, viewerRol]);

  const applyNews = useCallback((data) => {
    setNews(data.list ?? []);
  }, []);

  const { loading: isLoading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: newsCacheKey,
    enabled: !!newsCacheKey,
    fetchData: fetchNews,
    onFetched: applyNews,
    onFetchError: () => {
      showAlert('Error', 'No se pudieron cargar las noticias.');
    },
  });

  const showInitialLoader = isLoading && news.length === 0;

  useEffect(() => {
    let cancel = false;
    (async () => {
      const r = await getToken('userRol');
      const id = await getToken('userId');
      if (cancel) return;
      const rr = r || '';
      setViewerRol(rr);
      setViewerId(id || '');
      if (cancel) return;
      if (ADMIN_ROLES.includes(rr) || STAFF_NEWS_AUTHOR_ROLES.includes(rr)) {
        try {
          const h = await getHeaders();
          if (rr === 'profe') {
            const catRes = await clubApi.get('/categories/mis-categorias', { headers: h });
            if (!cancel) {
              setCoachMisCategorias(catRes.data || []);
              setCategories(sortByNombre(catRes.data || []));
              setDisciplines([]);
            }
          } else if (STAFF_NEWS_AUTHOR_ROLES.includes(rr) && !ADMIN_ROLES.includes(rr)) {
            const [catRes, athRes] = await Promise.all([
              clubApi.get('/categories/mis-categorias', { headers: h }),
              clubApi.get('/categories/mis-atletas', { headers: h }),
            ]);
            if (!cancel) {
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
                    return {
                      ...a,
                      categoriaIds,
                      categoriasLabel,
                      tutorPrincipal: a?.tutorPrincipal || null,
                    };
                  }),
                ),
              );
              const tutorMap = new Map();
              (athRes.data || []).forEach((row) => {
                const tp = row?.atleta?.tutorPrincipal;
                if (tp?._id) tutorMap.set(String(tp._id), tp);
              });
              setStaffTutors(sortUsersByName([...tutorMap.values()]));
            }
          } else {
            const [catRes, discRes, tutorsRes] = await Promise.all([
              clubApi.get('/categories', { headers: h }),
              clubApi.get('/disciplines', { headers: h }),
              clubApi.get('/users', { headers: h, params: { rol: 'tutor', limit: 500 } }),
            ]);
            if (!cancel) {
              setCategories(sortByNombre(catRes.data));
              setDisciplines(sortByNombre(discRes.data));
              setAdminTutors(sortUsersByName(tutorsRes.data?.users || []));
            }
          }
        } catch (e) {
          console.log('Error fetching form data', e);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!isModalVisible || viewerRol !== 'profe' || coachMisCategorias.length === 0) return;
    let cancel = false;
    (async () => {
      try {
        const h = await getHeaders();
        const lists = await Promise.all(
          coachMisCategorias.map((c) => clubApi.get(`/enrollments/categoria/${c._id}`, { headers: h })),
        );
        if (cancel) return;
        const byId = new Map();
        lists.forEach((res, idx) => {
          const cat = coachMisCategorias[idx];
          const catId = cat?._id;
          const catName = cat?.nombre || '';
          (res.data || []).forEach((en) => {
            const a = en.atleta;
            if (!a?._id) return;
            const key = String(a._id);
            const prev = byId.get(key);
            if (prev) {
              if (catId && !prev.categoriaIds.includes(catId)) {
                prev.categoriaIds.push(catId);
                prev.categoriasNombres.push(catName);
              }
            } else {
              byId.set(key, {
                ...a,
                categoriaIds: catId ? [catId] : [],
                categoriasNombres: catName ? [catName] : [],
              });
            }
          });
        });
        const ath = sortUsersByName(
          [...byId.values()].map((a) => ({
            ...a,
            categoriasLabel: (a.categoriasNombres || []).join(' · '),
          })),
        );
        setCoachAthletes(ath);
      } catch (e) {
        console.log('coach athletes for news', e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isModalVisible, viewerRol, coachMisCategorias]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return showAlert('Permiso', 'Se necesita acceso a la galería.');

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    setIsUploading(true);
    try {
      const filename = uri.split('/').pop() || 'imagen.jpg';
      const ext = (filename.split('.').pop() || 'jpg').replace('jpg', 'jpeg');
      const mime = `image/${ext}`;
      const { url, publicId } = await uploadFileToClub(clubData, uri, filename, mime);
      setFormData((prev) => ({ ...prev, imagen: { url, publicId } }));
    } catch (e) {
      console.log('Upload error', e);
      showAlert('Error', e.response?.data?.message || e.message || 'No se pudo subir la imagen.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.titulo || !formData.contenido) return showAlert('Error','Título y contenido son obligatorios.');
    setIsSaving(true);
    try {
      const h = await getHeaders();
      // Si eligió disciplina pero no categorías específicas, mandamos todas las de esa disciplina
      let payload = { ...formData, tipo: 'general' };
      if (
        !isCoachComposer &&
        payload.alcance === 'categoria' &&
        payload.selectedDisciplina &&
        payload.targetCategorias.length === 0
      ) {
        const catsDeDisciplina = categories
          .filter((c) => (c.disciplina?._id || c.disciplina) === payload.selectedDisciplina)
          .map((c) => c._id);
        payload.targetCategorias = catsDeDisciplina;
      }
      if (isCoachComposer && payload.alcance === 'categoria' && payload.targetCategorias.length === 0) {
        setIsSaving(false);
        return showAlert('Alcance', 'Elegí al menos una categoría.');
      }
      if (isCoachComposer && payload.alcance === 'usuario' && (!payload.targetUsuarios || payload.targetUsuarios.length === 0)) {
        setIsSaving(false);
        return showAlert('Destinatarios', 'Elegí al menos un atleta.');
      }
      if (isAdminComposer && payload.alcance === 'tutor' && (!payload.targetUsuarios || payload.targetUsuarios.length === 0)) {
        setIsSaving(false);
        return showAlert('Tutores', 'Elegí al menos un tutor.');
      }
      if (isStaffComposer && payload.alcance === 'usuario' && (!payload.targetUsuarios || payload.targetUsuarios.length === 0)) {
        setIsSaving(false);
        return showAlert('Jugadores', 'Elegí al menos un jugador.');
      }
      if (isStaffComposer && payload.alcance === 'tutor' && (!payload.targetUsuarios || payload.targetUsuarios.length === 0)) {
        setIsSaving(false);
        return showAlert('Tutores', 'Elegí al menos un tutor.');
      }
      if (isAdminComposer && payload.alcance === 'categoria' && payload.targetCategorias.length === 0 && !payload.selectedDisciplina) {
        setIsSaving(false);
        return showAlert('Categorías', 'Elegí al menos una categoría o una disciplina (todas sus categorías).');
      }
      if (payload.alcance === 'tutor') {
        payload.targetRoles = [];
        payload.targetCategorias = [];
      } else if (payload.alcance === 'categoria') {
        payload.targetUsuarios = [];
        payload.targetRoles = [];
      } else if (payload.alcance === 'global') {
        payload.targetUsuarios = [];
        payload.targetCategorias = [];
        payload.targetRoles = [];
      }
      delete payload.selectedDisciplina; // No lo mandamos al backend
      await clubApi.post('/news', payload, { headers: h });
      await reload({ background: true });
      setIsModalVisible(false);
      if (isCoachComposer) resetFormCoachComposer();
      else if (isStaffComposer) resetFormStaffComposer();
      else resetForm();
      showAlert('Éxito','Noticia publicada correctamente.');
    } catch(e) { showAlert('Error', e.response?.data?.message || 'No se pudo publicar.'); }
    finally { setIsSaving(false); }
  };

  const confirmDelete = (id) => {
    setAlertConfig({
      visible:true, title:'Eliminar Noticia', message:'¿Eliminar esta noticia?',
      showCancel:true, isDanger:true, confirmText:'Eliminar', cancelText:'Cancelar',
      onConfirm: async () => {
        setAlertConfig(p=>({...p,visible:false}));
        try {
          const h = await getHeaders();
          await clubApi.delete(`/news/${id}`, { headers: h });
          reload({ background: true });
        } catch(e) { showAlert('Error','No se pudo eliminar.'); }
      },
      onCancel:()=>setAlertConfig(p=>({...p,visible:false}))
    });
  };

  const resetForm = () =>
    setFormData({
      titulo: '',
      contenido: '',
      tipo: 'general',
      alcance: 'global',
      targetRoles: [],
      targetCategorias: [],
      targetUsuarios: [],
      selectedDisciplina: '',
      imagen: null,
    });

  const resetFormStaffComposer = () =>
    setFormData({
      titulo: '',
      contenido: '',
      tipo: 'general',
      alcance: 'usuario',
      targetRoles: [],
      targetCategorias: [],
      targetUsuarios: [],
      selectedDisciplina: '',
      imagen: null,
    });

  const resetFormCoachComposer = () =>
    setFormData({
      titulo: '',
      contenido: '',
      tipo: 'general',
      alcance: 'categoria',
      targetRoles: [],
      targetCategorias: [],
      targetUsuarios: [],
      selectedDisciplina: '',
      imagen: null,
    });

  const openComposer = () => {
    if (isCoachComposer) resetFormCoachComposer();
    else if (isStaffComposer) resetFormStaffComposer();
    else resetForm();
    setIsModalVisible(true);
  };

  const getAuthorDisplay = (autor) => {
    if (!autor) return 'Desconocido';
    if (ADMIN_ROLES.includes(autor.rol)) return 'Administración';
    return `${autor.nombre} ${autor.apellido}`;
  };

  const canCreateNews =
    CLUB_NEWS_AUTHOR_ROLES.includes(viewerRol) || STAFF_NEWS_AUTHOR_ROLES.includes(viewerRol);

  const canSwipeDeleteNews = (item) =>
    ADMIN_ROLES.includes(viewerRol) ||
    (!!viewerId && item.autor?._id && String(item.autor._id) === String(viewerId));

  const toggleCategoria = (catId) => {
    const current = formData.targetCategorias;
    if (current.includes(catId)) setFormData({ ...formData, targetCategorias: current.filter((c) => c !== catId) });
    else setFormData({ ...formData, targetCategorias: [...current, catId] });
  };

  const toggleUsuarioNews = (userId) => {
    const current = formData.targetUsuarios || [];
    const id = String(userId);
    if (current.some((x) => String(x) === id)) {
      setFormData({ ...formData, targetUsuarios: current.filter((x) => String(x) !== id) });
    } else {
      setFormData({ ...formData, targetUsuarios: [...current, userId] });
    }
  };

  const staffTeamOptions = useMemo(
    () => (categories || []).map((c) => ({ id: c._id, label: c.nombre })),
    [categories],
  );

  const formatDate = (d) => formatJsDateToDisplay(new Date(d));

  const renderRightActions = (item) => {
    if (!canSwipeDeleteNews(item)) return null;
    return (
      <View style={{ flexDirection: 'row', marginBottom: 12, overflow: 'hidden', borderRadius: 12 }}>
        <TouchableOpacity
          onPress={() => confirmDelete(item._id)}
          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
        >
          <Ionicons name="trash" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {item.imagen?.url ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setFullscreenImage({ url: item.imagen.url, title: item.titulo })}
            >
              <Image source={{ uri: item.imagen.url }} style={styles.cardImage} resizeMode="cover" />
              <View style={styles.cardImageBadge}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : null}
          <View style={styles.cardBody}>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 6 }}>{formatDate(item.createdAt)}</Text>
            <Text style={[styles.cardTitle,{color:theme.text}]} numberOfLines={2}>{item.titulo}</Text>
            <Text style={{color:theme.textMuted,fontSize:13,marginTop:4}} numberOfLines={3}>{item.contenido}</Text>
            <View style={{flexDirection:'row',alignItems:'center',marginTop:8}}>
              <Ionicons name="person-circle-outline" size={16} color={theme.textMuted} />
              <Text style={{color:theme.textMuted,fontSize:12,marginLeft:4}}>
                {getAuthorDisplay(item.autor)}
              </Text>
              <View style={{marginLeft:'auto',backgroundColor:cc+'15',paddingHorizontal:8,paddingVertical:2,borderRadius:8}}>
                <Text style={{color:cc,fontSize:10,fontWeight:'bold'}}>
                  {item.alcance === 'global'
                    ? 'Global'
                    : item.alcance === 'rol'
                      ? 'Por Rol'
                      : item.alcance === 'usuario'
                      ? 'Atletas'
                      : item.alcance === 'tutor'
                        ? 'Tutores'
                        : 'Categoría'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={[styles.container,{backgroundColor:theme.background}]} edges={['top']}>
      <StatusBar barStyle={isDarkMode?"light-content":"dark-content"} />
      {coachBrandedHeader ? (
        <CoachScreenHeader
          colorMarca={cc}
          theme={theme}
          kicker="Comunicaciones"
          title="Noticias"
          subtitle={clubData?.nombre || 'Club'}
        />
      ) : (
        <AdminScreenHeader
          theme={theme}
          colorMarca={cc}
          kicker="Gestión"
          title="Comunicaciones"
          subtitle={embeddedStaff ? (clubData?.nombre || 'Club') : 'Comunicados del club'}
          onBack={embeddedStaff ? undefined : () => navigation.goBack()}
        />
      )}

      <View style={styles.body}>
        {showInitialLoader ? <ActivityIndicator size="large" color={cc} style={{marginTop:50}} /> : (
          <FlatList data={news} keyExtractor={i=>i._id} renderItem={renderItem}
            contentContainerStyle={{paddingBottom:80,paddingTop:10}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="newspaper-outline" size={60} color={theme.icon} />
                <Text style={[styles.emptyText,{color:theme.text}]}>Sin noticias</Text>
                <Text style={{color:theme.textMuted,marginTop:5,textAlign:'center'}}>
                  {canCreateNews
                    ? 'Publicá el primer comunicado desde el botón +.'
                    : 'Todavía no hay comunicados para tu usuario en esta vista.'}
                </Text>
              </View>
            } />
        )}
      </View>

      {canCreateNews && (
      <TouchableOpacity style={[styles.fab,{backgroundColor:cc}]} onPress={openComposer}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
      )}

      {/* Modal de creación */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent,{backgroundColor:theme.surface}]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle,{color:theme.text}]}>Nueva Noticia</Text>
              <TouchableOpacity onPress={()=>{setIsModalVisible(false); if(isCoachComposer) resetFormCoachComposer(); else if(isStaffComposer) resetFormStaffComposer(); else resetForm();}}>
                <Ionicons name="close" size={28} color={theme.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {/* Título */}
              <Text style={[styles.label,{color:theme.textMuted}]}>Título</Text>
              <TextInput style={[styles.input,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                placeholder="Título de la noticia" placeholderTextColor={theme.textMuted}
                value={formData.titulo} onChangeText={v=>setFormData({...formData,titulo:v})} />

              {/* Contenido */}
              <Text style={[styles.label,{color:theme.textMuted}]}>Contenido</Text>
              <TextInput style={[styles.input,styles.textArea,{backgroundColor:theme.background,borderColor:theme.border,color:theme.text}]}
                placeholder="Escribí el comunicado..." placeholderTextColor={theme.textMuted}
                multiline numberOfLines={4} textAlignVertical="top"
                value={formData.contenido} onChangeText={v=>setFormData({...formData,contenido:v})} />

              {/* Imagen */}
              <Text style={[styles.label,{color:theme.textMuted}]}>Imagen (opcional)</Text>
              {formData.imagen?.url ? (
                <View style={{marginBottom:15}}>
                  <Image source={{uri:formData.imagen.url}} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={()=>setFormData({...formData,imagen:null})}>
                    <Ionicons name="close-circle" size={28} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.uploadBtn,{borderColor:theme.border}]} onPress={pickImage} disabled={isUploading}>
                  {isUploading ? <ActivityIndicator color={cc} /> : (
                    <>
                      <Ionicons name="image-outline" size={28} color={theme.textMuted} />
                      <Text style={{color:theme.textMuted,marginTop:5,fontSize:13}}>Elegir foto de galería</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Alcance */}
              <Text style={[styles.label,{color:theme.textMuted}]}>Alcance</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:15}}>
                {(isCoachComposer ? COACH_ALCANCE_OPTIONS : isStaffComposer ? STAFF_ALCANCE_OPTIONS : ALCANCE_OPTIONS).map((opt) => (
                  <TouchableOpacity key={opt.value}
                    style={[styles.chip, formData.alcance===opt.value ? {backgroundColor:cc,borderColor:cc} : {backgroundColor:theme.background,borderColor:theme.border}]}
                    onPress={() =>
                      setFormData({
                        ...formData,
                        alcance: opt.value,
                        targetRoles: [],
                        targetCategorias: opt.value === 'categoria' ? formData.targetCategorias : [],
                        targetUsuarios:
                          opt.value === 'usuario' || opt.value === 'tutor' ? formData.targetUsuarios : [],
                        selectedDisciplina: opt.value === 'categoria' ? formData.selectedDisciplina : '',
                      })
                    }
                  >
                    <Ionicons name={opt.icon} size={14} color={formData.alcance===opt.value?'#fff':cc} />
                    <Text style={{color:formData.alcance===opt.value?'#fff':theme.text,fontSize:12,marginLeft:4}}>{opt.label}</Text>
                  </TouchableOpacity>
                  ))}
                </View>
              

              {/* Categorías: profes solo las suyas; admin lista multi-select */}
              {formData.alcance === 'categoria' && isCoachComposer && (
                <View style={{ marginBottom: 15 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Tus categorías</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                    Solo podés avisar a equipos a los que estás asignado como profesor.
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(coachMisCategorias.length ? coachMisCategorias : categories).map((c) => (
                      <TouchableOpacity
                        key={c._id}
                        style={[
                          styles.chip,
                          formData.targetCategorias.includes(c._id)
                            ? { backgroundColor: cc, borderColor: cc }
                            : { backgroundColor: theme.background, borderColor: theme.border },
                        ]}
                        onPress={() => toggleCategoria(c._id)}
                      >
                        <Text style={{ color: formData.targetCategorias.includes(c._id) ? '#fff' : theme.text, fontSize: 12 }}>
                          {c.nombre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {formData.alcance === 'categoria' && isAdminComposer && (
                <View style={{ marginBottom: 15 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Categorías destino</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                    Buscá y marcá una o varias categorías. También podés elegir una disciplina abajo para
                    enviar a todas sus categorías sin marcar una por una.
                  </Text>
                  <NewsMultiSelectList
                    items={categoryPickerItems}
                    selectedIds={formData.targetCategorias}
                    onToggle={toggleCategoria}
                    onSetSelected={(ids) =>
                      setFormData((prev) => ({
                        ...prev,
                        targetCategorias: typeof ids === 'function' ? ids(prev.targetCategorias || []) : ids,
                      }))
                    }
                    theme={theme}
                    colorMarca={cc}
                    searchLabel="Buscar categoría"
                    searchPlaceholder="Nombre de categoría o disciplina…"
                    filterOptions={disciplineFilterOptions}
                    getItemFilterIds={(c) => (c.disciplinaId ? [c.disciplinaId] : [])}
                    getPrimaryLabel={(c) => c.nombre}
                    getSecondaryLabel={(c) => c.disciplinaNombre || null}
                    getSearchText={(c) => `${c.nombre} ${c.disciplinaNombre}`}
                    emptyListHint="No hay categorías cargadas."
                    emptySearchHint="Ninguna categoría coincide con la búsqueda."
                  />
                  <Text style={[styles.label, { color: theme.textMuted, marginTop: 4 }]}>O toda una disciplina</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {disciplines.map((d) => (
                      <TouchableOpacity
                        key={d._id}
                        style={[
                          styles.chip,
                          formData.selectedDisciplina === d._id
                            ? { backgroundColor: cc, borderColor: cc }
                            : { backgroundColor: theme.background, borderColor: theme.border },
                        ]}
                        onPress={() =>
                          setFormData({
                            ...formData,
                            selectedDisciplina: formData.selectedDisciplina === d._id ? '' : d._id,
                            targetCategorias: [],
                          })
                        }
                      >
                        <Text style={{ color: formData.selectedDisciplina === d._id ? '#fff' : theme.text, fontSize: 12 }}>
                          Todas · {d.nombre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {formData.selectedDisciplina ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                      Se enviará a todas las categorías de esa disciplina (sin necesidad de marcarlas arriba).
                    </Text>
                  ) : null}
                </View>
              )}

              {formData.alcance === 'tutor' && isAdminComposer && (
                <View style={{ marginBottom: 15 }}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Tutores destinatarios</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                    Buscá y marcá uno o varios tutores. Solo ellos verán el comunicado en su app.
                  </Text>
                  <NewsMultiSelectList
                    items={adminTutors}
                    selectedIds={formData.targetUsuarios}
                    onToggle={toggleUsuarioNews}
                    onSetSelected={(ids) =>
                      setFormData((prev) => ({
                        ...prev,
                        targetUsuarios: typeof ids === 'function' ? ids(prev.targetUsuarios || []) : ids,
                      }))
                    }
                    theme={theme}
                    colorMarca={cc}
                    searchLabel="Buscar tutor"
                    searchPlaceholder="Nombre, apellido o email…"
                    getPrimaryLabel={(t) => `${t.nombre || ''} ${t.apellido || ''}`.trim()}
                    getSecondaryLabel={(t) => t.email || null}
                    getSearchText={(t) => `${t.nombre} ${t.apellido} ${t.email || ''}`}
                    emptyListHint="No hay tutores registrados en el club."
                    emptySearchHint="Ningún tutor coincide con la búsqueda."
                  />
                </View>
              )}

              {formData.alcance === 'tutor' && isStaffComposer && (
                <View style={{ marginBottom: 15 }}>

                  <NewsMultiSelectList
                    items={staffTutors}
                    selectedIds={formData.targetUsuarios}
                    onToggle={toggleUsuarioNews}
                    onSetSelected={(ids) =>
                      setFormData((prev) => ({
                        ...prev,
                        targetUsuarios: typeof ids === 'function' ? ids(prev.targetUsuarios || []) : ids,
                      }))
                    }
                    theme={theme}
                    colorMarca={cc}
                    searchLabel="Buscar tutor"
                    searchPlaceholder="Nombre, apellido o email…"
                    getPrimaryLabel={(t) => `${t.nombre || ''} ${t.apellido || ''}`.trim()}
                    getSecondaryLabel={(t) => t.email || null}
                    getSearchText={(t) => `${t.nombre} ${t.apellido} ${t.email || ''}`}
                    emptyListHint="No hay tutores en tus equipos."
                    emptySearchHint="Ningún tutor coincide con la búsqueda."
                  />
                </View>
              )}

              {formData.alcance === 'usuario' && isCoachComposer && (
                <View style={{ marginBottom: 15 }}>
                  <CoachNewsAthletePicker
                    athletes={coachAthletes}
                    categories={coachMisCategorias.length ? coachMisCategorias : categories}
                    selectedIds={formData.targetUsuarios || []}
                    onToggle={toggleUsuarioNews}
                    onSetSelected={(ids) =>
                      setFormData((prev) => ({
                        ...prev,
                        targetUsuarios: typeof ids === 'function' ? ids(prev.targetUsuarios || []) : ids,
                      }))
                    }
                    theme={theme}
                    colorMarca={cc}
                  />
                </View>
              )}

              {formData.alcance === 'usuario' && isStaffComposer && (
                <View style={{ marginBottom: 15 }}>
          

                  <NewsMultiSelectList
                    items={staffAthletes}
                    selectedIds={formData.targetUsuarios}
                    onToggle={toggleUsuarioNews}
                    onSetSelected={(ids) =>
                      setFormData((prev) => ({
                        ...prev,
                        targetUsuarios: typeof ids === 'function' ? ids(prev.targetUsuarios || []) : ids,
                      }))
                    }
                    theme={theme}
                    colorMarca={cc}
                    searchLabel="Buscar jugador"
                    searchPlaceholder="Nombre, apellido o email…"
                    filterOptions={staffTeamOptions}
                    getItemFilterIds={(a) => a.categoriaIds || []}
                    getPrimaryLabel={(a) => `${a.nombre || ''} ${a.apellido || ''}`.trim()}
                    getSecondaryLabel={(a) => a.categoriasLabel || null}
                    getSearchText={(a) => `${a.nombre} ${a.apellido} ${a.email || ''} ${a.categoriasLabel || ''}`}
                    emptyListHint="No hay atletas en tus equipos."
                    emptySearchHint="Ningún atleta coincide con la búsqueda."
                  />
                </View>
              )}

              <TouchableOpacity style={[styles.saveBtn,{backgroundColor:cc,marginTop:10}]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="send" size={18} color="#fff" style={{marginRight:8}} /><Text style={styles.saveBtnText}>Publicar Noticia</Text></>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!fullscreenImage}
        animationType="fade"
        transparent
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenBackdrop}>
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenImage(null)} hitSlop={16}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {fullscreenImage?.url ? (
            <Image source={{ uri: fullscreenImage.url }} style={styles.fullscreenImage} resizeMode="contain" />
          ) : null}
          {fullscreenImage?.title ? (
            <Text style={styles.fullscreenCaption} numberOfLines={2}>
              {fullscreenImage.title}
            </Text>
          ) : null}
        </View>
      </Modal>

      <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message}
        showCancel={alertConfig.showCancel} isDanger={alertConfig.isDanger}
        confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm}
        cancelText={alertConfig.cancelText} onCancel={alertConfig.onCancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  body:{flex:1,paddingHorizontal:20},
  card:{borderRadius:12,marginBottom:14,elevation:2,overflow:'hidden'},
  cardImage:{width:'100%',height:210,backgroundColor:'#e5e7eb'},
  cardImageBadge:{position:'absolute',right:10,bottom:10,backgroundColor:'rgba(0,0,0,0.55)',borderRadius:8,padding:6},
  cardBody:{padding:16,paddingTop:14,minHeight:88},
  fullscreenBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.92)',justifyContent:'center',alignItems:'center',paddingHorizontal:12,paddingVertical:48},
  fullscreenClose:{position:'absolute',top:48,right:20,zIndex:2,padding:8},
  fullscreenImage:{width:'100%',height:'78%'},
  fullscreenCaption:{color:'#fff',fontSize:14,textAlign:'center',marginTop:12,paddingHorizontal:16,opacity:0.9},
  cardTitle:{fontSize:16,fontWeight:'bold'},
  emptyState:{alignItems:'center',marginTop:60},
  emptyText:{fontSize:18,fontWeight:'bold',marginTop:15},
  fab:{position:'absolute',bottom:20,right:20,width:60,height:60,borderRadius:30,justifyContent:'center',alignItems:'center',elevation:5},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},
  modalContent:{borderTopLeftRadius:5,borderTopRightRadius:5,padding:25,paddingBottom:40,maxHeight:'90%'},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  modalTitle:{fontSize:20,fontWeight:'bold'},
  label:{fontSize:13,marginBottom:5,fontWeight:'600',marginLeft:4},
  input:{height:48,borderWidth:1,borderRadius:5,paddingHorizontal:15,marginBottom:15},
  textArea:{height:100,paddingTop:12},
  chip:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:5,borderWidth:1},
  uploadBtn:{borderWidth:2,borderStyle:'dashed',borderRadius:5,height:120,justifyContent:'center',alignItems:'center',marginBottom:15},
  previewImage:{width:'100%',height:180,borderRadius:5},
  removeImageBtn:{position:'absolute',top:8,right:8},
  saveBtn:{height:50,borderRadius:5,justifyContent:'center',alignItems:'center',flexDirection:'row'},
  saveBtnText:{color:'#fff',fontSize:16,fontWeight:'bold'},
  actionBtn:{width:70,justifyContent:'center',alignItems:'center',height:'100%'},
});
