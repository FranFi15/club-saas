import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MN } from './finanzasConstants';

const PRESETS = [1, 2, 3, 6, 12];

function addMonths(mes, anio, delta) {
  const idx = anio * 12 + (mes - 1) + delta;
  return { mes: (idx % 12) + 1, anio: Math.floor(idx / 12) };
}

function periodLabel(mes, anio) {
  return `${MN[(mes || 1) - 1] || mes} ${anio}`;
}

export default function AdvancePaymentsModal({
  visible,
  onClose,
  atleta,
  theme,
  primaryColor,
  mes,
  anio,
  onConfirm,
  onDismiss,
}) {
  const [cantidad, setCantidad] = useState(3);
  const [incluirSocial, setIncluirSocial] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCantidad(3);
    setIncluirSocial(true);
    setSaving(false);
  }, [visible]);

  const startMes = Number(mes) || new Date().getMonth() + 1;
  const startAnio = Number(anio) || new Date().getFullYear();

  const rango = useMemo(() => {
    const from = { mes: startMes, anio: startAnio };
    const to = addMonths(startMes, startAnio, Math.max(0, cantidad - 1));
    return { from, to };
  }, [startMes, startAnio, cantidad]);

  const nombre = atleta
    ? `${atleta.nombre || ''} ${atleta.apellido || ''}`.trim()
    : '';

  const handleConfirm = async () => {
    if (!atleta?._id || saving) return;
    setSaving(true);
    try {
      await onConfirm?.({
        atletaId: atleta._id,
        cantidadMeses: cantidad,
        incluirSocial,
        desdeMes: startMes,
        desdeAnio: startAnio,
      });
      onClose?.();
    } catch {
      /* parent shows alert */
    } finally {
      setSaving(false);
    }
  };

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
            <Text style={[styles.title, { color: theme.text }]}>Adelantar cuotas</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.icon} />
            </TouchableOpacity>
          </View>
          {nombre ? (
            <Text style={[styles.sub, { color: theme.textMuted }]}>{nombre}</Text>
          ) : null}
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Se crean cuotas pendientes desde {periodLabel(rango.from.mes, rango.from.anio)}
            {cantidad > 1
              ? ` hasta ${periodLabel(rango.to.mes, rango.to.anio)}`
              : ''}
            . Las que ya existan se omiten.
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>Cantidad de meses</Text>
          <View style={styles.presets}>
            {PRESETS.map((n) => {
              const active = cantidad === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.preset,
                    {
                      borderColor: active ? primaryColor : theme.border,
                      backgroundColor: active ? `${primaryColor}18` : theme.background,
                    },
                  ]}
                  onPress={() => setCantidad(n)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={{
                      color: active ? primaryColor : theme.text,
                      fontWeight: '800',
                      fontSize: 15,
                    }}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.switchRow, { borderColor: theme.border }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>Incluir cuota social</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                Si tiene tipo asignado y no está exento.
              </Text>
            </View>
            <Switch
              value={incluirSocial}
              onValueChange={setIncluirSocial}
              trackColor={{ false: theme.border, true: `${primaryColor}88` }}
              thumbColor={incluirSocial ? primaryColor : '#f4f4f5'}
            />
          </View>

          <TouchableOpacity
            style={[styles.confirm, { backgroundColor: primaryColor, opacity: saving ? 0.65 : 1 }]}
            onPress={handleConfirm}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmTxt}>Crear cuotas</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    borderRadius: 16,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 8 },
  sub: { fontSize: 14, marginTop: 4, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 10, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  preset: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
  },
  switchLabel: { fontSize: 14, fontWeight: '700' },
  confirm: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
