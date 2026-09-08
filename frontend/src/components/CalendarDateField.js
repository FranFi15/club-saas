import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CoachSessionCalendar from './CoachSessionCalendar';
import {
  displayDateToIsoCalendar,
  isoCalendarDateToDisplay,
  isoCalendarWeekday,
} from '../utils/dateDisplay';
import { todayYmd } from '../utils/timeSlots';

/**
 * Date field that opens a month calendar (no typing DD-MM-AAAA).
 * Value is display format DD-MM-AAAA (or '') for drop-in with existing forms.
 */
export default function CalendarDateField({
  theme,
  colorMarca,
  value = '',
  onChange,
  placeholder = 'Elegí una fecha',
  allowClear = false,
  style,
  minYmd,
  maxYmd,
}) {
  const [open, setOpen] = useState(false);
  const selectedYmd = useMemo(() => displayDateToIsoCalendar(value) || '', [value]);
  const [month, setMonth] = useState(() => {
    const ymd = displayDateToIsoCalendar(value) || todayYmd();
    const [y, m] = ymd.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
  });

  useEffect(() => {
    if (!open) return;
    const ymd = selectedYmd || todayYmd();
    const [y, m] = ymd.split('-').map(Number);
    if (y && m) setMonth(new Date(y, m - 1, 1));
  }, [open, selectedYmd]);

  const summary = useMemo(() => {
    if (!selectedYmd) return null;
    const weekday = isoCalendarWeekday(selectedYmd, { style: 'long' });
    const cal = isoCalendarDateToDisplay(selectedYmd);
    return [weekday, cal].filter(Boolean).join(' · ');
  }, [selectedYmd]);

  const pickDay = (ymd) => {
    if (minYmd && ymd < minYmd) return;
    if (maxYmd && ymd > maxYmd) return;
    onChange?.(isoCalendarDateToDisplay(ymd));
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.field,
          {
            backgroundColor: theme.surface,
            borderColor: selectedYmd ? colorMarca : theme.border,
          },
          style,
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons
          name="calendar-outline"
          size={20}
          color={selectedYmd ? colorMarca : theme.icon}
        />
        <Text
          style={{
            flex: 1,
            marginLeft: 10,
            color: selectedYmd ? theme.text : theme.textMuted,
            fontWeight: selectedYmd ? '600' : '500',
            fontSize: 15,
          }}
          numberOfLines={1}
        >
          {summary || placeholder}
        </Text>
        {allowClear && selectedYmd ? (
          <TouchableOpacity
            onPress={() => onChange?.('')}
            hitSlop={10}
            style={{ padding: 2 }}
          >
            <Ionicons name="close-circle" size={20} color={theme.icon} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <View style={styles.sheetHead}>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.icon} />
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Elegir fecha</Text>
              {allowClear ? (
                <TouchableOpacity
                  onPress={() => {
                    onChange?.('');
                    setOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Text style={{ color: theme.textMuted, fontWeight: '600', fontSize: 14 }}>Quitar</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 48 }} />
              )}
            </View>
            <View style={styles.calWrap}>
              <CoachSessionCalendar
                theme={theme}
                colorMarca={colorMarca}
                currentMonth={month}
                onChangeMonth={(offset) =>
                  setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
                }
                selectedYmd={selectedYmd}
                onSelectDay={pickDay}
                sessionCountByDay={{}}
              />
            </View>
            {minYmd || maxYmd ? (
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {minYmd && maxYmd
                  ? `Entre ${isoCalendarDateToDisplay(minYmd)} y ${isoCalendarDateToDisplay(maxYmd)}`
                  : minYmd
                    ? `Desde ${isoCalendarDateToDisplay(minYmd)}`
                    : `Hasta ${isoCalendarDateToDisplay(maxYmd)}`}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  calWrap: { paddingHorizontal: 12, paddingBottom: 8 },
  hint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginBottom: 4 },
});
