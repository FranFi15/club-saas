import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calendarPartsToYmd, todayYmd } from '../utils/timeSlots';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DAY_HEADERS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const QUICK_OPTIONS = [
  { key: 'today', label: 'Hoy', offsetDays: 0 },
  { key: 'yesterday', label: 'Ayer', offsetDays: -1 },
  { key: 'week', label: 'Hace 1 semana', offsetDays: -7 },
  { key: 'month', label: 'Hace 1 mes', offsetMonths: -1 },
];

function ymdToLocalDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function dateToYmd(date) {
  return calendarPartsToYmd(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildMonthDays(viewMonth) {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstWeekday = new Date(y, m, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, ymd: calendarPartsToYmd(y, m, day) });
  }
  return cells;
}

/**
 * Calendario para elegir un día del historial de ingresos (sin fechas futuras).
 */
export default function HistoryDayPickerModal({
  visible,
  value,
  onClose,
  onSelect,
  theme,
  colorMarca = '#3b82f6',
}) {
  const todayYmdStr = todayYmd();
  const selectedYmd = dateToYmd(value);
  const [viewMonth, setViewMonth] = useState(() => new Date(value));

  useEffect(() => {
    if (visible) setViewMonth(new Date(value));
  }, [visible, value]);

  const days = useMemo(() => buildMonthDays(viewMonth), [viewMonth]);

  const canGoNextMonth = useMemo(() => {
    const today = ymdToLocalDate(todayYmdStr);
    return (
      viewMonth.getFullYear() < today.getFullYear() ||
      (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() < today.getMonth())
    );
  }, [viewMonth, todayYmdStr]);

  const pickYmd = (ymd) => {
    if (ymd > todayYmdStr) return;
    onSelect(ymdToLocalDate(ymd));
    onClose();
  };

  const pickQuick = (opt) => {
    const today = ymdToLocalDate(todayYmdStr);
    let d;
    if (opt.offsetMonths) {
      d = new Date(today);
      d.setMonth(d.getMonth() + opt.offsetMonths);
    } else {
      d = new Date(today);
      d.setDate(d.getDate() + (opt.offsetDays || 0));
    }
    d.setHours(0, 0, 0, 0);
    if (dateToYmd(d) > todayYmdStr) d = today;
    onSelect(d);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Elegir día</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={24} color={theme.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
            {QUICK_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.quickChip, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => pickQuick(opt)}
              >
                <Text style={[styles.quickChipTxt, { color: theme.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.calBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.calHead}>
              <TouchableOpacity onPress={() => setViewMonth((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))} hitSlop={8}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.calMonth, { color: theme.text }]}>
                {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setViewMonth((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
                disabled={!canGoNextMonth}
                hitSlop={8}
                style={{ opacity: canGoNextMonth ? 1 : 0.3 }}
              >
                <Ionicons name="chevron-forward" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.daysHeader}>
              {DAY_HEADERS.map((d) => (
                <Text key={d} style={[styles.dayHdrTxt, { color: theme.textMuted }]}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {days.map((dt, i) => {
                if (!dt) return <View key={`e-${i}`} style={styles.dayCell} />;
                const isSelected = dt.ymd === selectedYmd;
                const isToday = dt.ymd === todayYmdStr;
                const isFuture = dt.ymd > todayYmdStr;
                return (
                  <TouchableOpacity
                    key={dt.ymd}
                    style={[
                      styles.dayCell,
                      isSelected && { backgroundColor: colorMarca, borderRadius: 20 },
                      !isSelected && isToday && { borderWidth: 2, borderColor: colorMarca, borderRadius: 20 },
                    ]}
                    onPress={() => pickYmd(dt.ymd)}
                    disabled={isFuture}
                    accessibilityLabel={`Día ${dt.day}`}
                  >
                    <Text
                      style={[
                        styles.dayTxt,
                        { color: isFuture ? theme.textMuted : theme.text },
                        isSelected && { color: '#fff', fontWeight: '800' },
                        !isSelected && isToday && { color: colorMarca, fontWeight: '800' },
                        isFuture && { opacity: 0.35 },
                      ]}
                    >
                      {dt.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800' },
  quickScroll: { marginBottom: 12, flexGrow: 0 },
  quickChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  quickChipTxt: { fontSize: 13, fontWeight: '600' },
  calBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  calHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calMonth: { fontSize: 15, fontWeight: '800' },
  daysHeader: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  dayHdrTxt: { width: 32, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', height: 40, justifyContent: 'center', alignItems: 'center' },
  dayTxt: { textAlign: 'center', fontSize: 14 },
});
