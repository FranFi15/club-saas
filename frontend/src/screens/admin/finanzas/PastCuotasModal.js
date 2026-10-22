import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MN } from './finanzasConstants';

function shiftMonth(mes, anio, delta) {
  const idx = anio * 12 + (mes - 1) + delta;
  return { mes: (idx % 12) + 1, anio: Math.floor(idx / 12) };
}

function defaultRange() {
  const now = new Date();
  const hasta = shiftMonth(now.getMonth() + 1, now.getFullYear(), -1);
  const desde = shiftMonth(hasta.mes, hasta.anio, -2);
  return { desde, hasta };
}

export default function PastCuotasModal({
  visible,
  onClose,
  atleta,
  theme,
  primaryColor,
  onConfirm,
  onDismiss,
}) {
  const nombre = atleta ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim() : '';
  const [desde, setDesde] = useState(defaultRange().desde);
  const [hasta, setHasta] = useState(defaultRange().hasta);
  const [incluirPlan, setIncluirPlan] = useState(true);
  const [incluirSocial, setIncluirSocial] = useState(false);
  const [montoPlan, setMontoPlan] = useState('');
  const [montoSocial, setMontoSocial] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const range = defaultRange();
    setDesde(range.desde);
    setHasta(range.hasta);
    setIncluirPlan(true);
    setIncluirSocial(false);
    setMontoPlan('');
    setMontoSocial('');
    setSaving(false);
  }, [visible, atleta?._id]);

  const submit = async () => {
    if (!atleta?._id || saving) return;
    setSaving(true);
    try {
      await onConfirm?.({
        atletaId: atleta._id,
        desdeMes: desde.mes,
        desdeAnio: desde.anio,
        hastaMes: hasta.mes,
        hastaAnio: hasta.anio,
        incluirEntrenamiento: incluirPlan,
        incluirSocial,
        montoEntrenamiento: montoPlan.trim() ? montoPlan.trim() : undefined,
        montoSocial: montoSocial.trim() ? montoSocial.trim() : undefined,
      });
      onClose?.();
    } catch {
      /* parent shows alert */
    } finally {
      setSaving(false);
    }
  };

  const monthRow = (label, value, setValue) => (
    <View style={styles.monthBlock}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View style={[styles.monthRow, { borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => setValue(shiftMonth(value.mes, value.anio, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.monthTxt, { color: theme.text }]}>
          {MN[value.mes - 1]} {value.anio}
        </Text>
        <TouchableOpacity onPress={() => setValue(shiftMonth(value.mes, value.anio, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Cuotas anteriores</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} disabled={saving}>
              <Ionicons name="close" size={24} color={theme.icon} />
            </TouchableOpacity>
          </View>
          {nombre ? <Text style={[styles.sub, { color: theme.textMuted }]}>{nombre}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Cargá meses ya cerrados que el atleta debía antes de usar la app. Quedan vencidas para cobrarlas acá.
              Si dejás el monto vacío, se usa el plan o la cuota social actual.
            </Text>
            {monthRow('Desde', desde, setDesde)}
            {monthRow('Hasta', hasta, setHasta)}

            <View style={[styles.switchRow, { borderColor: theme.border }]}>
              <Text style={[styles.switchLabel, { color: theme.text, flex: 1 }]}>Cuota de plan</Text>
              <Switch
                value={incluirPlan}
                onValueChange={setIncluirPlan}
                trackColor={{ false: theme.border, true: `${primaryColor}88` }}
                thumbColor={incluirPlan ? primaryColor : theme.textMuted}
              />
            </View>
            {incluirPlan ? (
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                placeholder="Monto del plan (opcional)"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={montoPlan}
                onChangeText={setMontoPlan}
              />
            ) : null}

            <View style={[styles.switchRow, { borderColor: theme.border }]}>
              <Text style={[styles.switchLabel, { color: theme.text, flex: 1 }]}>Cuota social</Text>
              <Switch
                value={incluirSocial}
                onValueChange={setIncluirSocial}
                trackColor={{ false: theme.border, true: `${primaryColor}88` }}
                thumbColor={incluirSocial ? primaryColor : theme.textMuted}
              />
            </View>
            {incluirSocial ? (
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                placeholder="Monto de la cuota social (opcional)"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={montoSocial}
                onChangeText={setMontoSocial}
              />
            ) : null}

            <TouchableOpacity
              style={[styles.confirm, { backgroundColor: primaryColor, opacity: saving ? 0.7 : 1 }]}
              onPress={submit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmTxt}>Cargar como vencidas</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 8 },
  sub: { fontSize: 14, marginTop: 4, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 10, marginBottom: 14 },
  monthBlock: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  monthTxt: { fontSize: 15, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  switchLabel: { fontSize: 14, fontWeight: '700' },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  confirm: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
