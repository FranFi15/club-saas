import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const EST_COLOR = { pendiente: '#f59e0b', pagado: '#10b981', vencido: '#ef4444' };

function fmtMoney(n) {
  return `$${(n || 0).toLocaleString('es-AR')}`;
}

/**
 * Lista de cuotas pendientes/vencidas con checkboxes.
 * onConfirm(selected) al pulsar Continuar.
 */
export default function SelectPaymentsModal({
  visible,
  onClose,
  title = 'Elegir cuotas a pagar',
  subtitle,
  payments = [],
  getPaymentLabel,
  theme,
  primaryColor,
  onConfirm,
  onDismiss,
}) {
  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!visible) return;
    const map = {};
    payments.forEach((p) => {
      map[String(p._id)] = true;
    });
    setSelected(map);
  }, [visible, payments]);

  const filtered = useMemo(
    () => payments.filter((p) => ['pendiente', 'vencido'].includes(p.estado)),
    [payments],
  );

  const selectedList = useMemo(
    () => filtered.filter((p) => selected[String(p._id)]),
    [filtered, selected],
  );

  const total = selectedList.reduce((s, p) => s + (p.montoFinal || 0), 0);

  const toggle = (id) => {
    const key = String(id);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  const selectAll = () => {
    const map = {};
    filtered.forEach((p) => {
      map[String(p._id)] = true;
    });
    setSelected(map);
  };

  const defaultLabel = (p) => {
    const mes = MESES[(p.mes || 1) - 1];
    const plan = p.plan?.nombre || 'Cuota';
    const cat = p.categoria?.nombre ? ` · ${p.categoria.nombre}` : '';
    return `${mes} ${p.anio} · ${plan}${cat}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={theme.icon} />
            </TouchableOpacity>
          </View>
          {subtitle ? (
            <Text style={[styles.sub, { color: theme.textMuted }]}>{subtitle}</Text>
          ) : null}

          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>No hay cuotas pendientes o vencidas.</Text>
          ) : (
            <>
              <TouchableOpacity onPress={selectAll} style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
                <Text style={{ color: primaryColor, fontWeight: '700', fontSize: 13 }}>Seleccionar todas</Text>
              </TouchableOpacity>

              <ScrollView style={styles.list} nestedScrollEnabled>
                {filtered.map((p) => {
                  const id = String(p._id);
                  const on = !!selected[id];
                  const ec = EST_COLOR[p.estado] || '#999';
                  const line2 = getPaymentLabel ? getPaymentLabel(p) : defaultLabel(p);
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[
                        styles.row,
                        {
                          borderColor: theme.border,
                          backgroundColor: on ? primaryColor + '12' : theme.background,
                        },
                      ]}
                      onPress={() => toggle(id)}
                    >
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={on ? primaryColor : theme.icon}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ color: theme.text, fontWeight: '600' }}>{line2}</Text>
                        <View style={[styles.badge, { backgroundColor: ec + '22', alignSelf: 'flex-start', marginTop: 4 }]}>
                          <Text style={{ color: ec, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
                            {p.estado}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: theme.text, fontWeight: '800' }}>{fmtMoney(p.montoFinal)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.count, { color: theme.textMuted }]}>
                {selectedList.length} seleccionada{selectedList.length === 1 ? '' : 's'} · {fmtMoney(total)}
              </Text>

              <TouchableOpacity
                style={[styles.primary, { backgroundColor: primaryColor, opacity: !selectedList.length ? 0.5 : 1 }]}
                onPress={() => selectedList.length && onConfirm(selectedList)}
                disabled={!selectedList.length}
              >
                <Text style={styles.primaryTxt}>Continuar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    height: '85%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    padding: 20,
    paddingBottom: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  sub: { fontSize: 14, marginBottom: 12 },
  list: { flex: 1, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  count: { fontSize: 13, marginBottom: 10 },
  primary: { height: 48, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  primaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
