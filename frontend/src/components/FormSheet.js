import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AlertHost } from './CustomAlert';

/**
 * Hoja de formulario: vuelve arriba, el contenido scrollea y no tapa el botón.
 */
export default function FormSheet({
  visible,
  onClose,
  title,
  subtitle,
  theme,
  isDarkMode = false,
  children,
  footer = null,
  scroll = true,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const bodyMax = Math.max(240, Math.round(windowHeight * 0.94 - (footer ? 160 : 80)));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={[styles.overlay, { height: windowHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={[
                styles.back,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9' },
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={styles.titles}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {scroll ? (
            <ScrollView
              style={{ maxHeight: bodyMax }}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, { maxHeight: bodyMax }]}>{children}</View>
          )}
          {footer}
        </SafeAreaView>
      </KeyboardAvoidingView>
      <AlertHost active={visible} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '96%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 5,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
});
