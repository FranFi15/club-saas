import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { copyText } from '../utils/copyText';

function hasBankData(data) {
  if (!data) return false;
  return !!(data.titular?.trim() || data.banco?.trim() || data.cbu?.trim() || data.alias?.trim());
}

function CopyRow({ label, value, theme, primaryColor }) {
  const [copied, setCopied] = useState(false);
  if (!value?.trim()) return null;

  const handleCopy = async () => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: theme.text }]} selectable>
          {value}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.copyBtn, { backgroundColor: primaryColor + '18' }]}
        onPress={handleCopy}
        hitSlop={8}
      >
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={primaryColor} />
        <Text style={[styles.copyBtnTxt, { color: primaryColor }]}>{copied ? 'Copiado' : 'Copiar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TransferBankInfo({ datosTransferencia, theme, primaryColor }) {
  if (!hasBankData(datosTransferencia)) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Ionicons name="information-circle-outline" size={20} color={theme.textMuted} />
        <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
          El club aún no cargó los datos bancarios. Consultá en administración antes de transferir.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.text }]}>Datos para transferir</Text>
      {datosTransferencia.titular?.trim() ? (
        <Text style={[styles.titular, { color: theme.textMuted }]}>
          Titular: <Text style={{ color: theme.text, fontWeight: '700' }}>{datosTransferencia.titular}</Text>
        </Text>
      ) : null}
      {datosTransferencia.banco?.trim() ? (
        <Text style={[styles.titular, { color: theme.textMuted }]}>
          Banco: <Text style={{ color: theme.text, fontWeight: '600' }}>{datosTransferencia.banco}</Text>
        </Text>
      ) : null}
      <CopyRow label="Alias" value={datosTransferencia.alias} theme={theme} primaryColor={primaryColor} />
      <CopyRow label="CBU" value={datosTransferencia.cbu} theme={theme} primaryColor={primaryColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  titular: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  rowValue: { fontSize: 15, fontWeight: '700' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyBtnTxt: { fontSize: 12, fontWeight: '700' },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  emptyTxt: { flex: 1, fontSize: 13, lineHeight: 18 },
});
