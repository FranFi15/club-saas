import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  Image,
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
  const [selected, setSelected] = useState(null);

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
          title={selected ? selected.eventoTitulo || 'Entrada' : 'Mis entradas'}
          subtitle={selected ? 'Mostrá el QR en la puerta del evento' : 'Elegí una entrada para ver el QR'}
          onBack={() => (selected ? setSelected(null) : navigation.goBack())}
          showNotifications={false}
        />
      </View>
      {selected ? (
        <View style={styles.detail}>
          {(() => {
            const used = selected.estado === 'usada';
            const who = `${selected.titular?.apellido || ''} ${selected.titular?.nombre || ''}`.trim();
            return (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {selected.eventoImagenUrl ? (
                  <Image source={{ uri: selected.eventoImagenUrl }} style={styles.ticketImage} />
                ) : null}
                <View style={styles.ticketBody}>
                {selected.eventoFechaInicio ? (
                  <Text style={{ color: theme.textMuted, marginBottom: 4 }}>
                    {formatWhen(selected.eventoFechaInicio)}
                    {selected.eventoLugar ? ` · ${selected.eventoLugar}` : ''}
                  </Text>
                ) : null}
                <Text style={{ color: theme.textMuted }}>
                  {selected.tipoEntradaNombre}
                  {selected.asiento?.seccionNombre
                    ? ` · ${selected.asiento.seccionNombre} fila ${selected.asiento.fila} asiento ${selected.asiento.numero}`
                    : ''}
                  {used ? ' · Usada' : ''}
                </Text>
                {who || selected.titular?.dni ? (
                  <Text style={{ color: theme.text, fontWeight: '700', marginTop: 4 }}>
                    {who}
                    {selected.titular?.dni ? ` · DNI ${selected.titular.dni}` : ''}
                  </Text>
                ) : null}
                <Text style={{ color: theme.textMuted, marginBottom: 14, marginTop: 2 }}>
                  Código {selected.codigo}
                </Text>
                {selected.qrValue && selected.estado === 'valida' ? (
                  <View style={styles.qrWrap}>
                    <QRCode value={selected.qrValue} size={220} backgroundColor="#fff" color="#111827" />
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
              </View>
            );
          })()}
        </View>
      ) : loading && !tickets.length ? (
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
                Cuando compres una entrada, aparece en esta lista.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const used = item.estado === 'usada';
            const who = `${item.titular?.apellido || ''} ${item.titular?.nombre || ''}`.trim();
            return (
              <TouchableOpacity
                onPress={() => setSelected(item)}
                activeOpacity={0.85}
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                {item.eventoImagenUrl ? (
                  <Image source={{ uri: item.eventoImagenUrl }} style={styles.rowImage} />
                ) : (
                  <View style={[styles.rowIcon, { backgroundColor: `${colorMarca}18` }]}>
                    <Ionicons name="ticket-outline" size={22} color={colorMarca} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                    {item.eventoTitulo || 'Evento'}
                  </Text>
                  {item.eventoFechaInicio ? (
                    <Text style={{ color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
                      {formatWhen(item.eventoFechaInicio)}
                    </Text>
                  ) : null}
                  <Text style={{ color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {[
                      item.tipoEntradaNombre,
                      item.asiento?.seccionNombre
                        ? `${item.asiento.seccionNombre} fila ${item.asiento.fila} asiento ${item.asiento.numero}`
                        : null,
                      who,
                      used ? 'Usada' : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
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
  headerLayer: { zIndex: 20, elevation: 20 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  detail: { flex: 1, padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ticketImage: { width: '100%', height: 160 },
  ticketBody: { padding: 16, alignItems: 'center' },
  rowImage: { width: 56, height: 56, borderRadius: 12 },
  title: {
    fontSize: 16,
    fontWeight: '800',
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
