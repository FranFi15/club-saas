import React, { useCallback, useContext, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { useBadgesOptional } from '../context/BadgeContext';
import { useMemberOptional } from '../context/MemberContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { navigateFromNotification, getNotificationTarget } from '../utils/notificationNavigation';
import { readScreenCache, writeScreenCache } from '../hooks/useCachedFocusLoad';
import CustomAlert from './CustomAlert';

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

const TIPO_ICON = {
  cuota_vencida: 'alert-circle',
  cuota_proxima: 'time',
  pago_registrado: 'checkmark-circle',
  intercambio_espacio: 'swap-horizontal',
  noticia: 'newspaper',
  documentacion: 'document-attach',
  documentacion_entregada: 'document-text',
  recurso: 'folder-open',
  consulta_pendiente: 'calendar',
  consulta_confirmada: 'checkmark-circle',
  consulta_rechazada: 'close-circle',
  general: 'notifications',
};

export default function NotificationsModal({ visible, onClose }) {
  const navigation = useNavigation();
  const { clubData } = useContext(ClubContext);
  const { theme } = useContext(ThemeContext);
  const badges = useBadgesOptional();
  const member = useMemberOptional();
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [userId, setUserId] = useState('');
  const [userRol, setUserRol] = useState(null);
  const cacheKey =
    clubData?.urlIdentifier && userId
      ? `notifications:${clubData.urlIdentifier}:${userId}`
      : '';

  const [list, setList] = useState(() => readScreenCache(cacheKey)?.notifications ?? []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const fetchGenRef = useRef(0);
  const swipeRefs = useRef(new Map());
  const badgeUnreadRef = useRef(0);
  badgeUnreadRef.current = badges?.notificationsUnread ?? 0;
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    confirmText: 'Aceptar',
    showCancel: false,
    isDanger: false,
    onConfirm: () => {},
  });

  const closeAlert = () => setAlertConfig((prev) => ({ ...prev, visible: false }));

  useEffect(() => {
    if (!visible) return;
    Promise.all([getToken('userId'), getToken('userRol')]).then(([id, rol]) => {
      setUserId(id || '');
      setUserRol(rol || null);
    });
  }, [visible]);

  const navCtx = {
    rol: member?.isTutor ? 'tutor' : userRol,
    isTutor: !!member?.isTutor,
    cuotasEnApp: member?.cuotasEnApp !== false,
  };

  const apiHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const applyFeed = useCallback(
    (notifications, sinLeer) => {
      const seen = new Set();
      const deduped = (notifications || []).filter((n) => {
        const key = String(n.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setList(deduped);
      if (cacheKey) {
        const cached = readScreenCache(cacheKey);
        writeScreenCache(cacheKey, {
          notifications: deduped,
          sinLeer: typeof sinLeer === 'number' ? sinLeer : cached?.sinLeer,
        });
      }
    },
    [cacheKey],
  );

  const fetchNotifications = useCallback(
    async ({ background = false, pull = false } = {}) => {
      if (!clubData?.urlIdentifier || !visible || !cacheKey) return;
      if (pull) {
        fetchGenRef.current += 1;
        inFlightRef.current = false;
      } else if (inFlightRef.current) {
        return;
      }
      const requestGen = ++fetchGenRef.current;
      inFlightRef.current = true;

      if (pull) setRefreshing(true);
      else if (!background && !readScreenCache(cacheKey)) setLoading(true);

      try {
        const { data } = await clubApi.get('/notifications', { headers: await apiHeaders() });
        if (requestGen !== fetchGenRef.current) return;
        applyFeed(data?.notifications, data?.sinLeer);
        badges?.refresh?.();
      } catch {
        if (requestGen !== fetchGenRef.current) return;
        if (!background && !readScreenCache(cacheKey)) {
          applyFeed([], 0);
        }
      } finally {
        inFlightRef.current = false;
        if (requestGen === fetchGenRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [clubData?.urlIdentifier, visible, cacheKey, apiHeaders, applyFeed, badges],
  );

  useEffect(() => {
    if (!visible) return;
    badges?.refresh?.();
  }, [visible, badges]);

  useEffect(() => {
    if (!visible || !cacheKey) {
      if (visible && !cacheKey) setLoading(true);
      return;
    }

    const cached = readScreenCache(cacheKey);
    const cachedList = cached?.notifications;
    const badgeUnread = badgeUnreadRef.current;
    const staleEmptyCache =
      Array.isArray(cachedList) && cachedList.length === 0 && badgeUnread > 0;

    if (cached !== undefined && !staleEmptyCache) {
      setList(cachedList || []);
      setLoading(false);
      fetchNotifications({ background: true });
    } else {
      if (staleEmptyCache) fetchGenRef.current += 1;
      setLoading(true);
      fetchNotifications({ background: false });
    }
  }, [visible, cacheKey, fetchNotifications]);

  const patchCacheNotifications = useCallback(
    (notifications, sinLeer) => {
      if (!cacheKey) return;
      const cached = readScreenCache(cacheKey);
      writeScreenCache(cacheKey, {
        notifications,
        sinLeer: typeof sinLeer === 'number' ? sinLeer : cached?.sinLeer,
      });
    },
    [cacheKey],
  );

  const closeOpenSwipe = () => {
    swipeRefs.current.forEach((ref) => ref?.close?.());
  };

  const markReadInBackground = async (item) => {
    if (item.leida || item.tipo === 'documentacion') return;
    try {
      const encodedId = encodeURIComponent(item.id);
      await clubApi.patch(`/notifications/${encodedId}/read`, null, {
        headers: await apiHeaders(),
      });
      setList((prev) => {
        const next = prev.map((n) => (n.id === item.id ? { ...n, leida: true } : n));
        patchCacheNotifications(next, Math.max(0, next.filter((n) => !n.leida).length));
        return next;
      });
      badges?.refresh?.();
    } catch (e) {
      console.log('markRead', e.response?.data?.message || e.message);
    }
  };

  const onPressItem = async (item) => {
    closeOpenSwipe();

    if (item.atletaId && member?.setActiveAtletaId) {
      member.setActiveAtletaId(item.atletaId);
    }

    const target = getNotificationTarget(item, navCtx);
    onClose();

    if (target) {
      setTimeout(() => {
        navigateFromNotification(navigation, item, navCtx);
      }, 0);
    }

    if (!item.leida && item.tipo !== 'documentacion') {
      markReadInBackground(item);
    }
  };

  const dismissOne = async (item) => {
    closeOpenSwipe();
    fetchGenRef.current += 1;
    const prev = list;
    const next = prev.filter((n) => n.id !== item.id);
    const sinLeer = Math.max(0, next.filter((n) => !n.leida).length);
    setList(next);
    patchCacheNotifications(next, sinLeer);

    try {
      const encodedId = encodeURIComponent(item.id);
      const { data } = await clubApi.delete(`/notifications/${encodedId}`, {
        headers: await apiHeaders(),
      });
      if (data?.notifications) {
        applyFeed(data.notifications, data.sinLeer);
      }
      badges?.refresh?.();
    } catch (e) {
      fetchGenRef.current += 1;
      setList(prev);
      patchCacheNotifications(prev);
      console.log('dismissOne', e.response?.data?.message || e.message);
    }
  };

  const dismissAll = async () => {
    fetchGenRef.current += 1;
    const prev = list;
    setList([]);
    patchCacheNotifications([], 0);

    try {
      const { data } = await clubApi.delete('/notifications', { headers: await apiHeaders() });
      applyFeed(data?.notifications || [], data?.sinLeer ?? 0);
      await badges?.markSeen?.({ news: true, resources: true });
      badges?.refresh?.();
    } catch (e) {
      fetchGenRef.current += 1;
      setList(prev);
      patchCacheNotifications(prev);
      console.log('dismissAll', e.message);
    }
  };

  const confirmDismissAll = () => {
    setAlertConfig({
      visible: true,
      title: 'Limpiar notificaciones',
      message: '¿Querés borrar todas las notificaciones? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar todas',
      showCancel: true,
      isDanger: true,
      onConfirm: () => {
        closeAlert();
        dismissAll();
      },
    });
  };

  const renderRightActions = (item) => (
    <TouchableOpacity
      style={styles.swipeDelete}
      onPress={() => dismissOne(item)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Eliminar notificación"
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={styles.swipeDeleteTxt}>Eliminar</Text>
    </TouchableOpacity>
  );

  const renderNotificationItem = ({ item }) => {
    const icon = TIPO_ICON[item.tipo] || 'notifications-outline';
    const hasTarget = !!getNotificationTarget(item, navCtx);
    const unread = !item.leida;

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeRefs.current.set(item.id, ref);
          else swipeRefs.current.delete(item.id);
        }}
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
        friction={2}
        onSwipeableWillOpen={() => {
          swipeRefs.current.forEach((ref, id) => {
            if (id !== item.id) ref?.close?.();
          });
        }}
      >
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: unread ? colorMarca + '12' : theme.background,
              borderColor: theme.border,
            },
            unread && { borderLeftWidth: 3, borderLeftColor: colorMarca },
          ]}
          onPress={() => (hasTarget ? onPressItem(item) : null)}
          activeOpacity={hasTarget ? 0.75 : 1}
          disabled={!hasTarget}
        >
          <View style={[styles.iconWrap, { backgroundColor: colorMarca + '1A' }]}>
            <Ionicons name={icon} size={22} color={colorMarca} />
          </View>

          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                {item.titulo}
              </Text>
              {unread ? <View style={[styles.unreadDot, { backgroundColor: colorMarca }]} /> : null}
            </View>
            <Text style={[styles.rowMsg, { color: theme.textMuted }]} numberOfLines={2}>
              {item.mensaje}
            </Text>
            <Text style={[styles.rowDate, { color: theme.textMuted }]}>{formatWhen(item.createdAt)}</Text>
          </View>

          {hasTarget ? (
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} style={styles.chevron} />
          ) : null}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const bootstrapping = visible && (!cacheKey || (loading && list.length === 0 && !refreshing));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>Notificaciones</Text>
            <View style={styles.headerActions}>
              {list.length > 0 ? (
                <TouchableOpacity onPress={confirmDismissAll} style={styles.headerBtn}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={styles.deleteAllTxt}>Eliminar todas</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
            </View>
          </View>

          {bootstrapping ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colorMarca} />
            </View>
          ) : (
            <FlatList
              style={styles.listBody}
              data={list}
              keyExtractor={(item) => String(item.id)}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => fetchNotifications({ background: true, pull: true })}
                  tintColor={colorMarca}
                />
              }
              contentContainerStyle={[
                styles.list,
                list.length === 0 ? styles.listEmpty : styles.listGrow,
              ]}
              onScrollBeginDrag={closeOpenSwipe}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="notifications-off-outline" size={40} color={theme.textMuted} />
                  <Text style={[styles.empty, { color: theme.textMuted }]}>
                    No tenés notificaciones por ahora.
                  </Text>
                </View>
              }
              renderItem={renderNotificationItem}
            />
          )}
        </View>
        <CustomAlert
          embedded
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          showCancel={alertConfig.showCancel}
          isDanger={alertConfig.isDanger}
          onConfirm={alertConfig.onConfirm}
          onCancel={closeAlert}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '94%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listBody: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  deleteAllTxt: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  listGrow: { flexGrow: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 32 },
  emptyWrap: { alignItems: 'center', gap: 12 },
  empty: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  rowMsg: { fontSize: 13, lineHeight: 18 },
  rowDate: { fontSize: 11, marginTop: 8, fontWeight: '500' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  chevron: { marginTop: 12, opacity: 0.55 },
  swipeDelete: {
    width: 88,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginLeft: 8,
  },
  swipeDeleteTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
