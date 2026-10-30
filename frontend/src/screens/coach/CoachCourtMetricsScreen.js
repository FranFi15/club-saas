import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import DesignCard from '../../components/DesignCard';
import CustomAlert from '../../components/CustomAlert';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { useClientInfiniteScroll } from '../../hooks/useClientInfiniteScroll';
import { deporteLabel, tipoMedicionLabel } from '../../constants/courtMetrics';

export default function CoachCourtMetricsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const cc = clubData?.primaryColor || '#3b82f6';

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const [metrics, setMetrics] = useState([]);
  const {
    visibleItems: visibleMetrics,
    onEndReached,
    onEndReachedThreshold,
    ListFooterComponent,
  } = useClientInfiniteScroll(metrics, {
    pageSize: 20,
    colorMarca: cc,
    theme,
  });
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    confirmText: 'OK',
    showCancel: false,
    isDanger: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showAlert = (title, message, extras = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      confirmText: extras.confirmText || 'OK',
      showCancel: !!extras.showCancel,
      isDanger: !!extras.isDanger,
      onConfirm: () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        extras.onConfirm?.();
      },
      onCancel: () => {
        setAlertConfig((p) => ({ ...p, visible: false }));
        extras.onCancel?.();
      },
    });
  };

  const { loading, refreshing, onRefresh, reload } = useCachedFocusLoad({
    cacheKey: clubData?.urlIdentifier ? `court-metrics:${clubData.urlIdentifier}` : '',
    enabled: !!clubData?.urlIdentifier,
    fetchData: async () => {
      const h = await getHeaders();
      const { data } = await clubApi.get('/court-metrics', { headers: h });
      return { metrics: data?.metrics || [] };
    },
    onFetched: (d) => setMetrics(d.metrics || []),
  });

  const confirmDelete = (item) => {
    showAlert(
      'Eliminar métrica',
      `¿Eliminar "${item.titulo}"? Se borran también los resultados registrados.`,
      {
        confirmText: 'Eliminar',
        showCancel: true,
        isDanger: true,
        onConfirm: async () => {
          try {
            const h = await getHeaders();
            await clubApi.delete(`/court-metrics/${item._id}`, { headers: h });
            setMetrics((prev) => prev.filter((m) => String(m._id) !== String(item._id)));
            reload({ background: true });
          } catch (e) {
            showAlert('Error', e.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={cc}
        theme={theme}
        kicker="Métricas"
        title="Individual"
        subtitle="Shoot-arounds y métricas espaciales reutilizables"
        onBack={() => navigation.goBack()}
      />

      {loading && !metrics.length ? (
        <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visibleMetrics}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cc} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={onEndReachedThreshold}
          ListFooterComponent={ListFooterComponent}
          ListEmptyComponent={
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
              Todavía no hay métricas individuales. Creá un shoot-around.
            </Text>
          }
          renderItem={({ item }) => (
            <DesignCard
              theme={theme}
              isDarkMode={isDarkMode}
              accent={cc}
              style={{ marginBottom: 10 }}
              contentStyle={{ padding: 14 }}
            >
              <View style={styles.cardTop}>
                <TouchableOpacity
                  style={{ flex: 1, marginRight: 8 }}
                  onPress={() =>
                    navigation.navigate('CoachCourtMetricDetail', {
                      metricId: item._id,
                      tipoMedicion: item.tipoMedicion,
                    })
                  }
                  activeOpacity={0.85}
                >
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{item.titulo}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>
                    {deporteLabel(item.deporte)} · {tipoMedicionLabel(item.tipoMedicion)} ·{' '}
                    {(item.pines || []).length} punto(s)
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                    {(item.categorias || []).map((c) => c.nombre).join(', ') || 'Sin categorías'}
                    {(item.atletas || []).length ? ` · ${item.atletas.length} atleta(s)` : ''}
                  </Text>
                </TouchableOpacity>
                <View style={styles.actionsCol}>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: isDarkMode ? '#4b5563' : '#6b7280' }]}
                    onPress={() =>
                      navigation.navigate('CoachCourtMetricEdit', {
                        metricId: item._id,
                        onSaved: () => reload({ background: true }),
                      })
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="pencil" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: '#ef4444', marginTop: 6 }]}
                    onPress={() => confirmDelete(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </DesignCard>
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: cc }]}
        onPress={() => navigation.navigate('CoachCourtMetricEdit', { onSaved: () => reload({ background: true }) })}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        showCancel={alertConfig.showCancel}
        isDanger={alertConfig.isDanger}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  actionsCol: {
    alignItems: 'center',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
