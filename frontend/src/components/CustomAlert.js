// src/components/CustomAlert.js
import React, { useContext } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';

export default function CustomAlert({ 
  visible, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  showCancel = false, 
  confirmText = "Aceptar", 
  cancelText = "Cancelar",
  isDanger = false,
  embedded = false,
}) {
  const { theme } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);
  
  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const confirmColor = isDanger ? '#ef4444' : colorMarca;

  if (!visible) return null;

  const content = (
    <View style={[styles.overlay, embedded && styles.overlayEmbedded]}>
      <View style={[styles.alertBox, { backgroundColor: theme.surface }]}>
        
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
        
        <View style={styles.buttonContainer}>
          {showCancel && (
            <TouchableOpacity style={[styles.button, styles.cancelButton, { borderColor: theme.border }]} onPress={onCancel}>
              <Text style={[styles.buttonText, { color: theme.text }]}>{cancelText}</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={[styles.button, { backgroundColor: confirmColor }]} onPress={onConfirm}>
            <Text style={[styles.buttonText, { color: '#ffffff' }]}>{confirmText}</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );

  if (embedded) return content;

  return (
    <Modal visible={visible} transparent animationType="fade">
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlayEmbedded: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  alertBox: { width: '100%', maxWidth: 340, borderRadius: 16, padding: 24, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  message: { fontSize: 16, textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { flex: 1, height: 45, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonText: { fontSize: 16, fontWeight: 'bold' }
});