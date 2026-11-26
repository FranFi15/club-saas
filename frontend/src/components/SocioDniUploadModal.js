import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import ButtonDotsLoader from './ButtonDotsLoader';
import WebImageCropModal from './WebImageCropModal';
import { ClubContext } from '../context/ClubContext';
import { ThemeContext } from '../context/ThemeContext';
import { clubApi } from '../utils/api';
import { getToken } from '../utils/storage';
import { uploadFileToClub, iosCompatiblePhotoOptions } from '../utils/uploadMedia';

const DNI_ASPECT = [86, 54];

function DniSlot({
  label,
  value,
  theme,
  colorMarca,
  uploading,
  onPickGallery,
  onPickCamera,
}) {
  return (
    <View style={[styles.slot, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Text style={[styles.slotLabel, { color: theme.text }]}>{label}</Text>
      {value ? (
        <Image source={{ uri: value }} style={styles.preview} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: `${colorMarca}12` }]}>
          <Ionicons name="card-outline" size={28} color={colorMarca} />
        </View>
      )}
      <View style={styles.slotActions}>
        <TouchableOpacity
          style={[styles.smallBtn, { backgroundColor: colorMarca }]}
          onPress={onPickCamera}
          disabled={uploading}
        >
          <Ionicons name="camera-outline" size={16} color="#fff" />
          <Text style={styles.smallBtnTxt}>Cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.smallBtn, { borderColor: colorMarca, borderWidth: 1 }]}
          onPress={onPickGallery}
          disabled={uploading}
        >
          <Ionicons name="images-outline" size={16} color={colorMarca} />
          <Text style={[styles.smallBtnTxt, { color: colorMarca }]}>Galería</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Blocking modal: socio must upload frente + dorso before continuing.
 */
export default function SocioDniUploadModal({ visible, motivo = '', onUploaded }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  const [frente, setFrente] = useState('');
  const [dorso, setDorso] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropUri, setCropUri] = useState(null);
  const [cropSide, setCropSide] = useState('frente');

  const uploadUri = async (uri, filename, mime, side) => {
    setUploading(true);
    setError('');
    try {
      const { url } = await uploadFileToClub(clubData, uri, filename, mime);
      if (side === 'frente') setFrente(url);
      else setDorso(url);
    } catch (e) {
      setError(e.message || 'No se pudo subir la foto.');
    } finally {
      setUploading(false);
    }
  };

  const startPick = async (side, fromCamera) => {
    setError('');
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      setError('Necesitamos permiso para usar la cámara o la galería.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.92,
          ...iosCompatiblePhotoOptions(),
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.92,
          ...iosCompatiblePhotoOptions(),
        });

    if (result.canceled || !result.assets?.[0]) return;
    setCropSide(side);
    setCropUri(result.assets[0].uri);
  };

  const onCropConfirm = async (fileOrMeta) => {
    const side = cropSide;
    setCropUri(null);
    setUploading(true);
    try {
      if (Platform.OS === 'web' && fileOrMeta instanceof Blob) {
        const file =
          fileOrMeta instanceof File
            ? fileOrMeta
            : new File([fileOrMeta], `dni-${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const objectUrl = URL.createObjectURL(file);
        try {
          const { url } = await uploadFileToClub(clubData, objectUrl, file.name, file.type);
          if (side === 'frente') setFrente(url);
          else setDorso(url);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
        return;
      }
      const uri = fileOrMeta?.uri;
      if (!uri) return;
      await uploadUri(
        uri,
        fileOrMeta.filename || `dni-${side}-${Date.now()}.jpg`,
        fileOrMeta.mime || 'image/jpeg',
        side,
      );
    } catch (e) {
      setError(e.message || 'No se pudo subir la foto.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!frente || !dorso || saving) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken('userToken');
      await clubApi.put(
        '/users/me/dni',
        { dniFotoFrente: frente, dniFotoDorso: dorso },
        {
          headers: {
            'x-club-identifier': clubData.urlIdentifier,
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setFrente('');
      setDorso('');
      onUploaded?.();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar el DNI.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!frente && !!dorso && !uploading && !saving;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { backgroundColor: colorMarca }]}>
            <Ionicons name="id-card-outline" size={36} color="#fff" />
            <Text style={styles.heroTitle}>Cargá tu DNI</Text>
            <Text style={styles.heroSub}>
              Para continuar necesitamos el frente y el dorso de tu documento.
            </Text>
          </View>

          {motivo ? (
            <View
              style={[
                styles.motivoBox,
                { backgroundColor: isDarkMode ? '#422006' : '#fff7ed', borderColor: '#f59e0b' },
              ]}
            >
              <Text style={{ color: isDarkMode ? '#fde68a' : '#92400e', fontWeight: '700', fontSize: 13 }}>
                Motivo del club
              </Text>
              <Text style={{ color: isDarkMode ? '#fef3c7' : '#78350f', marginTop: 4, lineHeight: 18 }}>
                {motivo}
              </Text>
            </View>
          ) : null}

          <DniSlot
            label="Frente"
            value={frente}
            theme={theme}
            colorMarca={colorMarca}
            uploading={uploading}
            onPickCamera={() => startPick('frente', true)}
            onPickGallery={() => startPick('frente', false)}
          />
          <DniSlot
            label="Dorso"
            value={dorso}
            theme={theme}
            colorMarca={colorMarca}
            uploading={uploading}
            onPickCamera={() => startPick('dorso', true)}
            onPickGallery={() => startPick('dorso', false)}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.submit,
              { backgroundColor: canSubmit ? colorMarca : theme.border },
            ]}
            disabled={!canSubmit}
            onPress={submit}
          >
            {saving ? (
              <ButtonDotsLoader color="#fff" />
            ) : (
              <Text style={styles.submitTxt}>Enviar DNI</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        <WebImageCropModal
          visible={Boolean(cropUri)}
          imageUri={cropUri}
          aspect={DNI_ASPECT}
          colorMarca={colorMarca}
          title={cropSide === 'frente' ? 'Ajustá el frente del DNI' : 'Ajustá el dorso del DNI'}
          onCancel={() => setCropUri(null)}
          onConfirm={onCropConfirm}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  hero: {
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    alignItems: 'flex-start',
    gap: 8,
  },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
  motivoBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  slot: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  slotLabel: { fontWeight: '700', marginBottom: 8, fontSize: 14 },
  preview: { width: '100%', height: 140, borderRadius: 8 },
  placeholder: {
    height: 120,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  smallBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  error: { color: '#ef4444', marginBottom: 10, fontWeight: '600' },
  submit: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
