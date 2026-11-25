import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import ButtonDotsLoader from './ButtonDotsLoader';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';
import WebImageCropModal from './WebImageCropModal';
import { uploadFileToClub, imageFromPickerAsset, iosCompatiblePhotoOptions } from '../utils/uploadMedia';

/**
 * Selector y vista previa de foto de perfil (sube a Cloudinary vía /api/upload).
 * With `cropBeforeUpload`, opens pan/zoom crop (useful for DNI) before upload.
 */
export default function ProfilePhotoField({
  value = '',
  onChange,
  clubData,
  colorMarca = '#3b82f6',
  theme,
  nombre = '',
  apellido = '',
  size = 96,
  label = 'Foto de perfil',
  /** null = no forced crop; default square for profile. */
  aspect = [1, 1],
  /** Use WebImageCropModal (pan/zoom) instead of system crop. */
  cropBeforeUpload = false,
  cropTitle = 'Ajustar imagen',
}) {
  const [uploading, setUploading] = useState(false);
  const [cropUri, setCropUri] = useState(null);

  const uploadUri = async (uri, filename, mime) => {
    setUploading(true);
    try {
      const { url } = await uploadFileToClub(clubData, uri, filename, mime);
      onChange?.(url);
    } catch (e) {
      console.log('Profile photo upload error', e);
    } finally {
      setUploading(false);
    }
  };

  const pickAndUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const useCropModal = cropBeforeUpload || (Platform.OS === 'web' && aspect != null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: !useCropModal && aspect != null,
      ...(!useCropModal && aspect != null ? { aspect } : {}),
      quality: 0.92,
      ...iosCompatiblePhotoOptions(),
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (useCropModal) {
      setCropUri(asset.uri);
      return;
    }

    const uri = asset.uri;
    const { filename, mime } = imageFromPickerAsset(asset, uri);
    await uploadUri(uri, filename, mime);
  };

  const onCropConfirm = async (fileOrMeta) => {
    setCropUri(null);
    setUploading(true);
    try {
      if (Platform.OS === 'web' && fileOrMeta instanceof Blob) {
        const file =
          fileOrMeta instanceof File
            ? fileOrMeta
            : new File([fileOrMeta], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const objectUrl = URL.createObjectURL(file);
        try {
          const { url } = await uploadFileToClub(clubData, objectUrl, file.name, file.type);
          onChange?.(url);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
        return;
      }
      const uri = fileOrMeta?.uri;
      if (!uri) return;
      await uploadUri(uri, fileOrMeta.filename || `crop-${Date.now()}.jpg`, fileOrMeta.mime || 'image/jpeg');
    } catch (e) {
      console.log('Profile photo crop upload error', e);
      setUploading(false);
    }
  };

  const clearPhoto = () => onChange?.('');

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme?.textMuted || '#6b7280' }]}>{label}</Text>
      <View style={styles.row}>
        <UserAvatar
          nombre={nombre}
          apellido={apellido}
          fotoPerfil={value}
          size={size}
          colorMarca={colorMarca}
        />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colorMarca }]}
            onPress={pickAndUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ButtonDotsLoader color={'#fff'} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={styles.btnTxt}>{value ? 'Cambiar' : 'Elegir foto'}</Text>
              </>
            )}
          </TouchableOpacity>
          {value ? (
            <TouchableOpacity style={styles.clearBtn} onPress={clearPhoto} disabled={uploading}>
              <Text style={[styles.clearTxt, { color: theme?.textMuted || '#6b7280' }]}>Quitar foto</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <WebImageCropModal
        visible={Boolean(cropUri)}
        imageUri={cropUri}
        aspect={aspect && aspect[0] && aspect[1] ? aspect : [1, 1]}
        colorMarca={colorMarca}
        title={cropTitle}
        onCancel={() => setCropUri(null)}
        onConfirm={onCropConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 8, fontWeight: '600', marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actions: { flex: 1, gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  clearTxt: { fontSize: 13, fontWeight: '600' },
});
