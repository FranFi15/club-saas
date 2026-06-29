import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

/**
 * Barra deslizable 1–10 para wellness (pre/post).
 */
export default function WellnessScalePicker({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  accentColor = '#3b82f6',
  theme,
}) {
  const numeric =
    value != null && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : min;
  const clamped = Math.min(max, Math.max(min, numeric));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {label ? (
          <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
            {label}
          </Text>
        ) : (
          <View style={styles.labelSpacer} />
        )}
        <View style={[styles.valueBadge, { backgroundColor: accentColor + '22', borderColor: accentColor }]}>
          <Text style={[styles.valueTxt, { color: accentColor }]}>{clamped}</Text>
        </View>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={clamped}
        onValueChange={(v) => onChange(Math.round(v))}
        minimumTrackTintColor={accentColor}
        maximumTrackTintColor={theme.border}
        thumbTintColor={accentColor}
      />

      <View style={styles.scaleEnds}>
        <Text style={[styles.scaleEnd, { color: theme.textMuted }]}>{min}</Text>
        <Text style={[styles.scaleEnd, { color: theme.textMuted }]}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  label: { flex: 1, fontSize: 15, fontWeight: '700' },
  labelSpacer: { flex: 1 },
  valueBadge: {
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  valueTxt: { fontSize: 22, fontWeight: '800' },
  slider: {
    width: '100%',
    height: 40,
  },
  scaleEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    paddingHorizontal: 4,
  },
  scaleEnd: { fontSize: 12, fontWeight: '600' },
});
