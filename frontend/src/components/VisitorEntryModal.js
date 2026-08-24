import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubContext } from '../context/ClubContext';
import ProfilePhotoField from './ProfilePhotoField';

/**
 * Alta manual de visitante en control de ingreso.
 */
export default function VisitorEntryModal({
  visible,
  onClose,
  onSubmit,
  theme,
  colorMarca = '#3b82f6',
  saving = false,
}) {
  const { clubData } = useContext(ClubContext);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [dni, setDni] = useState('');
  const [nota, setNota] = useState('');
  const [foto, setFoto] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setNombre('');
    setApellido('');
    setDni('');
    setNota('');
    setFoto('');
    setError('');
  }, [visible]);

  const handleSave = () => {
    const n = nombre.trim();
    const a = apellido.trim();
    const d = dni.trim();
    if (!n || !a || !d) {
      setError('Completá nombre, apellido y DNI.');
      return;
    }
    setError('');
    onSubmit?.({
      nombre: n,
      apellido: a,
      dni: d,
      nota: nota.trim(),
      foto: foto.trim(),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PressableClose onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Registrar visitante</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={24} color={theme.icon} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Persona que no es socio del club pero necesita ingresar.
          </Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}
          >
            <ProfilePhotoField
              value={foto}
              onChange={setFoto}
              clubData={clubData}
              colorMarca={colorMarca}
              theme={theme}
              nombre={nombre}
              apellido={apellido}
              size={72}
              label="Foto (opcional)"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>Nombre *</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={nombre}
              onChangeText={setNombre}
              placeholder="Nombre"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>Apellido *</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={apellido}
              onChangeText={setApellido}
              placeholder="Apellido"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>DNI *</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={dni}
              onChangeText={setDni}
              placeholder="Documento"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>Motivo / nota (opcional)</Text>
            <TextInput
              style={[
                styles.input,
                styles.nota,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={nota}
              onChangeText={setNota}
              placeholder="Ej. visita a administración, proveedor, reunión…"
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colorMarca, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Registrar visitante"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={18} color="#fff" />
                  <Text style={styles.saveTxt}>Registrar ingreso</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PressableClose({ onPress }) {
  return <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onPress} />;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 28,
    zIndex: 2,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  form: { paddingBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    marginBottom: 12,
  },
  nota: { minHeight: 88, paddingTop: 12 },
  error: { color: '#dc2626', fontWeight: '600', marginBottom: 10 },
  saveBtn: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
