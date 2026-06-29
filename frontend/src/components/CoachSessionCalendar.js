import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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

  const cells = useMemo(() => buildMonthDays(year, monthIndex), [year, monthIndex]);

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
        <View style={styles.monthTitleWrap}>
          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {MONTHS[monthIndex]} {year}
          </Text>
          {loading ? <ActivityIndicator size="small" color={colorMarca} style={{ marginLeft: 8 }} /> : null}
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
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
  monthTitleWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1 },
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
});

export default React.memo(CoachSessionCalendar);
