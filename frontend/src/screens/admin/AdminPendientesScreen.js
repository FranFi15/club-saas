import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useBadges } from '../../context/BadgeContext';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import BadgeDot from '../../components/BadgeDot';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';

function navigatePendingItem(navigation, nav) {
  if (!nav?.tab || !navigation) return;

  // Same stack (Gestión)
  if (nav.tab === 'Gestión' && nav.screen) {
    navigation.navigate(nav.screen, nav.params);
    return;
  }

  // Sibling tabs: parent is the bottom tab navigator
  const tabNav = navigation.getParent();
  if (!tabNav?.navigate) return;
  if (nav.screen) {
    tabNav.navigate(nav.tab, { screen: nav.screen, params: nav.params });
  } else {
    tabNav.navigate(nav.tab, nav.params);
  }
}

export default function AdminPendientesScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    try {
      const token = await getToken('userToken');
      const { data } = await clubApi.get('/inbox/pending', {
        headers: {
          'x-club-identifier': clubData.urlIdentifier,
          Authorization: `Bearer ${token}`,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clubData?.urlIdentifier]);

  useFocusEffect(
    useCallback(() => {
      load();
      refresh?.();
    }, [load, refresh]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
    refresh?.();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => navigatePendingItem(navigation, item.nav)}
      activeOpacity={0.75}
    >
      <View style={[styles.iconWrap, { backgroundColor: colorMarca + '18' }]}>
        <Ionicons name={item.icon || 'alert-circle-outline'} size={22} color={colorMarca} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {item.titulo}
        </Text>
        <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={2}>
          {item.mensaje}
        </Text>
      </View>
      <BadgeDot count={item.count || 0} />
      <Ionicons name="chevron-forward" size={20} color={theme.icon} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AdminScreenHeader
        theme={theme}
        colorMarca={colorMarca}
        kicker="Gestión"
        title="Pendientes"
        subtitle="Todo lo que necesita tu atención"
        onBack={() => navigation.goBack()}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colorMarca} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={56} color={theme.icon} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nada pendiente</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                Cuando haya transferencias, docs, solicitudes, alquileres o chats, van a aparecer acá.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 28 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
