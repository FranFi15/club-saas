import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';

function formatWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MemberEventTicketsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const [tickets, setTickets] = useState([]);

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchTickets = useCallback(async () => {
    const h = await getHeaders();
    const { data } = await clubApi.get('/events/tickets/mine', { headers: h });
    return { list: data || [] };
  }, [getHeaders]);

  const cacheKey = clubData?.urlIdentifier ? `member-event-tickets:${clubData.urlIdentifier}` : '';
  const { loading, onRefresh, refreshing } = useCachedFocusLoad({
    cacheKey,
    enabled: !!clubData?.urlIdentifier,
    fetchData: fetchTickets,
    onFetched: (d) => setTickets(d.list || []),
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.headerLayer}>
        <CoachScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          title="Mis entradas"
          subtitle="Mostrá el QR en la puerta del evento"
          onBack={() => navigation.goBack()}
          showNotifications={false}
        />
      </View>
      {loading && !tickets.length ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colorMarca} />
      ) : (
        <FlatList
          style={styles.list}
          data={tickets}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="ticket-outline" size={40} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin entradas</Text>
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 6 }}>
                Cuando compres una entrada, el QR aparece acá.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const used = item.estado === 'usada';
            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.title, { color: theme.text }]}>{item.eventoTitulo}</Text>
                {item.eventoFechaInicio ? (
                  <Text style={{ color: theme.textMuted, marginBottom: 4 }}>
                    {formatWhen(item.eventoFechaInicio)}
                  </Text>
                ) : null}
                <Text style={{ color: theme.textMuted }}>
                  {item.tipoEntradaNombre}
                  {used ? ' · Usada' : ''}
                </Text>
                {item.titular?.nombre || item.titular?.dni ? (
                  <Text style={{ color: theme.text, fontWeight: '700', marginTop: 4 }}>
                    {`${item.titular.apellido || ''} ${item.titular.nombre || ''}`.trim()}
                    {item.titular.dni ? ` · DNI ${item.titular.dni}` : ''}
                  </Text>
                ) : null}
                <Text style={{ color: theme.textMuted, marginBottom: 14, marginTop: 2 }}>
                  Código {item.codigo}
                </Text>
                {item.qrValue && item.estado === 'valida' ? (
                  <View style={styles.qrWrap}>
                    <QRCode value={item.qrValue} size={200} backgroundColor="#fff" color="#111827" />
                  </View>
                ) : used ? (
                  <View style={[styles.usedBadge, { backgroundColor: `${colorMarca}18` }]}>
                    <Ionicons name="checkmark-circle" size={20} color={colorMarca} />
                    <Text style={{ color: colorMarca, fontWeight: '700', marginLeft: 6 }}>
                      Entrada utilizada
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerLayer: { zIndex: 20, elevation: 20 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    alignSelf: 'stretch',
  },
  qrWrap: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  usedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyWrap: { alignItems: 'center', marginTop: 56, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 12 },
});
