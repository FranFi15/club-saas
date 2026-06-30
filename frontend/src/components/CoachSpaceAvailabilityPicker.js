import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CoachSessionCalendar from './CoachSessionCalendar';
import { generateTimeSlots, getSlotStatus, getDayName, todayYmd } from '../utils/timeSlots';
import { isoCalendarDateToDisplay } from '../utils/dateDisplay';
import { clubApi } from '../utils/api';
import { pickPaginatedRows } from '../utils/paginatedApi';
import { getToken } from '../utils/storage';

const SLOTS = generateTimeSlots(6, 23);

function slotOccupiedLabel(status) {
  if (status.tipo === 'alquiler') return 'Alquiler';
  if (status.data?._esGrilla) return 'Grilla fija';
  const name = status.data?.categoria?.nombre;
  return name ? `Ocupado · ${name}` : 'Ocupado';
}

/**
 * Calendario + espacio + franjas horarias libres/ocupadas para programar sesión en el club.
 */
export default function CoachSpaceAvailabilityPicker({
  clubIdentifier,
  spaces,
  schedulesBySpace,
  colorMarca,
  theme,
  isDarkMode,
  selectedYmd,
  onSelectYmd,
  selectedSpaceId,
  onSelectSpaceId,
  selectedSlot,
  onSelectSlot,
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const [y, m] = (selectedYmd || todayYmd()).split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [cancelledSessions, setCancelledSessions] = useState([]);

  const headers = useCallback(async () => {
    const token = await getToken('userToken');
    return {
      'x-club-identifier': clubIdentifier,
      Authorization: `Bearer ${token}`,
    };
  }, [clubIdentifier]);

  const loadDaySessions = useCallback(async () => {
    if (!selectedSpaceId || !selectedYmd) return;
    setLoading(true);
    try {
      const h = await headers();
      const res = await clubApi.get(
        `/sessions/espacio/${selectedSpaceId}?fechaInicio=${selectedYmd}&fechaFin=${selectedYmd}&incluirCanceladas=true`,
        { headers: h },
      );
      const all = pickPaginatedRows(res.data, 'sessions');
      setSessions(all.filter((s) => s.estado !== 'cancelada'));
      setCancelledSessions(all.filter((s) => s.estado === 'cancelada'));
    } catch {
      setSessions([]);
      setCancelledSessions([]);
    } finally {
      setLoading(false);
    }
  }, [headers, selectedSpaceId, selectedYmd]);

  useEffect(() => {
    loadDaySessions();
  }, [loadDaySessions]);

  const daySchedules = useMemo(() => {
    if (!selectedSpaceId || !selectedYmd) return [];
    const dayName = getDayName(selectedYmd);
    return (schedulesBySpace[selectedSpaceId] || []).filter((s) => s.diaSemana === dayName);
  }, [schedulesBySpace, selectedSpaceId, selectedYmd]);

  const slotRows = useMemo(() => {
    return SLOTS.map((slot) => {
      const status = getSlotStatus(slot, sessions, [], daySchedules, cancelledSessions);
      return { ...slot, status };
    });
  }, [sessions, daySchedules, cancelledSessions]);

  const freeCount = slotRows.filter((r) => r.status.tipo === 'libre').length;

  const changeMonth = (offset) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const renderSlot = ({ item: slot }) => {
    const isFree = slot.status.tipo === 'libre';
    const isSelected =
      selectedSlot?.espacioId === selectedSpaceId &&
      selectedSlot?.horaInicio === slot.horaInicio &&
      selectedSlot?.horaFin === slot.horaFin;

    return (
      <TouchableOpacity
        disabled={!isFree}
        onPress={() =>
          onSelectSlot({
            espacioId: selectedSpaceId,
            horaInicio: slot.horaInicio,
            horaFin: slot.horaFin,
            ymd: selectedYmd,
          })
        }
        activeOpacity={0.75}
        style={[
          styles.slotRow,
          {
            backgroundColor: isSelected
              ? colorMarca + '28'
              : isFree
                ? '#10b98114'
                : isDarkMode
                  ? '#4b5563'
                  : '#e5e7eb',
            borderColor: isSelected ? colorMarca : theme.border,
          },
        ]}
      >
        <View style={styles.slotTime}>
          <Text style={[styles.slotTimeMain, { color: theme.text }]}>{slot.horaInicio}</Text>
          <Text style={[styles.slotTimeSub, { color: theme.textMuted }]}>{slot.horaFin}</Text>
        </View>
        <View style={[styles.slotDivider, { backgroundColor: theme.border }]} />
        <Ionicons
          name={isFree ? 'checkmark-circle-outline' : 'close-circle-outline'}
          size={20}
          color={isFree ? '#10b981' : theme.textMuted}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.slotLabel, { color: theme.text }]}>
            {isFree ? 'Libre' : slotOccupiedLabel(slot.status)}
          </Text>
          {isFree ? (
            <Text style={styles.slotHintFree}>Tocá para usar este horario</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  if (!spaces.length) {
    return (
      <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
        No hay espacios cargados en el club.
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Elegí el día</Text>
      <CoachSessionCalendar
        theme={theme}
        colorMarca={colorMarca}
        currentMonth={currentMonth}
        onChangeMonth={changeMonth}
        selectedYmd={selectedYmd}
        onSelectDay={onSelectYmd}
        sessionCountByDay={{}}
      />

      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Espacio</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={spaces}
        keyExtractor={(s) => s._id}
        style={styles.spaceList}
        renderItem={({ item }) => {
          const sel = selectedSpaceId === item._id;
          return (
            <TouchableOpacity
              style={[
                styles.spaceChip,
                {
                  borderColor: sel ? colorMarca : theme.border,
                  backgroundColor: sel ? colorMarca + '22' : theme.surface,
                },
              ]}
              onPress={() => onSelectSpaceId(item._id)}
            >
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{item.nombre}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.dayHead}>
        <Text style={[styles.dayTitle, { color: theme.text }]}>
          {isoCalendarDateToDisplay(selectedYmd) || '—'}
        </Text>
        <Text style={[styles.daySub, { color: theme.textMuted }]}>
          {loading ? 'Cargando…' : `${freeCount} horario${freeCount === 1 ? '' : 's'} libre${freeCount === 1 ? '' : 's'}`}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colorMarca} style={{ marginVertical: 20 }} />
      ) : (
        <FlatList
          data={slotRows}
          keyExtractor={(item) => item.horaInicio}
          renderItem={renderSlot}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <Text style={[styles.emptyHint, { color: theme.textMuted }]}>Sin franjas para este día.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  spaceList: { maxHeight: 44, marginBottom: 14 },
  spaceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  dayTitle: { fontSize: 16, fontWeight: '800' },
  daySub: { fontSize: 12, fontWeight: '600' },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  slotTime: { width: 52 },
  slotTimeMain: { fontSize: 14, fontWeight: '800' },
  slotTimeSub: { fontSize: 10, marginTop: 2 },
  slotDivider: { width: 1, height: 32, marginHorizontal: 12 },
  slotLabel: { fontSize: 14, fontWeight: '700' },
  slotHintFree: { color: '#10b981', fontSize: 12, marginTop: 2 },
  emptyHint: { fontSize: 14, lineHeight: 20, marginVertical: 12 },
});
