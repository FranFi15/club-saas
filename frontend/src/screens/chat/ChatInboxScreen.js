import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useBadges } from '../../context/BadgeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import BadgeDot from '../../components/BadgeDot';
import UserAvatar from '../../components/UserAvatar';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import {
  chatHeaders,
  displayName,
  formatChatTime,
  groupChatDefaultTitle,
  isAdminChatRole,
  isGroupChatKind,
  rolLabel,
} from './chatHelpers';

function conversationSearchText(item) {
  const isGroup = isGroupChatKind(item.kind);
  const other = item.otherUser;
  const name = isGroup ? groupChatDefaultTitle(item.kind, item.title) : displayName(other);
  const role = isGroup
    ? item.kind === 'staff_group'
      ? 'personal del club'
      : 'grupo'
    : isAdminChatRole(other?.rol)
      ? 'administración'
      : rolLabel(other?.rol);
  return `${name} ${role} ${item.lastMessagePreview || ''}`.toLowerCase();
}

export default function ChatInboxScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [myRol, setMyRol] = useState('');
  const [staffGroupEnabled, setStaffGroupEnabled] = useState(false);
  const [staffGroupSaving, setStaffGroupSaving] = useState(false);
  const [staffGroupLoaded, setStaffGroupLoaded] = useState(false);

  const isAdmin = isAdminChatRole(myRol);

  useEffect(() => {
    getToken('userRol').then((r) => setMyRol(r || ''));
  }, []);

  const loadStaffGroupSettings = useCallback(async () => {
    if (!clubData?.urlIdentifier) return;
    const rol = (await getToken('userRol')) || '';
    setMyRol(rol);
    if (!isAdminChatRole(rol)) {
      setStaffGroupLoaded(true);
      return;
    }
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.get('/chat/staff-group/settings', { headers: h });
      setStaffGroupEnabled(Boolean(data?.chatGrupalStaffEnabled));
    } catch {
      /* ignore */
    } finally {
      setStaffGroupLoaded(true);
    }
  }, [clubData?.urlIdentifier]);

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

  const reloadAll = useCallback(async () => {
    await Promise.all([load(), loadStaffGroupSettings()]);
  }, [load, loadStaffGroupSettings]);

  useFocusEffect(
    useCallback(() => {
      reloadAll();
      refresh?.();
    }, [reloadAll, refresh]),
  );

  const toggleStaffGroup = async (value) => {
    if (!clubData?.urlIdentifier || staffGroupSaving) return;
    const prev = staffGroupEnabled;
    setStaffGroupEnabled(value);
    setStaffGroupSaving(true);
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      await clubApi.patch('/chat/staff-group/settings', { chatGrupalStaffEnabled: value }, { headers: h });
      await load();
    } catch {
      setStaffGroupEnabled(prev);
    } finally {
      setStaffGroupSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => conversationSearchText(item).includes(q));
  }, [rows, query]);

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
    const isGroup = isGroupChatKind(item.kind);
    const other = item.otherUser;
    const unread = item.unread || 0;
    const name = isGroup ? groupChatDefaultTitle(item.kind, item.title) : displayName(other);
    const subtitle = isGroup
      ? item.active === false
        ? 'Grupo desactivado'
        : item.kind === 'staff_group'
          ? `${item.participantCount || 0} del personal`
          : `${item.participantCount || 0} integrantes`
      : isAdminChatRole(other?.rol)
        ? null
        : rolLabel(other?.rol);

    const groupIcon = item.kind === 'staff_group' ? 'briefcase-outline' : 'people';

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => openThread(item)}
        activeOpacity={0.75}
      >
        {isGroup ? (
          <View style={[styles.avatar, { backgroundColor: colorMarca + '22' }]}>
            <Ionicons name={groupIcon} size={22} color={colorMarca} />
          </View>
        ) : (
          <UserAvatar user={other} size={44} colorMarca={colorMarca} />
        )}
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

  const emptyFiltered = query.trim().length > 0;

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
      {isAdmin && staffGroupLoaded ? (
        <View style={[styles.staffGroupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.staffGroupTitle, { color: theme.text }]}>Chat grupal del personal</Text>
            <Text style={[styles.staffGroupSub, { color: theme.textMuted }]}>
              Incluye administración, control de ingreso, colaboradores y cuerpo técnico.
            </Text>
          </View>
          {staffGroupSaving ? (
            <ActivityIndicator color={colorMarca} />
          ) : (
            <Switch
              value={staffGroupEnabled}
              onValueChange={toggleStaffGroup}
              trackColor={{ false: theme.border, true: colorMarca + '88' }}
              thumbColor={staffGroupEnabled ? colorMarca : '#f4f3f4'}
            />
          )}
        </View>
      ) : null}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.textMuted} />
          <TextInput
            style={[styles.search, { color: theme.text }]}
            placeholder="Buscar chats…"
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Limpiar búsqueda"
            >
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colorMarca} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                reloadAll();
              }}
              tintColor={colorMarca}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={emptyFiltered ? 'search-outline' : 'chatbubbles-outline'}
                size={40}
                color={theme.textMuted}
              />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {emptyFiltered ? 'Sin resultados' : 'Todavía no hay chats'}
              </Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                {emptyFiltered
                  ? 'Probá con otro nombre, rol o texto del último mensaje.'
                  : 'Tocá el ícono de arriba a la derecha para iniciar una conversación.'}
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
  staffGroupCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  staffGroupTitle: { fontSize: 14, fontWeight: '800' },
  staffGroupSub: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  search: { flex: 1, fontSize: 15, padding: 0 },
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
