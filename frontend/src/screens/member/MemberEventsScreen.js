import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  ScrollView,
  Linking,
  RefreshControl,
  Image,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import ClubSpinLoader from '../../components/ClubSpinLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import { getToken } from '../../utils/storage';
import { clubApi } from '../../utils/api';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import CustomAlert from '../../components/CustomAlert';
import StadiumSeatPicker from '../../components/StadiumSeatPicker';
import { useCachedFocusLoad } from '../../hooks/useCachedFocusLoad';
import { useMember } from '../../context/MemberContext';

function normalizeTicketDni(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11) return digits.slice(2, 10);
  return digits;
}

function holderFromProfile(p) {
  return {
    nombre: String(p?.nombre || '').trim(),
    apellido: String(p?.apellido || '').trim(),
    dni: normalizeTicketDni(p?.dni),
  };
}

function formatWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function tipoPriceText(tipo, sections) {
  const prices = (sections || [])
    .filter((section) => String(section.tipoEntrada) === String(tipo?._id) && section.precio != null && section.precio !== '')
    .map((section) => Number(section.precio) || 0);
  if (!prices.length) return Number(tipo?.precio) === 0 ? 'Gratis' : `$${formatMoney(tipo?.precio)}`;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return min === 0 ? 'Gratis' : `$${formatMoney(min)}`;
  return `$${formatMoney(min)} a $${formatMoney(max)}`;
}

function lowestPrice(tipos) {
  const prices = (tipos || []).map((t) => Number(t.precio) || 0);
  if (!prices.length) return null;
  return Math.min(...prices);
}

