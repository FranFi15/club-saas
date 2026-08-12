import React, { useCallback, useContext, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { useBadges } from '../../context/BadgeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import {
  chatHeaders,
  displayName,
  formatChatTime,
  isAdminChatRole,
  rolLabel,
  CHAT_POLL_MS,
} from './chatHelpers';

export default function ChatThreadScreen({ navigation, route }) {
  const conversationId = route.params?.conversationId;
  const initialOther = route.params?.otherUser;
  const initialKind = route.params?.kind || 'direct';
  const initialTitle = route.params?.title || null;
  const initialActive = route.params?.active !== false;

  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const { refresh } = useBadges();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [kind, setKind] = useState(initialKind);
  const [groupTitle, setGroupTitle] = useState(initialTitle);
  const [groupActive, setGroupActive] = useState(initialActive);
  const [otherUser, setOtherUser] = useState(initialOther || null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [myId, setMyId] = useState(null);
  const [sendError, setSendError] = useState('');
  const listRef = useRef(null);
  const pollRef = useRef(null);

  const isGroup = kind === 'category_group';
  const canCompose = !isGroup || groupActive;

  const markRead = useCallback(async () => {
    if (!clubData?.urlIdentifier || !conversationId) return;
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      await clubApi.post(`/chat/conversations/${conversationId}/read`, {}, { headers: h });
      refresh?.();
    } catch {
      /* ignore */
    }
  }, [clubData?.urlIdentifier, conversationId, refresh]);

  const ensureMeta = useCallback(async () => {
    if (!clubData?.urlIdentifier || !conversationId) return;
    if (!isGroup && otherUser) return;
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.get('/chat/conversations', { headers: h });
      const row = (Array.isArray(data) ? data : []).find((c) => String(c._id) === String(conversationId));
      if (!row) return;
      if (row.kind === 'category_group') {
        setKind('category_group');
        setGroupTitle(row.title || 'Chat de categoría');
        setGroupActive(row.active !== false);
      } else if (row.otherUser) {
        setKind('direct');
        setOtherUser(row.otherUser);
      }
    } catch {
      /* ignore */
    }
  }, [isGroup, otherUser, clubData?.urlIdentifier, conversationId]);

  const loadMessages = useCallback(async () => {
    if (!clubData?.urlIdentifier || !conversationId) return;
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.get(`/chat/conversations/${conversationId}/messages`, {
        headers: h,
        params: { limit: 80 },
      });
      setMessages(Array.isArray(data) ? data : []);
      await markRead();
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, [clubData?.urlIdentifier, conversationId, markRead]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const id = await getToken('userId');
        if (active) setMyId(id);
        await ensureMeta();
        await loadMessages();
      })();
      pollRef.current = setInterval(() => {
        if (active) loadMessages();
      }, CHAT_POLL_MS);
      return () => {
        active = false;
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [loadMessages, ensureMeta]),
  );

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !conversationId || !canCompose) return;
    setSending(true);
    setText('');
    setSendError('');
    try {
      const h = await chatHeaders(clubData.urlIdentifier);
      const { data } = await clubApi.post(
        `/chat/conversations/${conversationId}/messages`,
        { body },
        { headers: h },
      );
      setMessages((prev) => [...prev, data]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (e) {
      setText(body);
      setSendError(e.response?.data?.message || 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }) => {
    const mine = myId && String(item.sender?._id || item.sender) === String(myId);
    const showSender = isGroup && !mine;
    return (
      <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
        {showSender ? (
          <Text style={[styles.senderName, { color: theme.textMuted }]} numberOfLines={1}>
            {displayName(item.sender)}
          </Text>
        ) : null}
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: colorMarca }
              : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>{item.body}</Text>
          <Text style={[styles.bubbleTime, { color: mine ? 'rgba(255,255,255,0.75)' : theme.textMuted }]}>
            {formatChatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  const headerKicker = isGroup
    ? 'Grupo'
    : isAdminChatRole(otherUser?.rol)
      ? 'Club'
      : rolLabel(otherUser?.rol);
  const headerTitle = isGroup ? groupTitle || 'Chat de categoría' : displayName(otherUser);
  const headerSubtitle = isGroup
    ? groupActive
      ? 'Chat de categoría'
      : 'Desactivado — solo lectura'
    : 'Chat';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker={headerKicker}
        title={headerTitle}
        subtitle={headerSubtitle}
        onBack={() => navigation.goBack()}
        showNotifications={false}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colorMarca} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item._id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.textMuted }]}>Escribí el primer mensaje.</Text>
            }
          />
        )}
        {!canCompose ? (
          <View style={[styles.readonlyBanner, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>
              El chat grupal de esta categoría está desactivado.
            </Text>
          </View>
        ) : (
          <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            {sendError ? (
              <Text style={[styles.sendErr, { color: '#ef4444' }]} numberOfLines={2}>
                {sendError}
              </Text>
            ) : null}
            <View style={styles.composerRow}>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Escribí un mensaje…"
                placeholderTextColor={theme.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colorMarca, opacity: text.trim() ? 1 : 0.45 }]}
                onPress={send}
                disabled={!text.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 12, flexGrow: 1 },
  bubbleWrap: { marginBottom: 8, maxWidth: '82%' },
  mineWrap: { alignSelf: 'flex-end' },
  theirsWrap: { alignSelf: 'flex-start' },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  composer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  sendErr: { fontSize: 12, marginBottom: 6 },
  readonlyBanner: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
