import React, { useContext, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useBadgesOptional } from '../../context/BadgeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import BadgeDot from '../../components/BadgeDot';
import { sortByNombre } from '../../utils/listSort';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function CoachCategoriesScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const badges = useBadgesOptional();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const categoriesCacheKey = clubData?.urlIdentifier ? `coach-categories:${clubData.urlIdentifier}` : '';

  const [list, setList] = useState(() => readScreenCache(categoriesCacheKey)?.list ?? []);
  const [plantelPendientes, setPlantelPendientes] = useState(
    () => readScreenCache(categoriesCacheKey)?.plantelPendientes ?? [],
  );
  const [userRol, setUserRol] = useState(() => readScreenCache(categoriesCacheKey)?.userRol ?? '');
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

  const applyCategories = useCallback((data) => {
    setList(data.list);
    setPlantelPendientes(data.plantelPendientes);
    setUserRol(data.userRol);
  }, []);

  const fetchCategories = useCallback(async () => {
    const token = await getToken('userToken');
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const [res, rol, pendRes] = await Promise.all([
      clubApi.get('/categories/mis-categorias', { headers: h }),
      getToken('userRol'),
      clubApi.get('/categories/plantel-pendientes', { headers: h }).catch(() => ({ data: [] })),
    ]);
    return {
      userRol: rol || '',
      list: sortByNombre(res.data || []),
      plantelPendientes: pendRes.data || [],
    };
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: categoriesCacheKey,
    enabled: !!categoriesCacheKey,
    fetchData: fetchCategories,
    onFetched: applyCategories,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las categorías.');
    },
  });

  useFocusEffect(
    useCallback(() => {
      badges?.refresh?.();
      if (categoriesCacheKey) reload({ background: true });
    }, [badges, categoriesCacheKey, reload]),
  );

  const showInitialLoader = loading && list.length === 0 && plantelPendientes.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />

      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Equipo"
        title="Mis categorías"
        subtitle={clubData?.nombre || 'Tu club'}
      />

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          ListHeaderComponent={
            plantelPendientes.length > 0 ? (
              <View style={[styles.pendienteBox, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b' }]}>
                <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 8 }}>
                  Plantel pendiente del club ({plantelPendientes.length})
                </Text>
                {plantelPendientes.map((p) => (
                  <TouchableOpacity
                    key={p._id}
                    style={[styles.pendienteRow, { borderColor: theme.border }]}
                    onPress={() =>
                      navigation.navigate('CoachCategoryDetail', {
                        categoriaId: p._id,
                        nombre: p.nombre,
                        openPlantel: true,
                      })
                    }
                  >
                    <Text style={{ color: theme.text, fontWeight: '600' }}>{p.nombre}</Text>
                    <BadgeDot count={1} />
                    <Ionicons name="chevron-forward" size={18} color={theme.icon} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              Todavía no tenés categorías asignadas. Pedile al administrador que te asigne a esta categoría como{' '}
              {userRol === 'preparador_fisico'
                ? 'preparador/a físico/a'
                : userRol === 'nutricionista'
                  ? 'nutricionista'
                  : userRol === 'psicologo'
                    ? 'psicólogo/a'
                    : 'profesor/a'}
              .
            </Text>
          }
          renderItem={({ item }) => {
            const pendiente = plantelPendientes.some((p) => String(p._id) === String(item._id));
            const alertasCount = item.alertasCount ?? (pendiente ? 1 : 0);
            return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() =>
                navigation.navigate('CoachCategoryDetail', {
                  categoriaId: item._id,
                  nombre: item.nombre,
                  openPlantel: pendiente,
                })
              }
            >
              <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
                <Ionicons name="shirt-outline" size={22} color={colorMarca} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.nombre}</Text>
                {item.disciplina?.nombre ? (
                  <Text style={[styles.rowSub, { color: theme.textMuted }]}>{item.disciplina.nombre}</Text>
                ) : null}
                {pendiente ? (
                  <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                    Armar plantel de la categoría
                  </Text>
                ) : null}
              </View>
              <BadgeDot count={alertasCount} />
              <Ionicons name="chevron-forward" size={20} color={theme.icon} />
            </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  listPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  pendienteBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  pendienteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 17, fontWeight: '700' },
  rowSub: { fontSize: 13, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 20, fontSize: 15, lineHeight: 22 },
});