export default function MemberEventsScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { profile, isTutor, hijos } = useMember();
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const { height: windowHeight } = useWindowDimensions();
  const buyScrollMax = Math.max(280, Math.round(windowHeight * 0.66));

  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tipoId, setTipoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [holders, setHolders] = useState([{ nombre: '', apellido: '', dni: '' }]);
  const holdersRef = useRef(holders);
  holdersRef.current = holders;
  const holderTouched = useRef(false);
  const [buyNotice, setBuyNotice] = useState('');
  const [seats, setSeats] = useState([]);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [buying, setBuying] = useState(false);
  const quoteSeq = useRef(0);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const closeAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));
  const showAlert = (title, message) =>
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm: () => closeAlert(),
    });

  const getHeaders = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubData.urlIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubData?.urlIdentifier]);

  const fetchEvents = useCallback(async () => {
    const h = await getHeaders();
    const { data } = await clubApi.get('/events', { headers: h });
    return { list: data || [] };
  }, [getHeaders]);

  const cacheKey = clubData?.urlIdentifier ? `member-events:${clubData.urlIdentifier}` : '';
  const { loading, onRefresh, refreshing } = useCachedFocusLoad({
    cacheKey,
    enabled: !!clubData?.urlIdentifier,
    fetchData: fetchEvents,
    onFetched: (d) => setEvents(d.list || []),
  });

  const openBuy = (ev) => {
    holderTouched.current = false;
    setBuyNotice('');
    setSelected(ev);
    const first = (ev.tiposEntrada || [])[0];
    setTipoId(first ? String(first._id) : '');
    setCantidad(1);
    setQuote(null);
    setSeats([]);
    setHolders([holderFromProfile(profile)]);
  };

  useEffect(() => {
    if (!selected || holderTouched.current) return;
    const next = holderFromProfile(profile);
    if (!next.nombre && !next.apellido && !next.dni) return;
    setHolders((prev) => {
      const first = prev[0] || { nombre: '', apellido: '', dni: '' };
      if (first.nombre || first.apellido || first.dni) return prev;
      const copy = prev.slice();
      copy[0] = next;
      return copy;
    });
  }, [selected, profile]);

  const closeBuy = () => {
    setSelected(null);
    setQuote(null);
    setBuyNotice('');
    setSeats([]);
    quoteSeq.current += 1;
  };

  const asistentesForQuote = useCallback(() => {
    const me = holderFromProfile(profile);
    const source = holdersRef.current;
    return Array.from({ length: cantidad }, (_, i) => {
      const h = source[i] || {};
      const seat = seatsRef.current[i];
      return {
        nombre: String(h.nombre || '').trim() || (i === 0 ? me.nombre : ''),
        apellido: String(h.apellido || '').trim() || (i === 0 ? me.apellido : ''),
        dni: normalizeTicketDni(h.dni) || (i === 0 ? me.dni : ''),
        asiento: seat
          ? {
              seccionId: seat.seccionId,
              seccionNombre: seat.seccionNombre,
              fila: seat.fila,
              numero: seat.numero,
            }
          : undefined,
      };
    });
  }, [cantidad, profile]);

  const runQuote = useCallback(
    async (eventId, nextTipoId, nextAsistentes) => {
      if (!eventId || !nextTipoId) return;
      const seq = ++quoteSeq.current;
      setQuoting(true);
      try {
        const h = await getHeaders();
        const { data } = await clubApi.post(
          `/events/${eventId}/quote`,
          { tipoEntradaId: nextTipoId, cantidad: nextAsistentes.length, asistentes: nextAsistentes },
          { headers: h },
        );
        if (seq === quoteSeq.current) setQuote(data);
      } catch (e) {
        if (seq === quoteSeq.current) {
          setQuote(null);
          showAlert('Cotización', e.response?.data?.message || 'No se pudo cotizar.');
        }
      } finally {
        if (seq === quoteSeq.current) setQuoting(false);
      }
    },
    [getHeaders],
  );

  const holderKey = holders
    .slice(0, cantidad)
    .map((h) => `${h.nombre}|${h.apellido}|${h.dni}`)
    .join(';');
  const seatKey = seats.map((seat) => `${seat.seccionId}:${seat.fila}:${seat.numero}`).join(';');

  useEffect(() => {
    if (!selected?._id || !tipoId) return undefined;
    const t = setTimeout(() => {
      runQuote(selected._id, tipoId, asistentesForQuote());
    }, 280);
    return () => clearTimeout(t);
  }, [selected?._id, tipoId, cantidad, holderKey, seatKey, asistentesForQuote, runQuote]);

  useEffect(() => {
    const seated = (selected?.secciones || []).some(
      (section) => String(section.tipoEntrada) === String(tipoId),
    );
    if (!seated || !seats.length) return;
    setCantidad(Math.max(1, Math.min(20, seats.length)));
    setHolders((prev) => {
      const list = prev.slice(0, seats.length);
      while (list.length < seats.length) list.push({ nombre: '', apellido: '', dni: '' });
      return list;
    });
  }, [seats, tipoId, selected]);

  const changeQty = (delta) => {
    setCantidad((q) => {
      const next = Math.max(1, Math.min(20, Number(q) + delta));
      setHolders((prev) => {
        const list = prev.slice(0, next);
        while (list.length < next) list.push({ nombre: '', apellido: '', dni: '' });
        return list;
      });
      return next;
    });
  };

  const updateHolder = (index, field, value) => {
    holderTouched.current = true;
    setBuyNotice('');
    setHolders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  };

  const useAthleteOnTicket = (index, hijo) => {
    holderTouched.current = true;
    setBuyNotice('');
    setHolders((prev) =>
      prev.map((h, i) =>
        i === index
          ? {
              ...h,
              nombre: hijo?.nombre || '',
              apellido: hijo?.apellido || '',
              dni: normalizeTicketDni(hijo?.dni),
            }
          : h,
      ),
    );
  };

  const buy = async () => {
    if (!selected?._id || !tipoId) return;
    const seated = (selected.secciones || []).some((section) => String(section.tipoEntrada) === String(tipoId));
    if (seated && seats.length !== cantidad) {
      setBuyNotice('Elegí un asiento en el plano.');
      return;
    }
    const me = holderFromProfile(profile);
    const source = holdersRef.current;
    const asistentes = Array.from({ length: cantidad }, (_, i) => {
      const h = source[i] || {};
      return {
        nombre: String(h.nombre || '').trim() || (i === 0 ? me.nombre : ''),
        apellido: String(h.apellido || '').trim() || (i === 0 ? me.apellido : ''),
        dni: normalizeTicketDni(h.dni) || (i === 0 ? me.dni : ''),
        asiento: seats[i]
          ? {
              seccionId: seats[i].seccionId,
              seccionNombre: seats[i].seccionNombre,
              fila: seats[i].fila,
              numero: seats[i].numero,
            }
          : undefined,
      };
    });
    const seen = new Set();
    for (let i = 0; i < cantidad; i += 1) {
      const person = asistentes[i] || { nombre: '', apellido: '', dni: '' };
      if (!person.nombre || !person.apellido) {
        setBuyNotice(`Entrada ${i + 1}: completá nombre y apellido.`);
        return;
      }
      if (person.dni.length < 6 || person.dni.length > 8) {
        setBuyNotice(`Entrada ${i + 1}: el DNI tiene que tener entre 6 y 8 números.`);
        return;
      }
      if (seen.has(person.dni)) {
        setBuyNotice(`El DNI ${person.dni} está repetido. Cada entrada es de una persona.`);
        return;
      }
      seen.add(person.dni);
    }
    setBuyNotice('');
    setBuying(true);
    try {
      const h = await getHeaders();
      const { data } = await clubApi.post(
        `/events/${selected._id}/checkout`,
        { tipoEntradaId: tipoId, cantidad, asistentes },
        { headers: h },
      );
      closeBuy();
      if (data.linkDePago) {
        await Linking.openURL(data.linkDePago);
        showAlert(
          'Pago',
          'Completá el pago en Mercado Pago. Después vas a ver tus entradas en Mis entradas.',
        );
      } else {
        showAlert('Listo', 'Entradas emitidas. Las encontrás en Mis entradas.');
        navigation.navigate('MemberEventTickets');
      }
    } catch (e) {
      showAlert('Compra', e.response?.data?.message || 'No se pudo comprar.');
    } finally {
      setBuying(false);
    }
  };

  const selectedTipo = (selected?.tiposEntrada || []).find((t) => String(t._id) === String(tipoId));

  const renderEvent = ({ item }) => {
    const from = lowestPrice(item.tiposEntrada);
    const tiposCount = (item.tiposEntrada || []).length;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => openBuy(item)}
        activeOpacity={0.85}
      >
        {item.imagenUrl ? (
          <Image source={{ uri: item.imagenUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImageEmpty, { backgroundColor: `${colorMarca}22` }]}>
            <Ionicons name="calendar-outline" size={36} color={colorMarca} />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.titulo}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={theme.textMuted} />
            <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
              {formatWhen(item.fechaInicio)}
            </Text>
          </View>
          {item.lugar ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
                {item.lugar}
              </Text>
            </View>
          ) : null}
          <View style={styles.cardFooter}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>
              {from == null ? '—' : from === 0 ? 'Gratis' : `Desde $${formatMoney(from)}`}
            </Text>
            <View style={[styles.ctaPill, { backgroundColor: `${colorMarca}22` }]}>
              <Text style={{ color: colorMarca, fontWeight: '700', fontSize: 13 }}>
                {tiposCount > 1 ? `${tiposCount} tipos` : 'Comprar'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colorMarca} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.headerLayer}>
        <CoachScreenHeader
          colorMarca={colorMarca}
          theme={theme}
          kicker="Club"
          title="Eventos"
          subtitle="Entradas para socios y atletas del club"
          onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
          showNotifications={false}
          rightAccessory={
            <TouchableOpacity
              onPress={() => navigation.navigate('MemberEventTickets')}
              hitSlop={10}
              style={styles.headerIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Mis entradas"
            >
              <Ionicons name="ticket-outline" size={18} color="#fff" />
              <Text style={styles.headerIconBtnTxt}>Mis entradas</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={styles.body}>
        {loading && !events.length ? (
          <ClubSpinLoader size={56} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            style={styles.list}
            data={events}
            keyExtractor={(item) => String(item._id)}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colorMarca} />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="calendar-outline" size={40} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin eventos</Text>
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 6 }}>
                  Cuando el club publique un evento, lo vas a ver acá.
                </Text>
              </View>
            }
            renderItem={renderEvent}
          />
        )}
      </View>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={closeBuy}>
        <KeyboardAvoidingView
          style={[styles.buyOverlay, { height: windowHeight }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.buyBackdrop} onPress={closeBuy} accessibilityLabel="Cerrar" />
          <SafeAreaView
            edges={['bottom']}
            style={[styles.buySheet, { backgroundColor: theme.background }]}
          >
          <View style={[styles.buyHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={closeBuy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={[
                styles.buyBack,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9' },
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.buyTitle, { color: theme.text }]} numberOfLines={1}>
                {selected?.titulo || 'Evento'}
              </Text>
              <Text style={[styles.buySub, { color: theme.textMuted }]} numberOfLines={1}>
                {[formatWhen(selected?.fechaInicio), selected?.lugar].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <ScrollView
            style={{ maxHeight: buyScrollMax }}
            contentContainerStyle={styles.detailScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {selected?.imagenUrl ? (
              <Image
                source={{ uri: selected.imagenUrl }}
                style={styles.detailImage}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.detailBody}>
            {selected?.descripcion ? (
              <Text style={[styles.desc, { color: theme.text }]} numberOfLines={3}>
                {selected.descripcion}
              </Text>
            ) : null}

            <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 4 }]}>Tipo de entrada</Text>
            {(selected?.tiposEntrada || []).map((t) => {
              const on = String(t._id) === String(tipoId);
              const soldOut = Number(t.disponibles) <= 0;
              return (
                <TouchableOpacity
                  key={t._id}
                  disabled={soldOut}
                  onPress={() => {
                    setTipoId(String(t._id));
                    setSeats([]);
                  }}
                  style={[
                    styles.tipoRow,
                    {
                      borderColor: on ? colorMarca : theme.border,
                      backgroundColor: on ? `${colorMarca}14` : theme.surface,
                      opacity: soldOut ? 0.5 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
                      {t.nombre}
                    </Text>
                    <Text style={{ color: theme.textMuted, marginTop: 2, fontSize: 13 }}>
                      {soldOut
                        ? 'Agotadas'
                        : `${t.disponibles} disponibles`}
                    </Text>
                  </View>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>
                    {tipoPriceText(t, selected?.secciones)}
                  </Text>
                  {on ? (
                    <Ionicons name="checkmark-circle" size={22} color={colorMarca} style={{ marginLeft: 8 }} />
                  ) : (
                    <View style={{ width: 22, marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              );
            })}

            {(selected?.secciones || []).some((section) => String(section.tipoEntrada) === String(tipoId)) ? (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Elegí tu lugar</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
                  Tocá un sector y después el asiento. Los ocupados no se pueden elegir.
                </Text>
                <StadiumSeatPicker
                  imageUrl={selected?.mapaEstadioUrl}
                  sections={(selected?.secciones || []).filter(
                    (section) => String(section.tipoEntrada) === String(tipoId),
                  )}
                  occupied={quote?.ocupados || []}
                  selected={seats}
                  onChange={setSeats}
                  color={colorMarca}
                  theme={theme}
                />
              </View>
            ) : (
            <View
              style={[
                styles.qtyRow,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text style={[styles.qtyLabel, { color: theme.text }]}>Cantidad</Text>
              <TouchableOpacity
                style={[
                  styles.qtyBtn,
                  { backgroundColor: cantidad <= 1 ? theme.border : colorMarca },
                ]}
                onPress={() => changeQty(-1)}
                disabled={cantidad <= 1}
                accessibilityLabel="Menos entradas"
              >
                <Ionicons name="remove" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.qtyValue, { color: theme.text }]}>{cantidad}</Text>
              <TouchableOpacity
                style={[
                  styles.qtyBtn,
                  {
                    backgroundColor: colorMarca,
                    opacity:
                      selectedTipo && cantidad >= Math.max(1, Number(selectedTipo.disponibles) || 1)
                        ? 0.4
                        : 1,
                  },
                ]}
                onPress={() => changeQty(1)}
                disabled={
                  selectedTipo && cantidad >= Math.max(1, Number(selectedTipo.disponibles) || 1)
                }
                accessibilityLabel="Más entradas"
              >
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            )}

            <Text style={[styles.sectionLabel, { color: theme.text }]}>Quién entra</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
              Cada entrada lleva el nombre y el DNI de la persona que va a pasar.
            </Text>
            {holders.slice(0, cantidad).map((person, index) => (
              <View
                key={`holder-${index}`}
                style={[
                  styles.holderCard,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                ]}
              >
                <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 8 }}>
                  Entrada {index + 1}
                  {seats[index]
                    ? ` · ${seats[index].seccionNombre} fila ${seats[index].fila} asiento ${seats[index].numero}`
                    : ''}
                </Text>
                <TextInput
                  value={person.nombre}
                  onChangeText={(v) => updateHolder(index, 'nombre', v)}
                  placeholder="Nombre"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.holderInput, { color: theme.text, borderColor: theme.border }]}
                />
                <TextInput
                  value={person.apellido}
                  onChangeText={(v) => updateHolder(index, 'apellido', v)}
                  placeholder="Apellido"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.holderInput, { color: theme.text, borderColor: theme.border }]}
                />
                <TextInput
                  value={person.dni}
                  onChangeText={(v) => updateHolder(index, 'dni', v.replace(/\D/g, ''))}
                  placeholder="DNI"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  style={[styles.holderInput, { color: theme.text, borderColor: theme.border }]}
                />
                {isTutor && (hijos || []).length ? (
                  <View style={styles.athleteRow}>
                    {(hijos || []).map((hijo) => (
                      <TouchableOpacity
                        key={`${index}-${hijo._id}`}
                        onPress={() => useAthleteOnTicket(index, hijo)}
                        style={[styles.athleteChip, { borderColor: colorMarca }]}
                      >
                        <Text style={{ color: colorMarca, fontWeight: '800', fontSize: 12 }}>
                          {hijo.nombre || 'Atleta'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 17 }}>
              El descuento aplica solo en la entrada que lleva el nombre y el DNI de quien lo tiene.
            </Text>

            <View
              style={[
                styles.quoteBox,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              {quoting && !quote ? (
                <ClubSpinLoader size={40} />
              ) : quote ? (
                <>
                  {quote.descuentoBloqueadoPorDeuda ? (
                    <View style={styles.warnRow}>
                      <Ionicons name="alert-circle" size={18} color={isDarkMode ? '#fbbf24' : '#b45309'} />
                      <Text
                        style={{
                          color: isDarkMode ? '#fbbf24' : '#b45309',
                          flex: 1,
                          marginLeft: 8,
                          fontSize: 13,
                          fontWeight: '600',
                        }}
                      >
                        Hay cuotas vencidas: esa entrada se cobra a precio lleno.
                      </Text>
                    </View>
                  ) : null}
                  {quote.cantidadConDescuento > 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 18 }}>
                      {(quote.lineas || [])
                        .filter((line) => line.conDescuento)
                        .map((line) => `${line.titular || 'Descuento'} $${formatMoney(line.precio)}`)
                        .join(' · ')}
                      {quote.cantidadPrecioLleno
                        ? ` · ${quote.cantidadPrecioLleno} a precio lleno ($${formatMoney(quote.precioLista)})`
                        : ''}
                    </Text>
                  ) : (
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      {quote.cantidad} × ${formatMoney(quote.precioLista)}
                    </Text>
                  )}
                  <Text style={[styles.totalLine, { color: theme.text }]}>
                    Total ${formatMoney(quote.montoTotal)}
                  </Text>
                </>
              ) : (
                <Text style={{ color: theme.textMuted }}>Elegí un tipo para ver el precio.</Text>
              )}
            </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.buyBar,
              { borderTopColor: theme.border, backgroundColor: theme.background },
            ]}
          >
            {buyNotice ? (
              <Text style={styles.buyNotice}>{buyNotice}</Text>
            ) : null}
            <TouchableOpacity
              style={[
                styles.buyBtn,
                {
                  backgroundColor: colorMarca,
                  opacity: buying || quoting || !tipoId || !quote ? 0.55 : 1,
                },
              ]}
              onPress={buy}
              disabled={buying || quoting || !tipoId || !quote}
            >
              {buying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buyBtnTxt}>
                  {quote?.montoTotal === 0
                    ? 'Obtener entradas'
                    : `Pagar $${formatMoney(quote?.montoTotal ?? 0)}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerLayer: {
    zIndex: 20,
    elevation: 20,
  },
  headerIconBtn: {
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  headerIconBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  body: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 140 },
  cardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 14 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metaText: { fontSize: 13, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  emptyWrap: { alignItems: 'center', marginTop: 56, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 12 },
  buyOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  buyBackdrop: { flex: 1 },
  buySheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '94%',
    overflow: 'hidden',
  },
  buyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  buyBack: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyTitle: { fontSize: 17, fontWeight: '800' },
  buySub: { fontSize: 12, marginTop: 2 },
  detailScroll: { paddingBottom: 16 },
  detailBody: { paddingHorizontal: 16, paddingTop: 14 },
  detailImage: {
    width: '100%',
    height: 210,
    backgroundColor: '#e2e8f0',
  },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  tipoRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    gap: 10,
  },
  qtyLabel: { flex: 1, fontSize: 15, fontWeight: '800' },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { fontSize: 20, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  holderCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  athleteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  athleteChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  holderInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  quoteBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    minHeight: 72,
    justifyContent: 'center',
  },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  totalLine: { fontWeight: '800', fontSize: 22, marginTop: 8 },
  buyBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buyNotice: {
    color: '#b45309',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  buyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buyBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
