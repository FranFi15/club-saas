import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { uploadFileToClub } from '../utils/uploadMedia';
import VisitorCameraModal from './VisitorCameraModal';

const CAPTURE_LABELS = {
  person: 'Foto del visitante',
  dni: 'Foto del DNI',
};

/**
 * Captura con cámara in-app (persona o documento) para registro de visitantes.
 */
export default function VisitorIdCaptureField({
  value = '',
  captureKind = '',
  onChange,
  clubData,
  theme,
  colorMarca = '#3b82f6',
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [cameraMode, setCameraMode] = useState(null);

  const openCamera = (mode) => {
    if (disabled || uploading) return;
    setLocalError('');
    setCameraMode(mode);
  };

  const closeCamera = () => {
    setCameraMode(null);
  };

  const handleConfirmPhoto = async (asset) => {
    const mode = cameraMode;
    closeCamera();
    if (!asset?.uri || !mode) return;

    setUploading(true);
    try {
      const filename = asset.fileName || `visitante-${mode}-${Date.now()}.jpg`;
      const mime = asset.mimeType || 'image/jpeg';
      const { url } = await uploadFileToClub(clubData, asset.uri, filename, mime);
      onChange?.(url, mode);
    } catch (e) {
      setLocalError(e.message || 'No se pudo guardar la foto.');
    } finally {
      setUploading(false);
    }
  };

  const clearPhoto = () => {
    if (disabled || uploading) return;
    onChange?.('', '');
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme?.textMuted || '#6b7280' }]}>
        Identificación (opcional)
      </Text>
      <Text style={[styles.hint, { color: theme?.textMuted || '#9ca3af' }]}>
        Sacá una foto del visitante o del DNI con la cámara.
      </Text>

      {value ? (
        <View style={[styles.previewWrap, { borderColor: theme?.border || '#e5e7eb' }]}>
          <Image source={{ uri: value }} style={styles.preview} resizeMode="cover" />
          {captureKind ? (
            <View style={[styles.kindBadge, { backgroundColor: colorMarca }]}>
              <Text style={styles.kindBadgeTxt}>{CAPTURE_LABELS[captureKind] || 'Foto'}</Text>
            </View>
          ) : null}
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: theme?.border }]}
              onPress={() => openCamera('person')}
              disabled={disabled || uploading}
            >
              <Ionicons name="person-outline" size={16} color={colorMarca} />
              <Text style={[styles.actionTxt, { color: theme?.text }]}>Retomar persona</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: theme?.border }]}
              onPress={() => openCamera('dni')}
              disabled={disabled || uploading}
            >
              <Ionicons name="card-outline" size={16} color={colorMarca} />
              <Text style={[styles.actionTxt, { color: theme?.text }]}>Retomar DNI</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearPhoto} disabled={disabled || uploading} style={styles.clearBtn}>
              <Text style={[styles.clearTxt, { color: theme?.textMuted }]}>Quitar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.pickRow}>
          <TouchableOpacity
            style={[styles.pickBtn, { borderColor: colorMarca, backgroundColor: colorMarca + '10' }]}
            onPress={() => openCamera('person')}
            disabled={disabled || uploading}
          >
            {uploading ? (
              <ActivityIndicator color={colorMarca} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={26} color={colorMarca} />
                <Text style={[styles.pickTitle, { color: theme?.text }]}>Foto del visitante</Text>
                <Text style={[styles.pickSub, { color: theme?.textMuted }]}>Rostro</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickBtn, { borderColor: colorMarca, backgroundColor: colorMarca + '10' }]}
            onPress={() => openCamera('dni')}
            disabled={disabled || uploading}
          >
            {uploading ? (
              <ActivityIndicator color={colorMarca} />
            ) : (
              <>
                <Ionicons name="id-card-outline" size={26} color={colorMarca} />
                <Text style={[styles.pickTitle, { color: theme?.text }]}>Foto del DNI</Text>
                <Text style={[styles.pickSub, { color: theme?.textMuted }]}>Documento</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {localError ? <Text style={styles.error}>{localError}</Text> : null}

      <VisitorCameraModal
        visible={!!cameraMode}
        mode={cameraMode || 'person'}
        colorMarca={colorMarca}
        onCancel={closeCamera}
        onConfirm={handleConfirmPhoto}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginLeft: 2 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10, marginLeft: 2 },
  pickRow: { flexDirection: 'row', gap: 10 },
  pickBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    borderStyle: 'dashed',
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
    minHeight: 110,
    justifyContent: 'center',
  },
  pickTitle: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pickSub: { fontSize: 11, textAlign: 'center' },
  previewWrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: { width: '100%', height: 200, backgroundColor: '#f3f4f6' },
  kindBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kindBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  previewActions: { padding: 10, gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionTxt: { fontSize: 13, fontWeight: '600' },
  clearBtn: { alignSelf: 'center', paddingVertical: 4 },
  clearTxt: { fontSize: 13, fontWeight: '600' },
  error: { color: '#dc2626', fontSize: 12, fontWeight: '600', marginTop: 8 },
});
