import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clubApi } from '../utils/api';
import {
  ISAK_BASIC_PRESETS,
  ISAK_BONE_DIAMETER_PRESETS,
  ISAK_PERIMETER_PRESETS,
  ISAK_SKINFOLD_PRESETS,
  defsAlignedToPresets,
} from '../constants/nutritionMetrics';

function parseValor(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function isSaveableDef(d) {
  return d?._id && !String(d._id).startsWith('__');
}

function MetricBatchCard({
  title,
  icon,
  defs,
  values,
  onChangeValue,
  notas,
  onChangeNotas,
  visibleAtleta,
  onChangeVisibleAtleta,
  visibleTutor,
  onChangeVisibleTutor,
  onSave,
  saving,
  saveLabel,
  theme,
  colorMarca,
}) {
  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
  ];

  const filledCount = defs.filter((d) => String(values[d._id] ?? '').trim() !== '').length;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: colorMarca + '20' }]}>
          <Ionicons name={icon} size={22} color={colorMarca} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        </View>
        <Text style={[styles.countBadge, { color: colorMarca }]}>
          {filledCount}/{defs.length}
        </Text>
      </View>

      <View style={[styles.listHeader, { borderBottomColor: theme.border }]}>
        <Text style={[styles.colMedida, { color: theme.textMuted }]}>Medida</Text>
        <Text style={[styles.colValor, { color: theme.textMuted }]}>Valor</Text>
      </View>
      {defs.map((d) => (
        <View key={d._id} style={[styles.metricRow, { borderBottomColor: theme.border }]}>
          <View style={styles.colMedida}>
            <Text style={[styles.metricName, { color: theme.text }]}>{d.nombre}</Text>
            <Text style={[styles.metricUnit, { color: theme.textMuted }]}>{d.unidad}</Text>
          </View>
          <TextInput
            style={[styles.valorInput, inputStyle]}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={theme.textMuted}
            value={values[d._id] ?? ''}
            onChangeText={(tx) => onChangeValue(d._id, tx)}
          />
        </View>
      ))}

      <Text style={[styles.sharedLabel, { color: theme.textMuted }]}>Notas (opcional)</Text>
      <TextInput
        style={[inputStyle, { minHeight: 56 }]}
        placeholder="Observaciones del control…"
        placeholderTextColor={theme.textMuted}
        multiline
        value={notas}
        onChangeText={onChangeNotas}
      />

      <View style={[styles.switchRow, { borderBottomColor: theme.border }]}>
        <Text style={{ color: theme.text, flex: 1 }}>Visible para el atleta</Text>
        <Switch value={visibleAtleta} onValueChange={onChangeVisibleAtleta} />
      </View>
      <View style={[styles.switchRow, { borderBottomColor: theme.border }]}>
        <Text style={{ color: theme.text, flex: 1 }}>Visible para el tutor</Text>
        <Switch value={visibleTutor} onValueChange={onChangeVisibleTutor} />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colorMarca }]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>{saveLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function useBatchBlock(defs, presets) {
  const sorted = useMemo(() => defsAlignedToPresets(defs, presets), [defs, presets]);
  const [values, setValues] = useState({});
  const [notas, setNotas] = useState('');
  const [visAtleta, setVisAtleta] = useState(true);
  const [visTutor, setVisTutor] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      sorted.forEach((d) => {
        if (next[d._id] === undefined) next[d._id] = '';
      });
      return next;
    });
  }, [sorted]);

  const clear = () => {
    const cleared = {};
    sorted.forEach((d) => {
      cleared[d._id] = '';
    });
    setValues(cleared);
    setNotas('');
  };

  return {
    sorted,
    values,
    setValues,
    notas,
    setNotas,
    visAtleta,
    setVisAtleta,
    visTutor,
    setVisTutor,
    saving,
    setSaving,
    clear,
  };
}

