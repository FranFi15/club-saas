import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import NutriBodyFatMethodHeaderPicker from '../../components/NutriBodyFatMethodHeaderPicker';
import UserAvatar from '../../components/UserAvatar';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { sortEnrollmentsByAtleta } from '../../utils/listSort';

const EMPTY_BY_ROL = {
  nutricionista:
    'Todavía no tenés atletas en tus categorías. Pedile al administrador que te asigne como nutricionista en cada categoría.',
  preparador_fisico:
    'Todavía no tenés atletas en tus categorías. Pedile al administrador que te asigne como preparador físico en cada categoría.',
  profe:
    'Todavía no tenés atletas en tus categorías. Pedile al administrador que te asigne como profesor en cada categoría.',
  psicologo:
    'Todavía no tenés atletas en tus categorías. Pedile al administrador que te asigne como psicólogo en cada categoría.',
};

function matchesSearch(row, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const a = row.atleta;
  const name = `${a?.nombre || ''} ${a?.apellido || ''}`.toLowerCase();
  const dni = String(a?.dni || '').toLowerCase();
  const cats = (row.categorias || []).map((c) => `${c.nombre} ${c.disciplina?.nombre || ''}`).join(' ');
  return name.includes(needle) || dni.includes(needle) || cats.toLowerCase().includes(needle);
}

function categoryLabel(categorias) {
  if (!categorias?.length) return '';
  if (categorias.length === 1) return categorias[0].nombre;
  return categorias.map((c) => c.nombre).join(' · ');
}

/** Lista de atletas del staff (nutri, prep. físico, etc.) con acceso a mediciones y wellness. */
export default function StaffAthleteRosterScreen({ navigation, route }) {
  const categoriesScreen = route?.params?.categoriesScreen ?? 'CoachCategories';
  const showWellness = route?.params?.showWellness !== false;

  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const rosterCacheKey = clubData?.urlIdentifier ? `staff-roster:${clubData.urlIdentifier}` : '';

  const [list, setList] = useState(() => readScreenCache(rosterCacheKey)?.list ?? []);
  const [userRol, setUserRol] = useState(() => readScreenCache(rosterCacheKey)?.userRol ?? '');
  const showMeasurements =
    route?.params?.showMeasurements !== false && userRol !== 'psicologo';
  const [search, setSearch] = useState('');
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

  const applyRoster = useCallback((data) => {
    setList(data.list);
    setUserRol(data.userRol);
  }, []);

  const fetchRoster = useCallback(async () => {
    const token = await getToken('userToken');
    const rol = (await getToken('userRol')) || '';
    const h = {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
    const res = await clubApi.get('/categories/mis-atletas', { headers: h });
    return { list: res.data || [], userRol: rol };
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: rosterCacheKey,
    enabled: !!rosterCacheKey,
    fetchData: fetchRoster,
    onFetched: applyRoster,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudo cargar el plantel.');
    },
  });

  const showInitialLoader = loading && list.length === 0;

  const filtered = useMemo(
    () => sortEnrollmentsByAtleta(list.filter((row) => matchesSearch(row, search))),
    [list, search],
  );

  const emptyRosterMsg =
    EMPTY_BY_ROL[userRol] ||
    'Todavía no tenés atletas en tus categorías. Pedile al administrador que te asigne en cada categoría.';

  const renderAthlete = ({ item }) => {
    const a = item.atleta;
    if (!a) return null;
    const nombre = `${a.nombre || ''} ${a.apellido || ''}`.trim();
    const primaryCat = item.categorias?.[0];

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardTop}>
          <UserAvatar user={a} size={48} colorMarca={colorMarca} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {nombre}
            </Text>
            {a.dni ? (
              <Text style={[styles.dni, { color: theme.textMuted }]}>DNI {a.dni}</Text>
            ) : null}
            <Text style={[styles.cats, { color: theme.textMuted }]} numberOfLines={2}>
              {categoryLabel(item.categorias)}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {showMeasurements ? (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  borderColor: colorMarca,
                  backgroundColor: colorMarca + '14',
                  flex: showWellness ? 1 : undefined,
                  flexGrow: showWellness ? undefined : 1,
                },
              ]}
              onPress={() =>
                navigation.navigate('CoachMeasurement', {
                  atletaId: a._id,
                  atletaNombre: nombre,
                })
              }
            >
              <Ionicons name="analytics-outline" size={18} color={colorMarca} />
              <Text style={[styles.actionTxt, { color: colorMarca }]}>Mediciones</Text>
            </TouchableOpacity>
          ) : null}
          {showWellness ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: theme.border, flex: 1 }]}
              onPress={() =>
                navigation.navigate('CoachWellness', {
                  atletaId: a._id,
                  atletaNombre: nombre,
                  categoriaId: primaryCat?._id,
                })
              }
            >
              <Ionicons name="pulse-outline" size={18} color={theme.text} />
              <Text style={[styles.actionTxt, { color: theme.text }]}>Wellness</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

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
        title="Mis atletas"
        subtitle={
          list.length
            ? `${list.length} atleta${list.length === 1 ? '' : 's'} a tu cargo`
            : clubData?.nombre || 'Tu club'
        }
        rightAccessory={
          userRol === 'nutricionista' ? (
            <NutriBodyFatMethodHeaderPicker theme={theme} colorMarca={colorMarca} />
          ) : userRol === 'psicologo' ? null : (
            <TouchableOpacity
              onPress={() => navigation.navigate(categoriesScreen)}
              hitSlop={10}
              style={styles.headerLinkBtn}
              accessibilityLabel="Ver por categoría"
            >
              <Ionicons name="grid-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )
        }
      />

      <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={20} color={theme.icon} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Buscar por nombre, DNI o categoría…"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={theme.icon} />
          </TouchableOpacity>
        ) : null}
      </View>

      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.atleta._id)}
          renderItem={renderAthlete}
          contentContainerStyle={styles.listPad}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListHeaderComponent={
            filtered.length !== list.length ? (
              <Text style={[styles.countHint, { color: theme.textMuted }]}>
                Mostrando {filtered.length} de {list.length}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {list.length === 0 ? emptyRosterMsg : 'Ningún atleta coincide con la búsqueda.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerLinkBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  listPad: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  countHint: { fontSize: 12, marginBottom: 8 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  name: { fontSize: 17, fontWeight: '800' },
  dni: { fontSize: 12, marginTop: 2 },
  cats: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionTxt: { fontSize: 13, fontWeight: '700' },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
    fontSize: 15,
    lineHeight: 22,
  },
});
