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
import CoachScreenHeader from '../../components/CoachScreenHeader';
import BadgeDot from '../../components/BadgeDot';
import { clubApi } from '../../utils/api';
import { chatHeaders, displayName, formatChatTime, isAdminChatRole, rolLabel } from './chatHelpers';

export default function ChatInboxScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.get('/chat/conversations', { headers: h });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
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

  const openThread = (item) => {
    navigation.navigate('ChatThread', {
      conversationId: item._id,
      kind: item.kind || 'direct',
      title: item.title || null,
      active: item.active !== false,
      otherUser: item.otherUser || null,
      participantCount: item.participantCount || 0,
    });
  };

  const renderItem = ({ item }) => {
    const isGroup = item.kind === 'category_group';
    const other = item.otherUser;
    const unread = item.unread || 0;
    const name = isGroup ? item.title || 'Chat de categoría' : displayName(other);
    const subtitle = isGroup
      ? item.active === false
        ? 'Grupo desactivado'
        : `${item.participantCount || 0} integrantes`
      : isAdminChatRole(other?.rol)
        ? null
        : rolLabel(other?.rol);

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => openThread(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.avatar, { backgroundColor: colorMarca + '22' }]}>
          <Ionicons name={isGroup ? 'people' : 'person'} size={22} color={colorMarca} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.topLine}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.time, { color: theme.textMuted }]}>
              {formatChatTime(item.lastMessageAt)}
            </Text>
          </View>
          {subtitle ? (
            <Text style={[styles.rol, { color: theme.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <Text
            style={[
              styles.preview,
              { color: unread ? theme.text : theme.textMuted, fontWeight: unread ? '700' : '400' },
            ]}
            numberOfLines={1}
          >
            {item.lastMessagePreview || 'Sin mensajes todavía'}
          </Text>
        </View>
        <BadgeDot count={unread} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Chat"
        title="Mensajes"
        subtitle="Conversaciones del club"
        onBack={() => navigation.goBack()}
        rightAccessory={
          <TouchableOpacity
            onPress={() => navigation.navigate('ChatNew')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Nuevo chat"
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colorMarca} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colorMarca}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Todavía no hay chats</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                Tocá el ícono de arriba a la derecha para iniciar una conversación.
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800' },
  time: { fontSize: 12 },
  rol: { fontSize: 12, marginTop: 2 },
  preview: { fontSize: 13, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
