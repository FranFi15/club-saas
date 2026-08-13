import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { getToken } from '../../utils/storage';
import CustomAlert from '../../components/CustomAlert';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import { useBadges } from '../../context/BadgeContext';
import { readScreenCache, useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

export default function AdminEnrollmentRequestsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const { refresh } = useBadges();
  const requestsCacheKey = clubData?.urlIdentifier ? `admin-enrollment-requests:${clubData.urlIdentifier}` : '';

  const [list, setList] = useState(() => readScreenCache(requestsCacheKey) ?? []);
  const [resolvingId, setResolvingId] = useState(null);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
      onCancel: options.onCancel || (() => setAlertConfig((p) => ({ ...p, visible: false }))),
    });
  };

  const headers = async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchRequests = useCallback(async () => {
    const res = await clubApi.get('/enrollment-requests/pendientes', { headers: await headers() });
    return res.data || [];
  }, [clubData?.urlIdentifier]);

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: requestsCacheKey,
    enabled: !!requestsCacheKey,
    fetchData: fetchRequests,
    onFetched: setList,
    onFetchError: (e) => {
      showAlert('Error', e.response?.data?.message || 'No se pudieron cargar las solicitudes.');
    },
  });

  const showInitialLoader = loading && list.length === 0;

  const resolve = async (id, accion) => {
    setResolvingId(id);
    try {
      await clubApi.patch(
        `/enrollment-requests/${id}/resolver`,
        { accion },
        { headers: await headers() },
      );
      setList((prev) => prev.filter((r) => r._id !== id));
      refresh();
      showAlert(
        'Listo',
        accion === 'aprobar'
          ? 'Los atletas fueron inscriptos en la categoría.'
          : 'Solicitud rechazada.',
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'No se pudo procesar.');
    } finally {
      setResolvingId(null);
    }
  };

  const confirmReject = (item) => {
    showAlert('Rechazar solicitud', '¿Confirmás que estos atletas no se inscriben?', {
      showCancel: true,
      confirmText: 'Rechazar',
      onConfirm: () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        resolve(item._id, 'rechazar');
      },
      onCancel: () => setAlertConfig((p) => ({ ...p, visible: false })),
    });
  };

  const renderItem = ({ item }) => {
    const busy = resolvingId === item._id;
    const nombres = (item.atletas || [])
      .map((a) => `${a.nombre} ${a.apellido}`)
      .join(', ');

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cat, { color: colorMarca }]}>{item.categoria?.nombre}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          Solicita: {item.solicitante?.nombre} {item.solicitante?.apellido} ({item.solicitante?.rol})
        </Text>
        <Text style={[styles.athletes, { color: theme.text }]}>{nombres}</Text>
        {item.mensaje ? (
          <Text style={[styles.msg, { color: theme.textMuted }]}>{item.mensaje}</Text>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colorMarca, opacity: busy ? 0.6 : 1 }]}
            disabled={busy}
            onPress={() => resolve(item._id, 'aprobar')}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnTxt}>Aprobar</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnOutline, { borderColor: '#ef4444', opacity: busy ? 0.6 : 1 }]}
            disabled={busy}
            onPress={() => confirmReject(item)}
          >
            <Text style={{ color: '#ef4444', fontWeight: '700' }}>Rechazar</Text>
          </TouchableOpacity>
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
        showCancel={alertConfig.showCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
      <AdminScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Plantel"
        title="Solicitudes de inscripción"
        subtitle="Pedidos del cuerpo técnico"
        onBack={() => navigation.goBack()}
      />
      {showInitialLoader ? (
        <ActivityIndicator color={colorMarca} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>No hay solicitudes pendientes.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  cat: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 6 },
  athletes: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  msg: { fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800' },
  btnOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
});