export default function NutriBatchMeasurementCards({
  atletaId,
  defsBasicos,
  defsPliegues,
  defsDiametros,
  defsPerimetros,
  clubIdentifier,
  getHeaders,
  theme,
  colorMarca,
  onSaved,
  showAlert,
}) {
  const basic = useBatchBlock(defsBasicos, ISAK_BASIC_PRESETS);
  const pliegues = useBatchBlock(defsPliegues, ISAK_SKINFOLD_PRESETS);
  const perimetros = useBatchBlock(defsPerimetros, ISAK_PERIMETER_PRESETS);
  const diametros = useBatchBlock(defsDiametros, ISAK_BONE_DIAMETER_PRESETS);

  const saveBatch = useCallback(
    async (defs, block, labelOk) => {
      if (!atletaId || !clubIdentifier) return;

      const saveable = defs.filter(isSaveableDef);
      if (!saveable.length) {
        showAlert('Esperá un momento', 'Las medidas se están preparando. Volvé a intentar en unos segundos.');
        return;
      }

      const medicionesPayload = [];
      for (const d of saveable) {
        const raw = block.values[d._id];
        if (raw === undefined || String(raw).trim() === '') continue;
        const num = parseValor(raw);
        if (Number.isNaN(num)) {
          showAlert('Valor inválido', `Revisá el número en “${d.nombre}”.`);
          return;
        }
        medicionesPayload.push({ metrica: d._id, valor: num });
      }

      if (!medicionesPayload.length) {
        showAlert('Sin datos', 'Completá al menos un valor antes de guardar.');
        return;
      }

      block.setSaving(true);
      try {
        const h = await getHeaders();
        const body = {
          atleta: atletaId,
          mediciones: medicionesPayload,
          notasExtra: block.notas.trim() || undefined,
          visibleParaAtleta: block.visAtleta,
          visibleParaTutor: block.visTutor,
        };

        const { data } = await clubApi.post('/performance/measurements/bulk', body, { headers: h });
        showAlert('Guardado', data?.message || labelOk);
        block.clear();
        onSaved?.();
      } catch (e) {
        showAlert('Error', e.response?.data?.message || 'No se pudieron guardar las mediciones.');
      } finally {
        block.setSaving(false);
      }
    },
    [atletaId, clubIdentifier, getHeaders, showAlert, onSaved],
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.dateHint, { color: theme.textMuted }]}>
        Las mediciones se guardan con la fecha de hoy.
      </Text>
      <MetricBatchCard
        title="1. Medidas básicas"
        icon="scale-outline"
        defs={basic.sorted}
        values={basic.values}
        onChangeValue={(id, tx) => basic.setValues((p) => ({ ...p, [id]: tx }))}
        notas={basic.notas}
        onChangeNotas={basic.setNotas}
        visibleAtleta={basic.visAtleta}
        onChangeVisibleAtleta={basic.setVisAtleta}
        visibleTutor={basic.visTutor}
        onChangeVisibleTutor={basic.setVisTutor}
        saving={basic.saving}
        saveLabel="Guardar"
        onSave={() => saveBatch(basic.sorted, basic, 'Guardado.')}
        theme={theme}
        colorMarca={colorMarca}
      />

      <MetricBatchCard
        title="2. Pliegues cutáneos"
        icon="body-outline"
        defs={pliegues.sorted}
        values={pliegues.values}
        onChangeValue={(id, tx) => pliegues.setValues((p) => ({ ...p, [id]: tx }))}
        notas={pliegues.notas}
        onChangeNotas={pliegues.setNotas}
        visibleAtleta={pliegues.visAtleta}
        onChangeVisibleAtleta={pliegues.setVisAtleta}
        visibleTutor={pliegues.visTutor}
        onChangeVisibleTutor={pliegues.setVisTutor}
        saving={pliegues.saving}
        saveLabel="Guardar"
        onSave={() => saveBatch(pliegues.sorted, pliegues, 'Guardado.')}
        theme={theme}
        colorMarca={colorMarca}
      />

      <MetricBatchCard
        title="3. Perímetros"
        icon="ellipse-outline"
        defs={perimetros.sorted}
        values={perimetros.values}
        onChangeValue={(id, tx) => perimetros.setValues((p) => ({ ...p, [id]: tx }))}
        notas={perimetros.notas}
        onChangeNotas={perimetros.setNotas}
        visibleAtleta={perimetros.visAtleta}
        onChangeVisibleAtleta={perimetros.setVisAtleta}
        visibleTutor={perimetros.visTutor}
        onChangeVisibleTutor={perimetros.setVisTutor}
        saving={perimetros.saving}
        saveLabel="Guardar"
        onSave={() => saveBatch(perimetros.sorted, perimetros, 'Guardado.')}
        theme={theme}
        colorMarca={colorMarca}
      />

      <MetricBatchCard
        title="4. Diámetros óseos"
        icon="resize-outline"
        defs={diametros.sorted}
        values={diametros.values}
        onChangeValue={(id, tx) => diametros.setValues((p) => ({ ...p, [id]: tx }))}
        notas={diametros.notas}
        onChangeNotas={diametros.setNotas}
        visibleAtleta={diametros.visAtleta}
        onChangeVisibleAtleta={diametros.setVisAtleta}
        visibleTutor={diametros.visTutor}
        onChangeVisibleTutor={diametros.setVisTutor}
        saving={diametros.saving}
        saveLabel="Guardar"
        onSave={() => saveBatch(diametros.sorted, diametros, 'Guardado.')}
        theme={theme}
        colorMarca={colorMarca}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  dateHint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  countBadge: { fontSize: 14, fontWeight: '800' },
  listHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, marginBottom: 4 },
  metricRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  colMedida: { flex: 1, minWidth: 0 },
  colValor: { width: 88, textAlign: 'right', fontSize: 11, fontWeight: '700' },
  metricName: { fontSize: 14, fontWeight: '700' },
  metricUnit: { fontSize: 11, marginTop: 2 },
  valorInput: { width: 88, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  sharedLabel: { fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  saveBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
