import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { clubApi } from '../../utils/api';
import { chatHeaders, displayName, rolLabel } from './chatHelpers';

export default function ChatNewScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(null);

  const load = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.get('/chat/recipients', { headers: h });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clubData?.urlIdentifier]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = rows.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${u.nombre || ''} ${u.apellido || ''} ${u.email || ''} ${rolLabel(u.rol)}`.toLowerCase();
    return hay.includes(q);
  });

  const startChat = async (user) => {
    if (creating) return;
    setCreating(String(user._id));
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.post('/chat/conversations', { userId: user._id }, { headers: h });
      navigation.replace('ChatThread', {
        conversationId: data._id,
        otherUser: data.otherUser || user,
      });
    } catch {
      setCreating(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Chat"
        title="Nuevo mensaje"
        subtitle="Elegí con quién querés hablar"
        onBack={() => navigation.goBack()}
        showNotifications={false}
      />
      <View style={styles.searchWrap}>
        <TextInput
          style={[
            styles.search,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
          ]}
          placeholder="Buscar por nombre…"
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colorMarca} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              No hay destinatarios disponibles con tus permisos actuales.
            </Text>
          }
          renderItem={({ item }) => {
            const busy = creating === String(item._id);
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => startChat(item)}
                disabled={!!creating}
                activeOpacity={0.75}
              >
                <View style={[styles.avatar, { backgroundColor: colorMarca + '22' }]}>
                  <Ionicons name="person" size={20} color={colorMarca} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]}>{displayName(item)}</Text>
                  <Text style={[styles.rol, { color: theme.textMuted }]}>{rolLabel(item.rol)}</Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colorMarca} />
                ) : (
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={colorMarca} />
                )}
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
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '800' },
  rol: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, lineHeight: 20, paddingHorizontal: 16 },
});
