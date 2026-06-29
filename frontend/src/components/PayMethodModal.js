import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PayMethodModal({
  visible,
  onClose,
  mercadoPagoReady,
  onSelectMercadoPago,
  onSelectTransfer,
  theme,
  primaryColor,
}) {
  if (!visible) return null;

  const onlyTransfer = !mercadoPagoReady;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              {onlyTransfer ? 'Pagar por transferencia' : 'Elegir forma de pago'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={28} color={theme.icon} />
            </TouchableOpacity>
          </View>

          {onlyTransfer ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Subí una foto del comprobante. Un administrador revisará el pago y te avisará.
            </Text>
          ) : (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Podés pagar con Mercado Pago o enviar el comprobante de transferencia.
            </Text>
          )}

          {mercadoPagoReady ? (
            <TouchableOpacity
              style={[styles.option, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={onSelectMercadoPago}
            >
              <Ionicons name="card-outline" size={24} color={primaryColor} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>Mercado Pago</Text>
                <Text style={[styles.optionSub, { color: theme.textMuted }]}>Pago online inmediato</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.icon} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.option, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={onSelectTransfer}
          >
            <Ionicons name="swap-horizontal-outline" size={24} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.text }]}>Transferencia</Text>
              <Text style={[styles.optionSub, { color: theme.textMuted }]}>
                Subir foto del comprobante para revisión
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.icon} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', flex: 1, marginRight: 12 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
