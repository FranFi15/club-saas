import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { clubApi } from '../../utils/api';
import { clubHeaders } from '../athlete/athleteApi';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import CustomAlert from '../../components/CustomAlert';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import { formatLocalDate, todayYmd } from '../../utils/timeSlots';
import { isoCalendarDateToDisplay } from '../../utils/dateDisplay';

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-AR')}`;
}

function addDaysYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return formatLocalDate(dt);
}

const ESTADO_LABEL = {
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
};

export default function MemberAlquilerScreen() {
  const navigation = useNavigation();
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [tab, setTab] = useState('reservar');
  const [spaces, setSpaces] = useState([]);
  const [spaceId, setSpaceId] = useState('');
  const [fecha, setFecha] = useState(todayYmd());
  const [slots, setSlots] = useState([]);
  const [mine, setMine] = useState([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [bookingKey, setBookingKey] = useState('');
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeAlert = () => setAlertConfig((prev) => ({ ...prev, visible: false }));
  const showAlert = (title, message, options = {}) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      showCancel: options.showCancel || false,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || closeAlert,
      onCancel: options.onCancel || closeAlert,
    });
  };

  const loadSpacesAndMine = useCallback(async () => {
    const headers = await clubHeaders(clubData);
    const [spacesRes, mineRes] = await Promise.all([
      clubApi.get('/rentals/online/spaces', { headers }),
      clubApi.get('/rentals/online/mine', { headers }),
    ]);
    const list = Array.isArray(spacesRes.data) ? spacesRes.data : [];
    setSpaces(list);
    setMine(Array.isArray(mineRes.data) ? mineRes.data : []);
    setSpaceId((current) => {
      if (current && list.some((s) => s._id === current)) return current;
      return list[0]?._id || '';
    });
    return { list };
  }, [clubData?.urlIdentifier]);

  const loadAvailability = useCallback(
    async (sid, day) => {
      if (!sid || !day) {
        setSlots([]);
        return;
      }
      setLoadingDay(true);
      try {
        const headers = await clubHeaders(clubData);
        const res = await clubApi.get('/rentals/online/availability', {
          headers,
          params: { espacio: sid, fecha: day },
        });
        setSlots(Array.isArray(res.data?.slots) ? res.data.slots : []);
      } catch (error) {
        setSlots([]);
        showAlert('Error', error.response?.data?.message || 'No se pudo cargar la disponibilidad.');
      } finally {
        setLoadingDay(false);
      }
    },
    [clubData?.urlIdentifier],
  );

  const { loading, refreshing, onRefresh } = useCachedFocusLoad({
    cacheKey: clubData?.urlIdentifier ? `member-alquiler:${clubData.urlIdentifier}` : '',
    enabled: !!clubData?.urlIdentifier,
    fetchData: loadSpacesAndMine,
    onFetched: async () => {
      /* spaceId updated in loadSpacesAndMine */
    },
    onFetchError: () => showAlert('Error', 'No se pudieron cargar los espacios para alquilar.'),
  });

  React.useEffect(() => {
    if (tab === 'reservar' && spaceId && fecha) {
      loadAvailability(spaceId, fecha);
    }
  }, [tab, spaceId, fecha, loadAvailability]);

  const selectedSpace = useMemo(
    () => spaces.find((s) => s._id === spaceId) || null,
    [spaces, spaceId],
  );

  const payRental = async (rentalId) => {
    const headers = await clubHeaders(clubData);
    const pref = await clubApi.post(
      '/mercadopago/create-preference-rental-member',
      { rentalId },
      { headers },
    );
    const url = pref.data?.linkDePago;
    if (!url) throw new Error('No se recibió el link de pago.');
    await Linking.openURL(url);
  };

  const handleBook = (slot) => {
    if (!selectedSpace || !slot?.disponible) return;
    showAlert(
      'Confirmar reserva',
      `${selectedSpace.nombre}\n${isoCalendarDateToDisplay(fecha)} · ${slot.horaInicio}–${slot.horaFin}\n${fmtMoney(slot.precio)}\n\nSe abre Mercado Pago. Tenés 15 minutos para pagar.`,
      {
        showCancel: true,
        confirmText: 'Pagar',
        onConfirm: async () => {
          closeAlert();
          const key = `${slot.horaInicio}-${slot.horaFin}`;
          setBookingKey(key);
          try {
            const headers = await clubHeaders(clubData);
            const book = await clubApi.post(
              '/rentals/online/book',
              {
                espacio: spaceId,
                fecha,
                horaInicio: slot.horaInicio,
                horaFin: slot.horaFin,
              },
              { headers },
            );
            const rentalId = book.data?.rental?._id;
            await payRental(rentalId);
            await loadSpacesAndMine();
            await loadAvailability(spaceId, fecha);
            setTab('mis');
          } catch (error) {
            showAlert('Error', error.response?.data?.message || error.message || 'No se pudo reservar.');
            await loadAvailability(spaceId, fecha);
          } finally {
            setBookingKey('');
          }
        },
      },
    );
  };

  const handleRetryPay = async (rental) => {
    setBookingKey(String(rental._id));
    try {
      await payRental(rental._id);
      await loadSpacesAndMine();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'No se pudo abrir el pago.');
    } finally {
      setBookingKey('');
    }
  };

  const handleCancelHold = (rental) => {
    showAlert('Cancelar reserva', 'Se libera el horario para otros socios.', {
      showCancel: true,
      confirmText: 'Cancelar reserva',
      onConfirm: async () => {
        closeAlert();
        try {
          const headers = await clubHeaders(clubData);
          await clubApi.delete(`/rentals/online/${rental._id}`, { headers });
          await loadSpacesAndMine();
          if (spaceId && fecha) await loadAvailability(spaceId, fecha);
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'No se pudo cancelar.');
        }
      },
    });
  };

  const showInitial = loading && spaces.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        title="Alquiler"
        subtitle="Reservá un espacio libre y pagá con Mercado Pago"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <View style={[styles.tabs, { borderColor: theme.border }]}>
        {[
          { id: 'reservar', label: 'Reservar' },
          { id: 'mis', label: 'Mis reservas' },
        ].map((item) => {
          const active = tab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.tabBtn, active && { backgroundColor: colorMarca }]}
              onPress={() => setTab(item.id)}
            >
              <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 13 }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showInitial ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colorMarca} />
      ) : tab === 'reservar' ? (
        <FlatList
          data={slots}
          keyExtractor={(item) => `${item.horaInicio}-${item.horaFin}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || loadingDay}
              onRefresh={async () => {
                await onRefresh();
                await loadAvailability(spaceId, fecha);
              }}
              tintColor={colorMarca}
            />
          }
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {!spaces.length ? (
                <Text style={{ color: theme.textMuted, lineHeight: 20, marginBottom: 12 }}>
                  El club todavía no habilitó espacios para alquiler online.
                </Text>
              ) : (
                <>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Espacio</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    {spaces.map((space) => {
                      const active = space._id === spaceId;
                      return (
                        <TouchableOpacity
                          key={space._id}
                          onPress={() => setSpaceId(space._id)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: active ? colorMarca : theme.surface,
                              borderColor: active ? colorMarca : theme.border,
                            },
                          ]}
                        >
                          <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '600' }}>
                            {space.nombre}
                          </Text>
                          <Text style={{ color: active ? '#ffffffcc' : theme.textMuted, fontSize: 11, marginTop: 2 }}>
                            {fmtMoney(space.precioPorSlot)} / turno
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.dateRow}>
                    <TouchableOpacity
                      onPress={() => setFecha((f) => addDaysYmd(f, -1))}
                      style={[styles.dateNav, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    >
                      <Ionicons name="chevron-back" size={18} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.dateLabel, { color: theme.text }]}>
                      {isoCalendarDateToDisplay(fecha)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setFecha((f) => addDaysYmd(f, 1))}
                      style={[styles.dateNav, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    >
                      <Ionicons name="chevron-forward" size={18} color={theme.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setFecha(todayYmd())}>
                      <Text style={{ color: colorMarca, fontWeight: '700', marginLeft: 8 }}>Hoy</Text>
                    </TouchableOpacity>
                  </View>

                  {selectedSpace ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                      Disponible de {selectedSpace.horaInicio} a {selectedSpace.horaFin} · turnos de{' '}
                      {selectedSpace.duracionSlotMinutos} min
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            !loadingDay && spaces.length ? (
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 24 }}>
                No hay turnos en este día.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const busy = bookingKey === `${item.horaInicio}-${item.horaFin}`;
            return (
              <TouchableOpacity
                disabled={!item.disponible || !!bookingKey}
                onPress={() => handleBook(item)}
                style={[
                  styles.slotCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: item.disponible ? colorMarca + '55' : theme.border,
                    opacity: item.disponible ? 1 : 0.55,
                  },
                ]}
              >
                <View>
                  <Text style={[styles.slotTime, { color: theme.text }]}>
                    {item.horaInicio} – {item.horaFin}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.disponible ? 'Libre' : 'Ocupado'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>{fmtMoney(item.precio)}</Text>
                  {item.disponible ? (
                    busy ? (
                      <ActivityIndicator color={colorMarca} style={{ marginTop: 6 }} />
                    ) : (
                      <Text style={{ color: colorMarca, fontWeight: '700', marginTop: 4, fontSize: 12 }}>
                        Reservar
                      </Text>
                    )
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          data={mine}
          keyExtractor={(item) => String(item._id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorMarca} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 24 }}>
              Todavía no tenés reservas online.
            </Text>
          }
          renderItem={({ item }) => {
            const pending = item.estadoReserva === 'pendiente_pago';
            const busy = bookingKey === String(item._id);
            const fechaIso =
              typeof item.fecha === 'string'
                ? item.fecha.slice(0, 10)
                : item.fecha
                  ? new Date(item.fecha).toISOString().slice(0, 10)
                  : '';
            return (
              <View style={[styles.slotCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.slotTime, { color: theme.text }]}>
                    {item.espacio?.nombre || 'Espacio'}
                  </Text>
                  <Text style={{ color: theme.textMuted, marginTop: 2 }}>
                    {isoCalendarDateToDisplay(fechaIso)} · {item.horaInicio}–{item.horaFin}
                  </Text>
                  <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 12 }}>
                    {ESTADO_LABEL[item.estadoReserva] || item.estadoReserva} · {fmtMoney(item.montoTotal)}
                  </Text>
                </View>
                {pending ? (
                  <View style={{ gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleRetryPay(item)}
                      disabled={!!bookingKey}
                      style={[styles.miniBtn, { backgroundColor: colorMarca }]}
                    >
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.miniBtnText}>Pagar</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleCancelHold(item)} disabled={!!bookingKey}>
                      <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 12, textAlign: 'center' }}>
                        Liberar
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 120,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateNav: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 15,
  },
  slotCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  slotTime: {
    fontSize: 15,
    fontWeight: '700',
  },
  miniBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  miniBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
