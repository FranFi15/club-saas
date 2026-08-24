import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MODE_COPY = {
  person: {
    title: 'Foto del visitante',
    hint: 'Encuadrá el rostro y tocá capturar.',
  },
  dni: {
    title: 'Foto del DNI',
    hint: 'Encuadrá el documento completo y tocá capturar.',
  },
};

/**
 * Cámara in-app con textos en español (evita Use Photo / Retake del sistema).
 */
export default function VisitorCameraModal({
  visible,
  mode = 'person',
  colorMarca = '#3b82f6',
  onCancel,
  onConfirm,
}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState(mode === 'person' ? 'front' : 'back');
  const [previewUri, setPreviewUri] = useState('');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPreviewUri('');
      setCapturing(false);
      return;
    }
    setPreviewUri('');
    setCapturing(false);
    setFacing(mode === 'person' ? 'front' : 'back');
  }, [visible, mode]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const copy = MODE_COPY[mode] || MODE_COPY.person;

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || previewUri) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.88,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) setPreviewUri(photo.uri);
    } catch {
      setPreviewUri('');
    } finally {
      setCapturing(false);
    }
  };

  const handleRetake = () => setPreviewUri('');

  const handleConfirm = () => {
    if (!previewUri) return;
    onConfirm?.({
      uri: previewUri,
      fileName: `visitante-${mode}-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    });
  };

  if (!visible) return null;

  const granted = !!permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onCancel} style={styles.topBtn} accessibilityLabel="Cancelar">
            <Ionicons name="close" size={26} color="#fff" />
            <Text style={styles.topBtnTxt}>Cancelar</Text>
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.hint}>{copy.hint}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            style={styles.topBtn}
            disabled={!!previewUri}
            accessibilityLabel="Cambiar cámara"
          >
            <Ionicons name="camera-reverse-outline" size={26} color={previewUri ? '#6b7280' : '#fff'} />
            <Text style={[styles.topBtnTxt, previewUri && { color: '#6b7280' }]}>Girar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stage}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : !granted ? (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={48} color="#9ca3af" />
              <Text style={styles.permissionTxt}>Necesitamos acceso a la cámara para sacar la foto.</Text>
              <TouchableOpacity
                style={[styles.permissionBtn, { backgroundColor: colorMarca }]}
                onPress={requestPermission}
              >
                <Text style={styles.permissionBtnTxt}>Permitir cámara</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />
              <View style={styles.guide} pointerEvents="none">
                <View
                  style={[
                    styles.guideFrame,
                    mode === 'dni' ? styles.guideDni : styles.guidePerson,
                    { borderColor: 'rgba(255,255,255,0.85)' },
                  ]}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.bottomBar}>
          {previewUri ? (
            <>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleRetake}>
                <Ionicons name="refresh-outline" size={20} color="#fff" />
                <Text style={styles.secondaryTxt}>Volver a sacar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colorMarca }]}
                onPress={handleConfirm}
              >
                <Ionicons name="checkmark" size={22} color="#fff" />
                <Text style={styles.primaryTxt}>Usar foto</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.shutterOuter, !granted && { opacity: 0.4 }]}
              onPress={handleCapture}
              disabled={!granted || capturing}
              accessibilityLabel="Capturar"
            >
              <View style={styles.shutterInner}>
                {capturing ? <ActivityIndicator color="#111" /> : null}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  topBtn: { alignItems: 'center', minWidth: 64, gap: 2 },
  topBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  topCenter: { flex: 1, alignItems: 'center', paddingTop: 2 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: 2 },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  guide: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  guideFrame: { borderWidth: 2, borderRadius: 12 },
  guidePerson: { width: '62%', aspectRatio: 3 / 4 },
  guideDni: { width: '86%', aspectRatio: 1.6 },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  permissionTxt: { color: '#e5e7eb', textAlign: 'center', lineHeight: 20, fontSize: 15 },
  permissionBtn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  permissionBtnTxt: { color: '#fff', fontWeight: '800' },
  bottomBar: {
    minHeight: 110,
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  primaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
