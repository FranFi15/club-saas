import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DesignCard from './DesignCard';
import { clubApi } from '../utils/api';

/**
 * Banner for expired trial athletes pending continue/leave decision.
 */
export default function TrialDecisionCard({
  athlete,
  theme,
  isDarkMode,
  colorMarca,
  getHeaders,
  onResolved,
  compact = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!athlete?._id) return null;

  const name = `${athlete.nombre || ''} ${athlete.apellido || ''}`.trim() || 'Atleta';

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const headers = await getHeaders();
      const path =
        action === 'continuar'
          ? `/users/atletas/${athlete._id}/prueba/continuar`
          : `/users/atletas/${athlete._id}/prueba/baja`;
      await clubApi.post(path, action === 'baja' ? { desactivarTutorTambien: true } : {}, { headers });
      onResolved?.(action, athlete);
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la decisión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesignCard
      theme={theme}
      isDarkMode={isDarkMode}
      accent="#f59e0b"
      style={{ marginBottom: 12 }}
      contentStyle={styles.inner}
    >
      <View style={styles.row}>
        <Ionicons name="hourglass-outline" size={22} color="#f59e0b" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.title, { color: theme.text }]}>Prueba vencida — {name}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {compact
              ? '¿Querés seguir en el club? Si confirmás, se activan cuotas y planes.'
              : 'La prueba terminó. Si continúan, se activan cuotas y planes. Si no, se da de baja esta cuenta.'}
          </Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#10b981' }]}
          onPress={() => run('continuar')}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continuar</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#ef4444' }]}
          onPress={() => run('baja')}
          disabled={busy}
        >
          <Text style={styles.btnText}>Dar de baja</Text>
        </TouchableOpacity>
      </View>
    </DesignCard>
  );
}

const styles = StyleSheet.create({
  inner: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 13, lineHeight: 18 },
  error: { color: '#ef4444', marginTop: 8, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
