import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Image, Animated } from 'react-native';
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

const FADE_MS = 180;

const AlertHostsContext = createContext(null);

export function AlertHostsProvider({ children }) {
  const [hosts, setHosts] = useState([]);
  const [alert, setAlert] = useState(null);
  const pushHost = useCallback((id) => {
    setHosts((list) => (list.includes(id) ? list : [...list, id]));
  }, []);
  const popHost = useCallback((id) => {
    setHosts((list) => list.filter((item) => item !== id));
  }, []);
  const value = useMemo(
    () => ({
      topHostId: hosts[hosts.length - 1] || null,
      alert,
      setAlert,
      pushHost,
      popHost,
    }),
    [hosts, alert, pushHost, popHost],
  );
  return <AlertHostsContext.Provider value={value}>{children}</AlertHostsContext.Provider>;
}

export function AlertHost({ active = true }) {
  const id = useId();
  const hosts = useContext(AlertHostsContext);
  const pushHost = hosts?.pushHost;
  const popHost = hosts?.popHost;

  useEffect(() => {
    if (!pushHost || !popHost || !active) return undefined;
    pushHost(id);
    return () => popHost(id);
  }, [pushHost, popHost, active, id]);

  if (!hosts || !active || hosts.topHostId !== id || !hosts.alert?.visible) return null;
  return <AlertOverlay alert={hosts.alert} />;
}

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

function AlertBody({
  theme,
  clubData,
  colorMarca,
  confirmColor,
  displayTitle,
  message,
  showCancel,
  displayCancel,
  displayConfirm,
  onCancel,
  onConfirm,
}) {
  return (
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
  );
}

export function AlertOverlay({ alert }) {
  if (!alert?.visible) return null;
  return (
    <View style={styles.overlayEmbedded} pointerEvents="auto">
      <AlertBody
        theme={alert.theme}
        clubData={alert.clubData}
        colorMarca={alert.colorMarca}
        confirmColor={alert.confirmColor}
        displayTitle={alert.displayTitle}
        message={alert.message}
        showCancel={alert.showCancel}
        displayCancel={alert.displayCancel}
        displayConfirm={alert.displayConfirm}
        onCancel={alert.onCancel}
        onConfirm={alert.onConfirm}
      />
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
  const hosts = useContext(AlertHostsContext);
  const setAlert = hosts?.setAlert;
  const topHostId = hosts?.topHostId;
  const alertId = useId();
  const opacity = useRef(new Animated.Value(0)).current;
  const handlers = useRef({ onConfirm, onCancel });
  handlers.current = { onConfirm, onCancel };
  const [mounted, setMounted] = useState(visible);

  const colorMarca = clubData?.primaryColor || '#3b82f6';
  const confirmColor = isDanger ? '#dc2626' : colorMarca;
  const displayTitle = friendlyTitle(title);
  const displayConfirm = confirmText === 'Aceptar' ? 'Entendido' : confirmText;
  const displayCancel = cancelText === 'Cancelar' ? 'Volver' : cancelText;

  useEffect(() => {
    if (!setAlert || embedded) return undefined;
    if (!visible) {
      setAlert((current) => (current?.id === alertId ? null : current));
      return undefined;
    }
    setAlert({
      id: alertId,
      visible: true,
      theme,
      clubData,
      colorMarca,
      confirmColor,
      displayTitle,
      message,
      showCancel,
      displayCancel,
      displayConfirm,
      onCancel: () => handlers.current.onCancel?.(),
      onConfirm: () => handlers.current.onConfirm?.(),
    });
    return undefined;
  }, [
    setAlert,
    embedded,
    visible,
    alertId,
    theme,
    clubData,
    colorMarca,
    confirmColor,
    displayTitle,
    message,
    showCancel,
    displayCancel,
    displayConfirm,
  ]);

  useEffect(() => {
    if (!embedded) return undefined;
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      const anim = Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      });
      anim.start();
      return () => anim.stop();
    }
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, embedded, opacity]);

  const bodyProps = {
    theme,
    clubData,
    colorMarca,
    confirmColor,
    displayTitle,
    message,
    showCancel,
    displayCancel,
    displayConfirm,
    onCancel,
    onConfirm,
  };

  if (embedded) {
    if (!mounted) return null;
    return (
      <Animated.View
        style={[styles.overlayEmbedded, { opacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <AlertBody {...bodyProps} />
      </Animated.View>
    );
  }

  if (!visible) return null;
  if (topHostId) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={showCancel ? onCancel : onConfirm}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <AlertBody {...bodyProps} />
      </View>
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
  overlayEmbedded: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 1000,
    elevation: 1000,
  },
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
