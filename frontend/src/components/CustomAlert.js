import React, { useContext } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Image } from 'react-native';
import { ThemeContext } from '../context/ThemeContext';
import { ClubContext } from '../context/ClubContext';

const TITLE_MAP = {
  Error: 'No se pudo completar',
  Éxito: 'Listo',
  Atención: 'Un momento',
  'Acceso denegado': 'No pudimos entrar',
  'Sin permiso': 'No se puede hacer ahora',
  Permiso: 'Necesitamos un permiso',
  'Faltan datos': 'Falta un dato',
  'Falta algo': 'Falta un dato',
  'Motivo requerido': 'Contanos el motivo',
  'Sin cambios': 'Nada para guardar',
  'Sin datos': 'Falta completar',
  'Valor inválido': 'Revisá ese valor',
  'Fecha inválida': 'Revisá la fecha',
  'Horario inválido': 'Revisá el horario',
  'Enlace inválido': 'Revisá el enlace',
  'No se pudo conectar': 'No se pudo conectar',
  'No se pudo iniciar la conexión': 'No se pudo conectar',
  'No se pudo registrar': 'No se pudo registrar',
  'No se pudo ingresar': 'No se pudo ingresar',
};

function friendlyTitle(title) {
  if (!title) return 'Aviso';
  const mapped = TITLE_MAP[title.trim()];
  return mapped || title;
}

const APP_MARK = require('../../assets/H.png');

function ClubMark({ clubData, colorMarca }) {
  const logoUrl = clubData?.logoUrl?.trim();

  if (logoUrl) {
    return (
      <View style={[styles.logoRing, { borderColor: `${colorMarca}33`, backgroundColor: '#fff' }]}>
        <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.logoRing, { borderColor: `${colorMarca}33`, backgroundColor: '#0a0a0a' }]}>
      <Image source={APP_MARK} style={styles.logoImgFill} resizeMode="cover" />
    </View>
  );
}

export default function CustomAlert({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  showCancel = false,
  confirmText = 'Entendido',
  cancelText = 'Volver',
  isDanger = false,
  embedded = false,
}) {
  const { theme } = useContext(ThemeContext);
  const { clubData } = useContext(ClubContext);

  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const confirmColor = isDanger ? '#dc2626' : colorMarca;
  const displayTitle = friendlyTitle(title);
  const displayConfirm = confirmText === 'Aceptar' ? 'Entendido' : confirmText;
  const displayCancel = cancelText === 'Cancelar' ? 'Volver' : cancelText;

  if (!visible) return null;

  const content = (
    <View style={[styles.overlay, embedded && styles.overlayEmbedded]} pointerEvents="box-none">
      <View style={[styles.alertBox, { backgroundColor: theme.surface }]}>
        <View style={styles.logoWrap}>
          <ClubMark clubData={clubData} colorMarca={colorMarca} />
        </View>

        <Text style={[styles.title, { color: theme.text }, !message && { marginBottom: 22 }]}>{displayTitle}</Text>
        {message ? (
          <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
        ) : null}

        <View style={[styles.buttonContainer, !showCancel && styles.buttonSingle]}>
          {showCancel ? (
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
              onPress={onCancel}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>{displayCancel}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: confirmColor }]}
            onPress={onConfirm}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.buttonText, { color: '#ffffff' }]}>{displayConfirm}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (embedded) return content;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={showCancel ? onCancel : onConfirm}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    overflow: 'visible',
  },
  overlayEmbedded: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  alertBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    overflow: 'visible',
  },
  logoWrap: {
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  logoRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  logoImg: { width: 52, height: 52 },
  logoImgFill: { width: 64, height: 64 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center', marginBottom: 22, lineHeight: 22 },
  buttonContainer: { flexDirection: 'row', gap: 10, marginTop: 4 },
  buttonSingle: { justifyContent: 'center' },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  cancelButton: { backgroundColor: 'transparent', borderWidth: 1.5 },
  buttonText: { fontSize: 15, fontWeight: '800' },
});
