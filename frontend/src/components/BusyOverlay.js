import React from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * Blocking loading overlay for long-running generation / batch actions.
 * Use asModal={false} to nest inside an existing Modal (avoids RN stacked-modal issues).
 */
export default function BusyOverlay({
  visible,
  title = 'Procesando…',
  hint = 'Esto puede tardar unos segundos. No cierres la pantalla.',
  theme,
  color,
  asModal = true,
}) {
  if (!visible) return null;

  const surface = theme?.surface || '#fff';
  const text = theme?.text || '#111';
  const muted = theme?.textMuted || '#6b7280';
  const spinner = color || theme?.primary || '#2563eb';

  const body = (
    <View style={[styles.overlay, !asModal && styles.overlayAbsolute]}>
      <View style={[styles.card, { backgroundColor: surface }]}>
        <ActivityIndicator size="large" color={spinner} />
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        {hint ? <Text style={[styles.hint, { color: muted }]}>{hint}</Text> : null}
      </View>
    </View>
  );

  if (!asModal) return body;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  overlayAbsolute: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  title: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
