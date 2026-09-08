import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calendarPartsToYmd, todayYmd } from '../utils/timeSlots';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
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
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function buildMonthDays(year, monthIndex) {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= dim; day++) {
    cells.push({ day, ymd: calendarPartsToYmd(year, monthIndex, day) });
  }
  return cells;
}

/**
 * Calendario mensual con indicador de sesiones por día.
 * Tocá el título del mes para elegir mes y año.
 */
function CoachSessionCalendar({
  theme,
  colorMarca,
  currentMonth,
  onChangeMonth,
  selectedYmd,
  onSelectDay,
  sessionCountByDay = {},
  pendingConfirmByDay = {},
  loading = false,
}) {
  const today = todayYmd();
  const year = currentMonth.getFullYear();
  const monthIndex = currentMonth.getMonth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  useEffect(() => {
    if (pickerOpen) setPickerYear(year);
  }, [pickerOpen, year]);

  const cells = useMemo(() => buildMonthDays(year, monthIndex), [year, monthIndex]);

  const jumpTo = (targetYear, targetMonthIndex) => {
    const delta = (targetYear - year) * 12 + (targetMonthIndex - monthIndex);
    if (delta !== 0) onChangeMonth(delta);
    setPickerOpen(false);
  };

  return (
    <View style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <TouchableOpacity
          onPress={() => onChangeMonth(-1)}
          style={[styles.navBtn, { backgroundColor: theme.background }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.monthTitleWrap}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Elegir mes y año"
        >
          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {MONTHS[monthIndex]} {year}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
          {loading ? <ActivityIndicator size="small" color={colorMarca} style={{ marginLeft: 8 }} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChangeMonth(1)}
          style={[styles.navBtn, { backgroundColor: theme.background }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[styles.weekLbl, { color: theme.textMuted }]}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`e-${i}`} style={styles.cell} />;
          const count = sessionCountByDay[cell.ymd] || 0;
          const pendingCount = pendingConfirmByDay[cell.ymd] || 0;
          const selected = cell.ymd === selectedYmd;
          const isToday = cell.ymd === today;
          const hasPending = pendingCount > 0;
          const hasSessions = count > 0;
          const showDot = hasPending || hasSessions;

          return (
            <TouchableOpacity
              key={cell.ymd}
              style={[
                styles.cell,
                selected && { backgroundColor: colorMarca, borderRadius: 20 },
                !selected && isToday && { borderWidth: 2, borderColor: colorMarca, borderRadius: 20 },
              ]}
              onPress={() => onSelectDay(cell.ymd)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayNum,
                  { color: theme.text },
                  selected && styles.dayNumSel,
                  !selected && isToday && { color: colorMarca, fontWeight: '800' },
                ]}
              >
                {cell.day}
              </Text>
              {showDot ? (
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: hasPending ? '#ef4444' : selected ? '#fff' : colorMarca,
                    },
                  ]}
                />
              ) : (
                <View style={styles.dotPlaceholder} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {pickerOpen ? (
        <View style={[styles.pickerInline, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.pickerYearRow}>
            <TouchableOpacity
              onPress={() => setPickerYear((y) => y - 1)}
              style={[styles.navBtn, { backgroundColor: theme.background }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.pickerYear, { color: theme.text }]}>{pickerYear}</Text>
            <TouchableOpacity
              onPress={() => setPickerYear((y) => y + 1)}
              style={[styles.navBtn, { backgroundColor: theme.background }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.monthGrid}>
            {MONTHS_SHORT.map((label, idx) => {
              const selected = pickerYear === year && idx === monthIndex;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.monthChip,
                    {
                      borderColor: selected ? colorMarca : theme.border,
                      backgroundColor: selected ? `${colorMarca}22` : theme.background,
                    },
                  ]}
                  onPress={() => jumpTo(pickerYear, idx)}
                >
                  <Text
                    style={{
                      color: selected ? colorMarca : theme.text,
                      fontWeight: selected ? '800' : '600',
                      fontSize: 14,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.pickerCancel}>
            <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  monthTitle: { fontSize: 17, fontWeight: '800' },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekLbl: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    maxHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dayNum: { fontSize: 15, fontWeight: '600' },
  dayNumSel: { color: '#fff', fontWeight: '800' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
  },
  dotPlaceholder: { height: 9 },
  pickerInline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'center',
    zIndex: 5,
  },
  pickerYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pickerYear: { fontSize: 20, fontWeight: '800' },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthChip: {
    width: '30%',
    flexGrow: 1,
    minWidth: '28%',
    maxWidth: '32%',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  pickerCancel: { alignItems: 'center', marginTop: 14, paddingVertical: 8 },
});

export default React.memo(CoachSessionCalendar);
